import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the Supabase server client + the current user id. Throws when there
 * is no session (routes are gated by middleware, so this is a safety net).
 */
export async function dbContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, userId: user.id };
}
