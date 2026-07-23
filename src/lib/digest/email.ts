import { Resend } from "resend";
import type { NudgeAction } from "@/lib/nudge/engine";
import { digestActionUrl } from "./tokens";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nudgeBlock(
  n: NudgeAction,
  siteUrl: string,
  userId: string,
): string {
  const openUrl = `${siteUrl.replace(/\/$/, "")}/contacts/${n.contact_id}`;
  const snoozeUrl = digestActionUrl(siteUrl, "snooze", n.contact_id, userId);
  const touchedUrl = digestActionUrl(siteUrl, "touched", n.contact_id, userId);
  const opener = n.suggested_opener
    ? `<blockquote style="margin:12px 0;padding:12px 14px;border-left:3px solid #059669;background:#f0fdf4;color:#14532d;font-size:14px;line-height:1.45;">${escapeHtml(n.suggested_opener)}</blockquote>`
    : "";

  return `
  <tr>
    <td style="padding:16px 0;border-bottom:1px solid #e5e5e5;">
      <div style="font-size:16px;font-weight:600;color:#171717;">${escapeHtml(n.headline)}</div>
      <div style="margin-top:4px;font-size:13px;color:#737373;">${escapeHtml(n.why_now)}</div>
      ${opener}
      <div style="margin-top:12px;">
        <a href="${escapeHtml(openUrl)}" style="display:inline-block;margin:0 8px 8px 0;padding:8px 12px;background:#171717;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open contact</a>
        <a href="${escapeHtml(snoozeUrl)}" style="display:inline-block;margin:0 8px 8px 0;padding:8px 12px;background:#fff;color:#171717;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #d4d4d4;">Snooze 1w</a>
        <a href="${escapeHtml(touchedUrl)}" style="display:inline-block;margin:0 8px 8px 0;padding:8px 12px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Mark touched</a>
      </div>
    </td>
  </tr>`;
}

export function renderDigestHtml(input: {
  nudges: NudgeAction[];
  siteUrl: string;
  userId: string;
}): string {
  const n = input.nudges.length;
  const rows = input.nudges
    .map((x) => nudgeBlock(x, input.siteUrl, input.userId))
    .join("");
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;">
          <tr>
            <td>
              <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#737373;">pipeline</div>
              <h1 style="margin:8px 0 4px;font-size:22px;color:#171717;">${n} action${n === 1 ? "" : "s"} today</h1>
              <p style="margin:0 0 8px;font-size:14px;color:#737373;">Your ranked nudges — openers are suggestions, never auto-sent.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${rows}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendDigestEmail(input: {
  userId: string;
  nudges: NudgeAction[];
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO_EMAIL;
  const from = process.env.DIGEST_FROM_EMAIL || "pipeline <onboarding@resend.dev>";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002";

  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  if (!to) throw new Error("Missing DIGEST_TO_EMAIL");

  const resend = new Resend(apiKey);
  const n = input.nudges.length;
  const subject = `Pipeline: ${n} action${n === 1 ? "" : "s"} today`;
  const html = renderDigestHtml({
    nudges: input.nudges,
    siteUrl,
    userId: input.userId,
  });

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
  });
  if (error) throw new Error(error.message);
}
