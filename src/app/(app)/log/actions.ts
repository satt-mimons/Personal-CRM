"use server";

import { redirect } from "next/navigation";
import { extractInteraction, ExtractionParseError } from "@/lib/llm/extract";
import { draftThankYouEmail } from "@/lib/llm/thank-you";
import { transcribeAudio, TranscriptionError } from "@/lib/llm/transcribe";
import {
  findPossibleDuplicates,
  upsertContactByIdentity,
  updateContactStage,
  getContactsForPicker,
  getContactById,
  updateContactEmailIfEmpty,
} from "@/lib/db/contacts";
import { insertInteraction, getInteractionById } from "@/lib/db/interactions";
import { insertActionItems } from "@/lib/db/action-items";
import {
  checkTranscriptionQuota,
  recordTranscriptionUsage,
} from "@/lib/db/transcription-usage";
import {
  isGmailConnected,
} from "@/lib/db/gmail-connections";
import { dbContext } from "@/lib/db/session";
import {
  createThankYouDraft,
  GmailAuthError,
  GMAIL_COMPOSE_SCOPE,
} from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_RECORDING_SECONDS,
  type ExtractResponse,
  type SavePayload,
  type SaveResponse,
  type TranscribeResponse,
} from "./types";

/** Only allow safe, in-app relative redirect targets. */
function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/";
}

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
): Promise<SaveResponse> {
  let contactId: string;
  let interactionId: string;
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
    interactionId = interaction.id;

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

  const contact = await getContactById(contactId);
  return {
    ok: true,
    contactId,
    interactionId,
    contactName: contact?.name ?? payload.contact?.name ?? "Contact",
    company: contact?.company ?? payload.contact?.company ?? null,
    email: contact?.email ?? payload.contact?.email ?? null,
    interactionType: payload.interaction.type,
    summary: payload.interaction.summary,
    rawNotes: payload.rawText,
  };
}

export async function draftThankYouAction(input: {
  contactId: string;
  interactionId: string;
  summary: string;
  rawNotes: string;
  interactionType: SavePayload["interaction"]["type"];
  contactName: string;
  company: string | null;
}): Promise<
  | { ok: true; subject: string; body: string; gmailConnected: boolean }
  | { ok: false; error: string }
> {
  try {
    const contact = await getContactById(input.contactId);
    const { supabase } = await dbContext();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const meta = user?.user_metadata as
      | { full_name?: string; name?: string }
      | undefined;
    const full = meta?.full_name ?? meta?.name ?? "";
    const senderFirstName = full.trim().split(/\s+/)[0] || null;

    const draft = await draftThankYouEmail({
      contactName: input.contactName || contact?.name || "there",
      company: input.company ?? contact?.company ?? null,
      title: contact?.title ?? null,
      summary: input.summary,
      rawNotes: input.rawNotes,
      interactionType: input.interactionType,
      senderFirstName,
    });

    return {
      ok: true,
      subject: draft.subject,
      body: draft.body,
      gmailConnected: await isGmailConnected(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't draft thank-you.",
    };
  }
}

export async function gmailConnectionStatusAction(): Promise<{
  connected: boolean;
}> {
  try {
    return { connected: await isGmailConnected() };
  } catch {
    return { connected: false };
  }
}

/**
 * Incremental Google OAuth for gmail.compose only. Does not change login
 * scopes. After consent, /auth/callback persists the refresh token.
 */
export async function connectGmailAction(returnPath: string): Promise<void> {
  const next = safeNext(returnPath);
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}&gmail=1`,
      scopes: GMAIL_COMPOSE_SCOPE,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    },
  });

  if (error) {
    redirect(
      `/log?error=${encodeURIComponent(error.message || "Gmail connect failed")}`,
    );
  }
  if (data.url) {
    redirect(data.url);
  }
}

export async function openThankYouInGmailAction(input: {
  contactId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<
  | { ok: true; gmailUrl: string }
  | { ok: false; error: string; needsConnect?: boolean }
> {
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, error: "Add a valid email address first." };
  }
  if (!input.subject.trim() || !input.body.trim()) {
    return { ok: false, error: "Subject and body can't be empty." };
  }

  try {
    if (!(await isGmailConnected())) {
      return {
        ok: false,
        error: "Connect Gmail to create a draft.",
        needsConnect: true,
      };
    }

    await updateContactEmailIfEmpty(input.contactId, to);
    const draft = await createThankYouDraft({
      to,
      subject: input.subject,
      body: input.body,
    });
    return { ok: true, gmailUrl: draft.gmailUrl };
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return {
        ok: false,
        error: err.message,
        needsConnect: err.needsReconnect,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't open Gmail draft.",
    };
  }
}

/** Load thank-you context when resuming after Gmail OAuth. */
export async function loadThankYouContextAction(input: {
  contactId: string;
  interactionId: string;
}): Promise<
  | {
      ok: true;
      contactName: string;
      company: string | null;
      email: string | null;
      summary: string;
      rawNotes: string;
      interactionType: SavePayload["interaction"]["type"];
      gmailConnected: boolean;
    }
  | { ok: false; error: string }
> {
  try {
    const [contact, interaction] = await Promise.all([
      getContactById(input.contactId),
      getInteractionById(input.interactionId),
    ]);
    if (!contact || !interaction) {
      return { ok: false, error: "Couldn't find that interaction." };
    }
    if (interaction.contact_id !== contact.id) {
      return { ok: false, error: "Interaction doesn't match contact." };
    }
    const type = interaction.type;
    if (!type) {
      return { ok: false, error: "Interaction has no type." };
    }
    return {
      ok: true,
      contactName: contact.name,
      company: contact.company,
      email: contact.email,
      summary: interaction.summary ?? "",
      rawNotes: interaction.raw_notes ?? "",
      interactionType: type,
      gmailConnected: await isGmailConnected(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Load failed.",
    };
  }
}

