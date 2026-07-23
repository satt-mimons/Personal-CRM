/**
 * Manually trigger a digest send (or dry-run).
 *
 *   npm run digest              # send for real
 *   npm run digest -- --dry-run # rank + log, no email
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { runDailyDigest } from "../src/lib/digest/run";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "Dry-running digest…" : "Sending digest…");
  const result = await runDailyDigest({ dryRun });
  console.log(
    JSON.stringify(
      {
        userId: result.userId,
        nudgeCount: result.nudgeCount,
        sent: result.sent,
        headlines: result.nudges.map((n) => ({
          headline: n.headline,
          score: n.score,
          reason: n.reason,
          opener: n.suggested_opener,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
