"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Google OAuth sign-in. Supabase brokers the handshake: it returns a URL to
 * Google's consent screen, we redirect there, and Google sends the user back
 * to Supabase, which then redirects to our /auth/callback route (PKCE `code`
 * flow — already handled). The Google client ID/secret live in the Supabase
 * dashboard, not in this app.
 */
export async function signInWithGoogle() {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  if (data.url) {
    redirect(data.url);
  }
}
