import {
  STAGES,
  type Tier,
  type Stage,
  type InteractionType,
  type Direction,
  type ActionOwner,
} from "@/lib/db/types";
import { getAnthropic, CLAUDE_MODEL } from "./client";

// ---------------------------------------------------------------------------
// Types returned by extraction
// ---------------------------------------------------------------------------
export interface ExtractedContact {
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  vertical: string | null;
}

export interface ExtractedInteraction {
  occurred_at: string; // ISO 8601
  type: InteractionType;
  summary: string;
  warmth: number; // 1-5
  warmth_justification: string;
  direction: Direction;
}

export interface ExtractedActionItem {
  description: string;
  owner: ActionOwner;
  due_date: string | null; // ISO date (YYYY-MM-DD) or null
}

export interface ExtractionResult {
  /** null when the user already picked an existing contact. */
  contact: ExtractedContact | null;
  interaction: ExtractedInteraction;
  action_items: ExtractedActionItem[];
  suggested_tier: Tier;
  suggested_tier_justification: string;
  suggested_stage: Stage;
}

export class ExtractionParseError extends Error {
  constructor(
    message: string,
    readonly rawModelText: string,
  ) {
    super(message);
    this.name = "ExtractionParseError";
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
const INTERACTION_TYPES: InteractionType[] = [
  "coffee_chat",
  "call",
  "email",
  "event",
  "note",
];
const DIRECTIONS: Direction[] = ["outbound", "inbound", "mutual"];

export const EXTRACTION_SYSTEM_PROMPT = `You are the extraction engine for a personal CRM used for MBA recruiting networking. You convert a messy, possibly dictated note about a networking interaction into a single STRICT JSON object.

Output ONLY the JSON object. No prose, no markdown, no code fences. The JSON MUST match exactly this shape:

{
  "contact": {
    "name": string,
    "company": string | null,
    "title": string | null,
    "email": string | null,
    "linkedin_url": string | null,
    "vertical": string | null
  } | null,
  "interaction": {
    "occurred_at": string,            // ISO 8601 datetime
    "type": ${JSON.stringify(INTERACTION_TYPES)}[one of],
    "summary": string,               // 2-3 sentences, third person, factual
    "warmth": number,                // integer 1 (cold) to 5 (very warm)
    "warmth_justification": string,  // one short line explaining the warmth score
    "direction": ${JSON.stringify(DIRECTIONS)}[one of]
  },
  "action_items": [
    { "description": string, "owner": "me" | "them", "due_date": string | null }
  ],
  "suggested_tier": "priority" | "warm" | "background",
  "suggested_tier_justification": string, // one short line
  "suggested_stage": ${JSON.stringify(STAGES)}[one of]
}

RULES:
- "contact" describes the OTHER person, never the note-taker ("me"). If CONTACT_ALREADY_PICKED is true, set "contact" to null.
- "direction": "outbound" if the note-taker initiated, "inbound" if the other person initiated, "mutual" for events/mutual intros.
- "occurred_at": resolve relative times against NOW given in the user message. "yesterday" = the day before NOW, "this morning" = today's morning, etc. If no time is mentioned, use NOW.
- "summary": third person, e.g. "Discussed the platform PM role and her path from banking." Never first person.
- ACTION ITEMS ARE CRITICAL. Any promise, offer, or commitment to do something later MUST become an action item:
    * Something the OTHER person will do => owner "them".
    * Something the note-taker will do => owner "me".
  Extract due dates when stated ("by Friday", "next week"); otherwise due_date is null.
- If a field is unknown, use null (for strings) — do not invent emails, titles, or URLs.

EXAMPLES OF ACTION-ITEM EXTRACTION (input snippet => resulting action_items):

Input: "Ava said she'd introduce me to her skip-level next week."
=> [{ "description": "Ava to introduce me to her skip-level", "owner": "them", "due_date": null }]

Input: "I promised I'd send her the product deck by Friday."
=> [{ "description": "Send Ava the product deck", "owner": "me", "due_date": "<the coming Friday as YYYY-MM-DD>" }]

Input: "She'll loop in her recruiter, and I need to follow up with a thank-you note."
=> [
     { "description": "Loop in her recruiter", "owner": "them", "due_date": null },
     { "description": "Send a thank-you note", "owner": "me", "due_date": null }
   ]`;

export function buildUserPrompt(input: {
  rawText: string;
  now: Date;
  contactPicked: boolean;
}): string {
  return [
    `NOW: ${input.now.toISOString()}`,
    `CONTACT_ALREADY_PICKED: ${input.contactPicked}`,
    "",
    "RAW_NOTE:",
    input.rawText,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Defensive parsing
// ---------------------------------------------------------------------------
function stripToJson(text: string): string {
  let t = text.trim();
  // Strip ```json ... ``` or ``` ... ``` fences.
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // Grab the outermost {...} in case the model added stray text.
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t;
}

function asStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t.toLowerCase() === "null" ? null : t;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

function normalizeDateTime(v: unknown, now: Date): string {
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return now.toISOString();
}

function normalizeDate(v: unknown): string | null {
  const s = asStringOrNull(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Parse + normalize a raw model response into an ExtractionResult.
 * Throws ExtractionParseError when the JSON is unrecoverable, so callers can
 * hand the user's original text back without losing it.
 */
export function parseExtraction(rawModelText: string, now: Date = new Date()): ExtractionResult {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(stripToJson(rawModelText)) as Record<string, unknown>;
  } catch {
    throw new ExtractionParseError("Model did not return valid JSON.", rawModelText);
  }
  if (typeof obj !== "object" || obj === null) {
    throw new ExtractionParseError("Model JSON was not an object.", rawModelText);
  }

  const interactionRaw = obj.interaction;
  if (typeof interactionRaw !== "object" || interactionRaw === null) {
    throw new ExtractionParseError("Missing interaction in model JSON.", rawModelText);
  }
  const it = interactionRaw as Record<string, unknown>;

  let contact: ExtractedContact | null = null;
  if (obj.contact && typeof obj.contact === "object") {
    const c = obj.contact as Record<string, unknown>;
    const name = asStringOrNull(c.name);
    if (name) {
      contact = {
        name,
        company: asStringOrNull(c.company),
        title: asStringOrNull(c.title),
        email: asStringOrNull(c.email),
        linkedin_url: asStringOrNull(c.linkedin_url),
        vertical: asStringOrNull(c.vertical),
      };
    }
  }

  const warmthNum = Math.round(Number(it.warmth));
  const warmth = Number.isFinite(warmthNum) ? Math.min(5, Math.max(1, warmthNum)) : 3;

  const interaction: ExtractedInteraction = {
    occurred_at: normalizeDateTime(it.occurred_at, now),
    type: oneOf<InteractionType>(it.type, INTERACTION_TYPES, "note"),
    summary: asStringOrNull(it.summary) ?? "",
    warmth,
    warmth_justification: asStringOrNull(it.warmth_justification) ?? "",
    direction: oneOf<Direction>(it.direction, DIRECTIONS, "outbound"),
  };

  const actionsRaw = Array.isArray(obj.action_items) ? obj.action_items : [];
  const action_items: ExtractedActionItem[] = actionsRaw
    .map((a): ExtractedActionItem | null => {
      if (typeof a !== "object" || a === null) return null;
      const row = a as Record<string, unknown>;
      const description = asStringOrNull(row.description);
      if (!description) return null;
      return {
        description,
        owner: oneOf<ActionOwner>(row.owner, ["me", "them"], "me"),
        due_date: normalizeDate(row.due_date),
      };
    })
    .filter((a): a is ExtractedActionItem => a !== null);

  return {
    contact,
    interaction,
    action_items,
    suggested_tier: oneOf<Tier>(obj.suggested_tier, ["priority", "warm", "background"], "warm"),
    suggested_tier_justification: asStringOrNull(obj.suggested_tier_justification) ?? "",
    suggested_stage: oneOf<Stage>(obj.suggested_stage, STAGES, "contacted"),
  };
}

// ---------------------------------------------------------------------------
// Extraction call (with dependency injection for tests)
// ---------------------------------------------------------------------------
export interface ExtractInput {
  rawText: string;
  contactPicked: boolean;
  now?: Date;
}

/** Injectable message creator so tests can mock the API. Returns raw model text. */
export type CreateMessage = (args: {
  system: string;
  userPrompt: string;
}) => Promise<string>;

const defaultCreateMessage: CreateMessage = async ({ system, userPrompt }) => {
  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    temperature: 0,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  return res.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
};

/**
 * Send raw notes to Claude and return a normalized ExtractionResult.
 * Throws ExtractionParseError on unrecoverable output (caller preserves input).
 */
export async function extractInteraction(
  input: ExtractInput,
  createMessage: CreateMessage = defaultCreateMessage,
): Promise<ExtractionResult> {
  const now = input.now ?? new Date();
  const userPrompt = buildUserPrompt({
    rawText: input.rawText,
    now,
    contactPicked: input.contactPicked,
  });
  const rawModelText = await createMessage({
    system: EXTRACTION_SYSTEM_PROMPT,
    userPrompt,
  });
  return parseExtraction(rawModelText, now);
}
