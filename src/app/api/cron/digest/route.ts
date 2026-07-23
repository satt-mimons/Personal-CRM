import { NextResponse, type NextRequest } from "next/server";
import { runDailyDigest } from "@/lib/digest/run";

/**
 * Vercel cron: GET /api/cron/digest
 * Secured with Authorization: Bearer <CRON_SECRET> (Vercel Cron sends this)
 * or x-cron-secret header for manual triggers.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const ok =
    auth === `Bearer ${secret}` || headerSecret === secret;
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  try {
    const result = await runDailyDigest({ dryRun });
    return NextResponse.json({
      ok: true,
      dryRun,
      nudgeCount: result.nudgeCount,
      sent: result.sent,
      userId: result.userId,
    });
  } catch (err) {
    console.error("digest cron failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Digest failed",
      },
      { status: 500 },
    );
  }
}
