"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  step: "email" | "code" | "password";
  email: string;
  status: "idle" | "sent" | "error";
  message?: string;
};

/**
 * Single login action driven by the hidden `intent` field:
 *  - "send"   -> email a 6-digit code (and a magic link as fallback)
 *  - "verify" -> verify the typed code and start the session
 *
 * We use a typed code rather than relying on the link click because email
 * providers often pre-fetch links and consume the one-time token.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "send");
  const email = String(formData.get("email") ?? "").trim();
  const supabase = await createClient();

  if (intent === "send") {
    if (!email) {
      return { step: "email", email: "", status: "error", message: "Enter your email." };
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });
    if (error) {
      return { step: "email", email, status: "error", message: error.message };
    }
    return { step: "code", email, status: "sent" };
  }

  // intent === "verify"
  const token = String(formData.get("token") ?? "").trim();
  if (!email || !token) {
    return { step: "code", email, status: "error", message: "Enter the 6-digit code." };
  }
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) {
    return { step: "code", email, status: "error", message: error.message };
  }

  redirect("/");
}

/**
 * Password sign-in — bypasses email entirely (no rate limits). Create the user
 * with a password in Supabase (Authentication -> Users -> Add user, with
 * "Auto Confirm User" checked).
 */
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return {
      step: "password",
      email,
      status: "error",
      message: "Enter email and password.",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { step: "password", email, status: "error", message: error.message };
  }
  redirect("/");
}
