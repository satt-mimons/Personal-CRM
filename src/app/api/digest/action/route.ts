import { NextResponse, type NextRequest } from "next/server";
import { verifyDigestToken } from "@/lib/digest/tokens";
import { adminMarkTouched, adminSnoozeContact } from "@/lib/db/digest";

/**
 * One-click digest actions (no login). Token is HMAC-signed and short-lived.
 * ?token=... → snooze 1w or mark touched, then redirect to a confirmation page.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002";

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/digest/done?error=missing`);
  }

  const payload = verifyDigestToken(token);
  if (!payload) {
    return NextResponse.redirect(`${siteUrl}/digest/done?error=invalid`);
  }

  try {
    if (payload.a === "snooze") {
      await adminSnoozeContact(payload.c, payload.u, 7);
    } else {
      await adminMarkTouched(payload.c, payload.u);
    }
  } catch (err) {
    console.error("digest action failed", err);
    return NextResponse.redirect(`${siteUrl}/digest/done?error=failed`);
  }

  return NextResponse.redirect(
    `${siteUrl}/digest/done?ok=1&action=${payload.a}&contact=${payload.c}`,
  );
}
