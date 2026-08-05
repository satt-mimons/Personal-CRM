import {
  clearGmailConnection,
  getDecryptedRefreshToken,
} from "@/lib/db/gmail-connections";

const GMAIL_COMPOSE_SCOPE =
  "https://www.googleapis.com/auth/gmail.compose";

export { GMAIL_COMPOSE_SCOPE };

export class GmailAuthError extends Error {
  constructor(
    message: string,
    public readonly needsReconnect: boolean = false,
  ) {
    super(message);
    this.name = "GmailAuthError";
  }
}

function googleClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GmailAuthError(
      "Gmail isn't configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
      false,
    );
  }
  return { clientId, clientSecret };
}

/**
 * Exchange the stored refresh token for a short-lived access token.
 * Clears the connection row when Google says the grant was revoked.
 */
export async function getValidAccessToken(): Promise<string> {
  const refreshToken = await getDecryptedRefreshToken();
  if (!refreshToken) {
    throw new GmailAuthError("Gmail isn't connected yet.", true);
  }

  const { clientId, clientSecret } = googleClientCreds();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GmailAuthError(
      "Timed out refreshing Gmail access. Check your network and try again.",
      false,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const revoked =
      res.status === 400 ||
      res.status === 401 ||
      /invalid_grant/i.test(text);
    if (revoked) {
      try {
        await clearGmailConnection();
      } catch {
        // Best-effort cleanup.
      }
      throw new GmailAuthError(
        "Gmail access expired. Reconnect to create a draft.",
        true,
      );
    }
    throw new GmailAuthError(
      "Couldn't refresh Gmail access. Try again in a moment.",
      false,
    );
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new GmailAuthError("Google returned no access token.", true);
  }
  return json.access_token;
}
