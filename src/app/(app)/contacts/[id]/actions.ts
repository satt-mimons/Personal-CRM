"use server";

import { revalidatePath } from "next/cache";
import {
  snoozeContact,
  updateContactStage,
  updateContactTier,
} from "@/lib/db/contacts";
import { updateActionItemStatus } from "@/lib/db/action-items";
import type { ActionStatus, Stage, Tier } from "@/lib/db/types";

function revalidateContact(id: string) {
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
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

export async function setActionStatusAction(
  actionId: string,
  contactId: string,
  status: ActionStatus,
) {
  await updateActionItemStatus(actionId, status);
  revalidateContact(contactId);
}
