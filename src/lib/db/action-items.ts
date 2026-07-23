import { dbContext } from "./session";
import type { ActionItem, ActionOwner, ActionStatus } from "./types";

export interface NewActionItemInput {
  contact_id: string;
  interaction_id: string | null;
  description: string;
  owner: ActionOwner;
  due_date: string | null; // YYYY-MM-DD
}

export async function insertActionItems(
  rows: NewActionItemInput[],
): Promise<ActionItem[]> {
  if (rows.length === 0) return [];
  const { supabase, userId } = await dbContext();
  const { data, error } = await supabase
    .from("action_items")
    .insert(rows.map((r) => ({ ...r, user_id: userId })))
    .select("*");
  if (error) throw error;
  return (data ?? []) as ActionItem[];
}

export async function getOpenActionItemsByContact(
  contactId: string,
): Promise<ActionItem[]> {
  const { supabase } = await dbContext();
  const { data, error } = await supabase
    .from("action_items")
    .select("*")
    .eq("contact_id", contactId)
    .eq("status", "open")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as ActionItem[];
}

export async function updateActionItemStatus(
  id: string,
  status: ActionStatus,
): Promise<void> {
  const { supabase } = await dbContext();
  const { error } = await supabase
    .from("action_items")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}
