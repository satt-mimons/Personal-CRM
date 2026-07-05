import { createClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client using the service_role key. BYPASSES RLS.
 * Server-only — never import this into a Client Component. Used by scripts
 * (e.g. seeding) and trusted server tasks that must act across the schema.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
