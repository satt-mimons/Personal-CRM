import { dbContext } from "./session";

/**
 * Per-user daily ceiling on transcribed audio. The Groq key is shared and its
 * limits are org-wide, so this stops one user from consuming the whole budget.
 * Well above normal use: a logged coffee chat runs 60-120 seconds.
 */
export const DAILY_TRANSCRIPTION_SECONDS = 900; // 15 minutes
export const DAILY_TRANSCRIPTION_REQUESTS = 40;

export interface TranscriptionUsage {
  seconds: number;
  requests: number;
}

export interface QuotaCheck {
  allowed: boolean;
  usage: TranscriptionUsage;
  /** Seconds still available today; 0 when exhausted. */
  remainingSeconds: number;
}

export async function getTodayTranscriptionUsage(): Promise<TranscriptionUsage> {
  const { supabase, userId } = await dbContext();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("transcription_usage")
    .select("seconds, requests")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();
  if (error) throw error;
  return { seconds: data?.seconds ?? 0, requests: data?.requests ?? 0 };
}

/**
 * Check the caller's remaining allowance. `estimatedSeconds` is the length of
 * the clip about to be sent, so an over-long clip is rejected before upload
 * rather than after we have already paid for it.
 */
export async function checkTranscriptionQuota(
  estimatedSeconds = 0,
): Promise<QuotaCheck> {
  const usage = await getTodayTranscriptionUsage();
  const remainingSeconds = Math.max(
    0,
    DAILY_TRANSCRIPTION_SECONDS - usage.seconds,
  );
  const allowed =
    usage.requests < DAILY_TRANSCRIPTION_REQUESTS &&
    estimatedSeconds <= remainingSeconds;
  return { allowed, usage, remainingSeconds };
}

/** Increment today's counters atomically. Returns the new totals. */
export async function recordTranscriptionUsage(
  seconds: number,
): Promise<TranscriptionUsage> {
  const { supabase } = await dbContext();
  const { data, error } = await supabase
    .rpc("record_transcription_usage", { p_seconds: Math.round(seconds) })
    .single();
  if (error) throw error;
  return data as TranscriptionUsage;
}
