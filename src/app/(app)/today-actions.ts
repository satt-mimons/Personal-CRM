"use server";

import { revalidatePath } from "next/cache";
import { dbContext } from "@/lib/db/session";
import { addDaysIso } from "@/lib/utils/format";

export async function snoozeFromToday(contactId: string) {
  const { supabase, userId } = await dbContext();
  const until = addDaysIso(7);
  const { error } = await supabase
    .from("contacts")
    .update({ snoozed_until: until })
    .eq("id", contactId)
    .eq("user_id", userId);
  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
}

export async function markTouchedFromToday(contactId: string) {
  const { supabase, userId } = await dbContext();
  const { error } = await supabase.from("interactions").insert({
    user_id: userId,
    contact_id: contactId,
    occurred_at: new Date().toISOString(),
    type: "note",
    raw_notes: null,
    summary: "Marked touched from digest",
    warmth: null,
    direction: "outbound",
  });
  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
}
