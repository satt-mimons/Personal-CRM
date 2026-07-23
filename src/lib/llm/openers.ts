import { getAnthropic, CLAUDE_MODEL } from "./client";
import type { NudgeAction } from "@/lib/nudge/engine";

export interface OpenerContext {
  contact_id: string;
  name: string;
  company: string | null;
  last_summary: string | null;
  open_thread: string | null; // e.g. open action descriptions
  reason: string;
}

/**
 * One batched LLM call that drafts warm, specific openers for up to 3 nudges.
 * Returns a map of contact_id → opener. Never auto-sends — suggestion only.
 */
export async function draftSuggestedOpeners(
  contexts: OpenerContext[],
): Promise<Record<string, string>> {
  if (contexts.length === 0) return {};

  const anthropic = getAnthropic();
  const payload = contexts.map((c, i) => ({
    index: i,
    contact_id: c.contact_id,
    name: c.name,
    company: c.company,
    last_summary: c.last_summary,
    open_thread: c.open_thread,
    reason: c.reason,
  }));

  const system = `You draft short networking follow-up openers for an MBA recruiting CRM.
Return ONLY a JSON array of objects: [{ "contact_id": string, "opener": string }].
No markdown, no prose.

Rules for each opener:
- 1–2 sentences max
- Warm, specific, reference the last interaction summary and any open thread when present
- Zero corporate filler (no "I hope this email finds you well", "circle back", "synergy")
- First person from the note-taker's perspective
- Do not invent facts that aren't in the input`;

  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    temperature: 0.4,
    system,
    messages: [
      {
        role: "user",
        content: `Draft openers for these contacts:\n${JSON.stringify(payload)}`,
      },
    ],
  });

  const raw = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const out: Record<string, string> = {};
  try {
    const first = raw.indexOf("[");
    const last = raw.lastIndexOf("]");
    const json = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
    const arr = JSON.parse(json) as Array<{ contact_id?: string; opener?: string }>;
    for (const row of arr) {
      if (row.contact_id && typeof row.opener === "string" && row.opener.trim()) {
        out[row.contact_id] = row.opener.trim();
      }
    }
  } catch {
    // Soft-fail: digest still sends without openers.
  }
  return out;
}

/** Attach openers to the top N nudges (mutates a copy). */
export async function attachOpeners(
  nudges: NudgeAction[],
  contextsById: Map<string, OpenerContext>,
  topN = 3,
): Promise<NudgeAction[]> {
  const top = nudges.slice(0, topN);
  const contexts = top
    .map((n) => contextsById.get(n.contact_id))
    .filter((c): c is OpenerContext => Boolean(c));

  let openers: Record<string, string> = {};
  try {
    openers = await draftSuggestedOpeners(contexts);
  } catch {
    openers = {};
  }

  return nudges.map((n, i) =>
    i < topN && openers[n.contact_id]
      ? { ...n, suggested_opener: openers[n.contact_id] }
      : n,
  );
}
