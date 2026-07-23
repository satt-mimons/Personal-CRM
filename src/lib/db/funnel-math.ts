import { STAGES, type Stage, type StageEvent, type Tier } from "./types";

/** Active pipeline columns (dormant is opt-in via toggle). */
export const BOARD_STAGES = STAGES.filter((s) => s !== "dormant");

export interface BoardFilters {
  vertical?: string | null;
  tier?: Tier | null;
  /** When true, include dormant column + contacts. */
  showDormant?: boolean;
}

export interface BoardCard {
  contact_id: string;
  name: string;
  company: string | null;
  vertical: string | null;
  tier: Tier;
  stage: Stage;
  /** Days since entering the current stage (from stage_events). */
  days_in_stage: number;
}

export interface VerticalFunnelRow {
  vertical: string;
  contacts: number;
  chats: number;
  referrals: number;
  /** chats → referrals conversion, 0–100. Null when chats=0. */
  conversion_pct: number | null;
}

export interface FunnelStats {
  /** Counts by current stage (filtered set). */
  stage_counts: Record<Stage, number>;
  /** Of contacts that ever reached chatted, % that ever reached referral_interview. */
  chatted_to_referral_pct: number | null;
  /** Of contacts that ever reached identified (all), % that ever reached offer. */
  identified_to_offer_pct: number | null;
  by_vertical: VerticalFunnelRow[];
  /** Median completed+current dwell time (days) per stage from stage_events. */
  median_days_in_stage: Partial<Record<Stage, number>>;
  total: number;
}

export const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGES.map((s, i) => [s, i]),
);

export function stageReachedSet(events: StageEvent[]): Set<string> {
  const reached = new Set<string>();
  for (const e of events) {
    if (e.to_stage) reached.add(e.to_stage);
  }
  return reached;
}

export function everReached(
  reached: Set<string>,
  current: Stage,
  target: Stage,
): boolean {
  if (reached.has(target)) return true;
  if (current === "dormant") return reached.has(target);
  const ci = STAGE_INDEX[current] ?? -1;
  const ti = STAGE_INDEX[target] ?? 999;
  return ci >= ti;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  }
  return Math.round(sorted[mid] * 10) / 10;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Median dwell time (days) per stage from stage_events history.
 * Each stay = enter event → next event (or now if still current).
 */
export function medianDaysInStageFromEvents(
  events: StageEvent[],
  now: Date = new Date(),
): Partial<Record<Stage, number>> {
  const byContact = new Map<string, StageEvent[]>();
  for (const e of events) {
    const list = byContact.get(e.contact_id) ?? [];
    list.push(e);
    byContact.set(e.contact_id, list);
  }

  const durations: Partial<Record<Stage, number[]>> = {};
  for (const list of byContact.values()) {
    const sorted = [...list].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    for (let i = 0; i < sorted.length; i++) {
      const stage = sorted[i].to_stage as Stage;
      if (!(STAGES as readonly string[]).includes(stage)) continue;
      const start = new Date(sorted[i].created_at);
      const end =
        i + 1 < sorted.length ? new Date(sorted[i + 1].created_at) : now;
      const days = daysBetween(start, end);
      const bucket = durations[stage] ?? [];
      bucket.push(days);
      durations[stage] = bucket;
    }
  }

  const out: Partial<Record<Stage, number>> = {};
  for (const stage of STAGES) {
    const m = median(durations[stage] ?? []);
    if (m != null) out[stage] = m;
  }
  return out;
}
