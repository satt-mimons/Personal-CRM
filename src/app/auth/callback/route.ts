import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { upsertGmailConnectionForUser } from "@/lib/db/gmail-connections";
import { GMAIL_COMPOSE_SCOPE } from "@/lib/gmail/auth";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

/**
 * OAuth / magic-link landing route. Supports the PKCE `code` flow (Google
 * OAuth, default magic link) and the `token_hash` OTP flow.
 *
 * Cookies are written directly onto the redirect response we return, rather
 * than via next/headers — in a Route Handler that is the only way to reliably
 * persist the new session onto a manually constructed redirect.
 *
 * When `gmail=1` is present (incremental Gmail connect), we also persist the
 * Google provider refresh token for drafts.create and stamp gmailConnected on
 * the return URL so the thank-you step knows whether connect worked.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");
  const gmailConnect = searchParams.get("gmail") === "1";
  // Only allow in-app relative redirects to avoid open-redirect abuse.
  let next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  const pendingCookies: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies.push(...cookiesToSet);
        },
      },
    },
  );

  let ok = false;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;

    if (ok && gmailConnect) {
      let gmailOk = false;
      let gmailError = "persist";
      if (
        data.session?.provider_refresh_token &&
        data.session.user &&
        process.env.GMAIL_TOKEN_ENCRYPTION_KEY
      ) {
        try {
          await upsertGmailConnectionForUser(supabase, {
            userId: data.session.user.id,
            refreshToken: data.session.provider_refresh_token,
            email: data.session.user.email ?? null,
            scopes: GMAIL_COMPOSE_SCOPE,
          });
          gmailOk = true;
          gmailError = "";
        } catch {
          gmailError = "persist";
        }
      } else if (!process.env.GMAIL_TOKEN_ENCRYPTION_KEY) {
        gmailError = "config";
      } else if (!data.session?.provider_refresh_token) {
        gmailError = "token";
      }

      try {
        const u = new URL(next, origin);
        if (gmailOk) {
          u.searchParams.set("gmailConnected", "1");
          u.searchParams.delete("gmailError");
        } else {
          u.searchParams.set("gmailConnected", "0");
          u.searchParams.set("gmailError", gmailError);
        }
        next = `${u.pathname}${u.search}`;
      } catch {
        // Keep original next if URL parsing fails.
      }
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    ok = !error;
  }

  const response = NextResponse.redirect(
    ok ? `${origin}${next}` : `${origin}/login?error=auth`,
  );
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  return response;
}
