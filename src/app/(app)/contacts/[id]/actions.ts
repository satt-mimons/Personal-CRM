"use server";

import { revalidatePath } from "next/cache";
import {
  snoozeContact,
  updateContactProfile,
  updateContactStage,
  updateContactTier,
  type ContactProfilePatch,
} from "@/lib/db/contacts";
import {
  updateActionItem,
  updateActionItemStatus,
  type ActionItemPatch,
} from "@/lib/db/action-items";
import {
  deleteInteraction,
  updateInteraction,
  type InteractionPatch,
} from "@/lib/db/interactions";
import type { ActionStatus, Stage, Tier } from "@/lib/db/types";

function revalidateContact(id: string) {
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  revalidatePath("/");
  revalidatePath("/board");
}

function emptyToNull(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
}

export async function setContactTierAction(contactId: string, tier: Tier) {
  await updateContactTier(contactId, tier);
  revalidateContact(contactId);
}

export async function setContactStageAction(contactId: string, stage: Stage) {
  await updateContactStage(contactId, stage);
  revalidateContact(contactId);
}

export async function snoozeContactAction(
  contactId: string,
  snoozedUntil: string | null,
) {
  await snoozeContact(contactId, snoozedUntil);
  revalidateContact(contactId);
}

export async function updateContactProfileAction(
  contactId: string,
  patch: ContactProfilePatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = patch.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (
    patch.cadence_days !== null &&
    (!Number.isInteger(patch.cadence_days) ||
      patch.cadence_days < 1 ||
      patch.cadence_days > 365)
  ) {
    return { ok: false, error: "Cadence must be between 1 and 365 days." };
  }
  await updateContactProfile(contactId, {
    name,
    company: emptyToNull(patch.company),
    title: emptyToNull(patch.title),
    email: emptyToNull(patch.email),
    linkedin_url: emptyToNull(patch.linkedin_url),
    vertical: emptyToNull(patch.vertical),
    cadence_days: patch.cadence_days,
    notes: emptyToNull(patch.notes),
    upcoming_chat_at: emptyToNull(patch.upcoming_chat_at),
  });
  revalidateContact(contactId);
  return { ok: true };
}

export async function setActionStatusAction(
  actionId: string,
  contactId: string,
  status: ActionStatus,
) {
  await updateActionItemStatus(actionId, status);
  revalidateContact(contactId);
}

export async function updateActionItemAction(
  actionId: string,
  contactId: string,
  patch: ActionItemPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const description = patch.description.trim();
  if (!description) return { ok: false, error: "Description is required." };
  if (patch.owner !== "me" && patch.owner !== "them") {
    return { ok: false, error: "Owner must be me or them." };
  }
  await updateActionItem(actionId, {
    description,
    owner: patch.owner,
    due_date: emptyToNull(patch.due_date),
  });
  revalidateContact(contactId);
  return { ok: true };
}

export async function updateInteractionAction(
  interactionId: string,
  contactId: string,
  patch: InteractionPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!patch.occurred_at || Number.isNaN(new Date(patch.occurred_at).getTime())) {
    return { ok: false, error: "When needs a valid date." };
  }
  const warmth =
    patch.warmth == null
      ? null
      : Math.min(5, Math.max(1, Math.round(patch.warmth)));
  await updateInteraction(interactionId, {
    occurred_at: patch.occurred_at,
    type: patch.type,
    raw_notes: emptyToNull(patch.raw_notes),
    summary: emptyToNull(patch.summary),
    warmth,
    direction: patch.direction,
  });
  revalidateContact(contactId);
  return { ok: true };
}

export async function deleteInteractionAction(
  interactionId: string,
  contactId: string,
): Promise<void> {
  await deleteInteraction(interactionId);
  revalidateContact(contactId);
}
