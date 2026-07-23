import { createHmac, timingSafeEqual } from "node:crypto";

export type DigestAction = "snooze" | "touched";

export interface DigestTokenPayload {
  a: DigestAction;
  c: string; // contact_id
  u: string; // user_id
  e: number; // expiry unix seconds
}

function signingSecret(): string {
  const secret =
    process.env.DIGEST_SIGNING_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("Missing DIGEST_SIGNING_SECRET or CRON_SECRET");
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

/** Sign a short-lived digest one-click action (default 72h). */
export function signDigestToken(
  payload: Omit<DigestTokenPayload, "e"> & { e?: number },
  ttlSeconds = 72 * 3600,
): string {
  const full: DigestTokenPayload = {
    ...payload,
    e: payload.e ?? Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(full));
  const sig = createHmac("sha256", signingSecret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyDigestToken(
  token: string,
): DigestTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const expected = createHmac("sha256", signingSecret()).update(body).digest();
    const actual = fromB64url(sig);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return null;
    }
    const payload = JSON.parse(
      fromB64url(body).toString("utf8"),
    ) as DigestTokenPayload;
    if (
      !payload?.a ||
      !payload?.c ||
      !payload?.u ||
      typeof payload.e !== "number"
    ) {
      return null;
    }
    if (payload.e < Math.floor(Date.now() / 1000)) return null;
    if (payload.a !== "snooze" && payload.a !== "touched") return null;
    return payload;
  } catch {
    return null;
  }
}

export function digestActionUrl(
  siteUrl: string,
  action: DigestAction,
  contactId: string,
  userId: string,
): string {
  const token = signDigestToken({ a: action, c: contactId, u: userId });
  return `${siteUrl.replace(/\/$/, "")}/api/digest/action?token=${encodeURIComponent(token)}`;
}
