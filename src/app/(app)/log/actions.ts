"use server";

import { redirect } from "next/navigation";
import { extractInteraction, ExtractionParseError } from "@/lib/llm/extract";
import { transcribeAudio, TranscriptionError } from "@/lib/llm/transcribe";
import {
  findPossibleDuplicates,
  upsertContactByIdentity,
  updateContactStage,
  getContactsForPicker,
} from "@/lib/db/contacts";
import { insertInteraction } from "@/lib/db/interactions";
import { insertActionItems } from "@/lib/db/action-items";
import {
  checkTranscriptionQuota,
  recordTranscriptionUsage,
} from "@/lib/db/transcription-usage";
import {
  MAX_RECORDING_SECONDS,
  type ExtractResponse,
  type SavePayload,
  type TranscribeResponse,
} from "./types";

/** Reject empty or gibberish input before spending an API call. */
function isMeaningful(text: string): boolean {
  const trimmed = text.trim();
  const letters = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  const words = trimmed.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  return trimmed.length >= 12 && words.length >= 3 && letters >= 8;
}

/**
 * Seed Whisper with names it is likely to hear. The picked contact goes first
 * so it survives the prompt-length truncation in buildVocabularyPrompt.
 */
async function vocabularyFor(contactId: string | null): Promise<string[]> {
  let contacts;
  try {
    contacts = await getContactsForPicker();
  } catch {
    return []; // Biasing is a nice-to-have; never fail the transcription for it.
  }
  const picked = contactId ? contacts.find((c) => c.id === contactId) : null;
  const ordered = picked
    ? [picked, ...contacts.filter((c) => c.id !== picked.id)]
    : contacts;
  return ordered.flatMap((c) => [c.name, c.company ?? ""]);
}

/**
 * Transcribe a recording into raw text for the capture textarea. Used only by
 * browsers where the in-browser Web Speech API is unavailable or unreliable
 * (iOS Safari, Firefox) — everywhere else transcription never leaves the client.
 */
export async function transcribeAction(
  formData: FormData,
): Promise<TranscribeResponse> {
  const audio = formData.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return { ok: false, error: "No audio was recorded.", retryable: false };
  }

  // Trust whichever duration is larger: a client under-reporting its clip
  // length must not be able to slip past the quota. ~3KB/s at 24kbps mono.
  const claimed = Number(formData.get("durationSeconds"));
  const estimatedSeconds = Math.max(
    Number.isFinite(claimed) ? claimed : 0,
    audio.size / 3000,
  );

  if (estimatedSeconds > MAX_RECORDING_SECONDS * 1.5) {
    return { ok: false, error: "That recording is too long.", retryable: false };
  }

  let quota;
  try {
    quota = await checkTranscriptionQuota(estimatedSeconds);
  } catch {
    return {
      ok: false,
      error: "Couldn't check your voice-note allowance. Try again.",
      retryable: true,
    };
  }
  if (!quota.allowed) {
    return {
      ok: false,
      error:
        "You've hit today's voice-note limit. Type your notes below, or record again tomorrow.",
      retryable: false,
    };
  }

  const contactIdRaw = formData.get("contactId");
  const contactId = typeof contactIdRaw === "string" && contactIdRaw ? contactIdRaw : null;

  let text: string;
  try {
    text = await transcribeAudio({
      audio,
      vocabulary: await vocabularyFor(contactId),
    });
  } catch (err) {
    if (err instanceof TranscriptionError) {
      return { ok: false, error: err.message, retryable: err.retryable };
    }
    return {
      ok: false,
      error: "Transcription failed. Your recording is still here — try again.",
      retryable: true,
    };
  }

  // Bill only successful calls, and never let a metering failure lose the text.
  try {
    await recordTranscriptionUsage(estimatedSeconds);
  } catch {
    // Intentionally ignored.
  }

  if (text.trim() === "") {
    return {
      ok: false,
      error: "Didn't catch anything — check your mic and try again.",
      retryable: true,
    };
  }
  return { ok: true, text };
}

export async function extractAction(input: {
  rawText: string;
  contactId: string | null;
}): Promise<ExtractResponse> {
  const rawText = input.rawText ?? "";
  if (!isMeaningful(rawText)) {
    return {
      ok: false,
      error:
        "Add a bit more detail — who you talked to and what you discussed.",
      rawText,
    };
  }

  let extraction;
  try {
    extraction = await extractInteraction({
      rawText,
      contactPicked: Boolean(input.contactId),
    });
  } catch (err) {
    if (err instanceof ExtractionParseError) {
      return {
        ok: false,
        error:
          "Couldn't read the extraction. Your notes are safe below — try again.",
        rawText,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Extraction failed.",
      rawText,
    };
  }

  const duplicates = extraction.contact
    ? (
        await findPossibleDuplicates({
          name: extraction.contact.name,
          company: extraction.contact.company,
          email: extraction.contact.email,
        })
      ).map((m) => ({
        id: m.contact.id,
        name: m.contact.name,
        company: m.contact.company,
        score: m.score,
        reason: m.reason,
      }))
    : [];

  return { ok: true, extraction, duplicates };
}

export async function saveInteractionAction(
  payload: SavePayload,
): Promise<{ ok: false; error: string } | void> {
  let contactId: string;
  try {
    if (payload.existingContactId) {
      contactId = payload.existingContactId;
      await updateContactStage(contactId, payload.stage);
    } else if (payload.contact) {
      const c = payload.contact;
      const res = await upsertContactByIdentity({
        name: c.name,
        company: c.company,
        title: c.title,
        email: c.email,
        linkedin_url: c.linkedin_url,
        vertical: c.vertical,
        tier: c.tier,
        stage: payload.stage,
      });
      contactId = res.id;
      if (!res.created) await updateContactStage(contactId, payload.stage);
    } else {
      return { ok: false, error: "No contact to attach this interaction to." };
    }

    const interaction = await insertInteraction({
      contact_id: contactId,
      occurred_at: payload.interaction.occurred_at,
      type: payload.interaction.type,
      raw_notes: payload.rawText,
      summary: payload.interaction.summary,
      warmth: payload.interaction.warmth,
      direction: payload.interaction.direction,
    });

    await insertActionItems(
      payload.actionItems
        .filter((a) => a.description.trim() !== "")
        .map((a) => ({
          contact_id: contactId,
          interaction_id: interaction.id,
          description: a.description.trim(),
          owner: a.owner,
          due_date: a.due_date,
        })),
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed.",
    };
  }

  redirect(`/contacts/${contactId}`);
}
