import { getAnthropic, CLAUDE_MODEL } from "./client";
import type { InteractionType } from "@/lib/db/types";

export interface ThankYouDraftInput {
  contactName: string;
  company: string | null;
  title: string | null;
  summary: string;
  rawNotes: string;
  interactionType: InteractionType;
  /** Sender first name when known (from auth metadata). */
  senderFirstName?: string | null;
}

export interface ThankYouDraft {
  subject: string;
  body: string;
}

/**
 * Draft a short, personable thank-you email from a logged interaction.
 * Soft-fails to empty strings so the UI can still let the user write.
 */
export async function draftThankYouEmail(
  input: ThankYouDraftInput,
): Promise<ThankYouDraft> {
  const anthropic = getAnthropic();

  const system = `You draft thank-you emails after networking conversations (MBA recruiting).
Return ONLY a JSON object: { "subject": string, "body": string }.
No markdown, no prose outside JSON.

Rules for the body:
- Structure: one opening line, then one short paragraph (3–4 sentences total across the whole body)
- Personalize with 1–2 concrete details from the conversation notes/summary
- Direct and personable; first person from the note-taker
- Do NOT invent facts that aren't in the input
- Ban AI/corporate filler: no "I hope this email finds you well", "I wanted to reach out", "circle back", "synergy", "great chatting", "as discussed", "leverage", "delighted", or stacked adjectives
- No sign-off block beyond a simple first name on its own last line when senderFirstName is provided; otherwise end after the paragraph (no "Best regards" / "Warmly" / "Cheers")

Rules for the subject:
- Short and specific (e.g. "Thanks for the coffee — [topic]")
- Not generic ("Following up", "Thank you", "Great to connect")`;

  const payload = {
    contact_name: input.contactName,
    company: input.company,
    title: input.title,
    interaction_type: input.interactionType,
    summary: input.summary,
    raw_notes: input.rawNotes,
    sender_first_name: input.senderFirstName ?? null,
  };

  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      temperature: 0.4,
      system,
      messages: [
        {
          role: "user",
          content: `Draft a thank-you email from this context:\n${JSON.stringify(payload)}`,
        },
      ],
    });

    const raw = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    const json = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
    const parsed = JSON.parse(json) as { subject?: unknown; body?: unknown };
    const subject =
      typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    return { subject, body };
  } catch {
    return { subject: "", body: "" };
  }
}
