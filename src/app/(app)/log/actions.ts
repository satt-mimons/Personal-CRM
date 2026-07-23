"use server";

import { redirect } from "next/navigation";
import { extractInteraction, ExtractionParseError } from "@/lib/llm/extract";
import {
  findPossibleDuplicates,
  upsertContactByIdentity,
  updateContactStage,
} from "@/lib/db/contacts";
import { insertInteraction } from "@/lib/db/interactions";
import { insertActionItems } from "@/lib/db/action-items";
import type { ExtractResponse, SavePayload } from "./types";

/** Reject empty or gibberish input before spending an API call. */
function isMeaningful(text: string): boolean {
  const trimmed = text.trim();
  const letters = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  const words = trimmed.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  return trimmed.length >= 12 && words.length >= 3 && letters >= 8;
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
