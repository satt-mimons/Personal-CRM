import {
  adminGetContactStatuses,
  adminGetLatestSummaries,
  adminGetOpenActionItems,
  adminInsertDigestRun,
  resolveDigestUserId,
} from "@/lib/db/digest";
import { contactsToNudgeInputs, rankAndAttachOpeners } from "@/lib/nudge/build";
import { sendDigestEmail } from "@/lib/digest/email";
import type { NudgeAction } from "@/lib/nudge/engine";

export interface DigestResult {
  userId: string;
  nudgeCount: number;
  sent: boolean;
  nudges: NudgeAction[];
}

/**
 * Build ranked nudges for a user (admin path — used by cron).
 */
export async function buildNudgesForUser(
  userId: string,
  opts: { withOpeners?: boolean; today?: string } = {},
): Promise<{ nudges: NudgeAction[] }> {
  const [statuses, actions, summaries] = await Promise.all([
    adminGetContactStatuses(userId),
    adminGetOpenActionItems(userId),
    adminGetLatestSummaries(userId),
  ]);
  const { inputs, contexts } = contactsToNudgeInputs(
    statuses,
    actions,
    summaries,
  );
  const nudges = await rankAndAttachOpeners(inputs, contexts, opts);
  return { nudges };
}

/**
 * Run the daily digest: rank → openers → email (if any) → log digest_runs.
 * Sends nothing when nudge_count is 0.
 */
export async function runDailyDigest(opts: {
  dryRun?: boolean;
} = {}): Promise<DigestResult> {
  const userId = await resolveDigestUserId();
  const { nudges } = await buildNudgesForUser(userId, { withOpeners: true });

  if (nudges.length === 0) {
    await adminInsertDigestRun({
      user_id: userId,
      nudge_count: 0,
      payload: {
        nudges: [],
        dryRun: Boolean(opts.dryRun),
        skipped: "no_nudges",
      },
    });
    return { userId, nudgeCount: 0, sent: false, nudges: [] };
  }

  let sent = false;
  if (!opts.dryRun) {
    await sendDigestEmail({ userId, nudges });
    sent = true;
  }

  await adminInsertDigestRun({
    user_id: userId,
    nudge_count: nudges.length,
    payload: { nudges, dryRun: Boolean(opts.dryRun), sent },
  });

  return { userId, nudgeCount: nudges.length, sent, nudges };
}
