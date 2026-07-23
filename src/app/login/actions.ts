"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Only allow safe, in-app relative redirect targets. */
function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/";
}

/**
 * Google OAuth sign-in. Supabase brokers the handshake: it returns a URL to
 * Google's consent screen, we redirect there, and Google sends the user back
 * to Supabase, which then redirects to our /auth/callback route (PKCE `code`
 * flow). The `next` field carries the user's intended destination through the
 * whole round-trip so they land where they were going (e.g. /log).
 */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  if (data.url) {
    redirect(data.url);
  }
}
