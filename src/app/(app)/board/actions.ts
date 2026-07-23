"use server";

import { revalidatePath } from "next/cache";
import { updateContactStage } from "@/lib/db/contacts";
import { STAGES, type Stage } from "@/lib/db/types";

export async function moveBoardCard(
  contactId: string,
  stage: Stage,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(STAGES as readonly string[]).includes(stage)) {
    return { ok: false, error: "Invalid stage." };
  }
  try {
    await updateContactStage(contactId, stage);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update stage.",
    };
  }
  revalidatePath("/board");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}
