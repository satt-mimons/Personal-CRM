import { getValidAccessToken, GmailAuthError } from "./auth";

export interface CreateDraftInput {
  to: string;
  subject: string;
  body: string;
}

export interface CreatedDraft {
  draftId: string;
  messageId: string;
  /** Deep link that opens the draft in Gmail's compose UI. */
  gmailUrl: string;
}

function encodeSubject(subject: string): string {
  // RFC 2047 encoded-word when non-ASCII is present.
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const b64 = Buffer.from(subject, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function buildMimeMessage(input: CreateDraftInput): string {
  const lines = [
    `To: ${input.to.trim()}`,
    `Subject: ${encodeSubject(input.subject.trim())}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    input.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"),
  ];
  return lines.join("\r\n");
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Create a Gmail draft (never sends). Returns a URL to open the draft.
 */
export async function createThankYouDraft(
  input: CreateDraftInput,
): Promise<CreatedDraft> {
  const accessToken = await getValidAccessToken();
  const raw = toBase64Url(buildMimeMessage(input));

  let res: Response;
  try {
    res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: { raw } }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new GmailAuthError(
      "Timed out creating the Gmail draft. Try Open draft in Gmail again.",
      false,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new GmailAuthError(
        "Gmail denied draft creation. Reconnect and try again.",
        true,
      );
    }
    throw new GmailAuthError(
      text
        ? `Couldn't create Gmail draft: ${text.slice(0, 180)}`
        : "Couldn't create Gmail draft.",
      false,
    );
  }

  const json = (await res.json()) as {
    id?: string;
    message?: { id?: string };
  };
  const draftId = json.id ?? "";
  const messageId = json.message?.id ?? "";
  if (!messageId) {
    throw new GmailAuthError("Gmail created a draft but returned no message id.", false);
  }

  // Opens the draft in Gmail compose. Works for the signed-in account.
  const gmailUrl = `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}`;
  return { draftId, messageId, gmailUrl };
}
