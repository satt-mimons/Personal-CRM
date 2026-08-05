import { dbContext } from "./session";
import { decryptSecret, encryptSecret } from "@/lib/gmail/crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GmailConnectionRow {
  user_id: string;
  email: string | null;
  refresh_token_ciphertext: string;
  scopes: string;
  updated_at: string;
}

export async function isGmailConnected(): Promise<boolean> {
  const { supabase, userId } = await dbContext();
  const { data, error } = await supabase
    .from("gmail_connections")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getGmailConnection(): Promise<GmailConnectionRow | null> {
  const { supabase, userId } = await dbContext();
  const { data, error } = await supabase
    .from("gmail_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as GmailConnectionRow) ?? null;
}

export async function upsertGmailConnection(input: {
  userId: string;
  refreshToken: string;
  email: string | null;
  scopes: string;
}): Promise<void> {
  const { supabase } = await dbContext();
  await upsertGmailConnectionForUser(supabase, input);
}

/**
 * Persist tokens from the auth callback using the same Supabase client that
 * just exchanged the OAuth code (cookies live on that response).
 */
export async function upsertGmailConnectionForUser(
  supabase: SupabaseClient,
  input: {
    userId: string;
    refreshToken: string;
    email: string | null;
    scopes: string;
  },
): Promise<void> {
  const ciphertext = encryptSecret(input.refreshToken);
  const { error } = await supabase.from("gmail_connections").upsert(
    {
      user_id: input.userId,
      email: input.email,
      refresh_token_ciphertext: ciphertext,
      scopes: input.scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function getDecryptedRefreshToken(): Promise<string | null> {
  const row = await getGmailConnection();
  if (!row) return null;
  return decryptSecret(row.refresh_token_ciphertext);
}

export async function clearGmailConnection(): Promise<void> {
  const { supabase, userId } = await dbContext();
  const { error } = await supabase
    .from("gmail_connections")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}
