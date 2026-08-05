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

export async function getInteractionById(
  id: string,
): Promise<Interaction | null> {
  const { supabase } = await dbContext();
  const { data, error } = await supabase
    .from("interactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Interaction) ?? null;
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

export interface InteractionPatch {
  occurred_at: string;
  type: InteractionType;
  raw_notes: string | null;
  summary: string | null;
  warmth: number | null;
  direction: Direction | null;
}

export async function updateInteraction(
  id: string,
  patch: InteractionPatch,
): Promise<void> {
  const { supabase } = await dbContext();
  const { error } = await supabase
    .from("interactions")
    .update({
      occurred_at: patch.occurred_at,
      type: patch.type,
      raw_notes: patch.raw_notes,
      summary: patch.summary,
      warmth: patch.warmth,
      direction: patch.direction,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteInteraction(id: string): Promise<void> {
  const { supabase } = await dbContext();
  const { error } = await supabase.from("interactions").delete().eq("id", id);
  if (error) throw error;
}
