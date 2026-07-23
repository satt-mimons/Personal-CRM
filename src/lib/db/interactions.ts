import { dbContext } from "./session";
import type { Direction, Interaction, InteractionType } from "./types";

export interface NewInteractionInput {
  contact_id: string;
  occurred_at: string; // ISO 8601
  type: InteractionType;
  raw_notes: string;
  summary: string;
  warmth: number;
  direction: Direction;
}

export async function insertInteraction(
  input: NewInteractionInput,
): Promise<Interaction> {
  const { supabase, userId } = await dbContext();
  const { data, error } = await supabase
    .from("interactions")
    .insert({ ...input, user_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  return data as Interaction;
}

export async function getInteractionsByContact(
  contactId: string,
): Promise<Interaction[]> {
  const { supabase } = await dbContext();
  const { data, error } = await supabase
    .from("interactions")
    .select("*")
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Interaction[];
}
