/**
 * Pure nudge engine — no I/O, no LLM, fully deterministic.
 * Unit-tested in tests/nudge-engine.test.ts.
 */

export type NudgeReason =
  | "overdue_followup"
  | "action_item_due"
  | "upcoming_prep";

export type NudgeTier = "priority" | "warm" | "background";

export interface NudgeContactInput {
  contact_id: string;
  name: string;
  company: string | null;
  tier: NudgeTier;
  stage: string;
  /** YYYY-MM-DD or null. Present + in the future ⇒ excluded. */
  snoozed_until: string | null;
  /** From contact_status view. */
  days_overdue: number;
  next_due_date: string;
  /** YYYY-MM-DD or null — manual upcoming-chat flag. */
  upcoming_chat_at: string | null;
  open_actions: Array<{
    description: string;
    owner: "me" | "them";
    /** YYYY-MM-DD or null */
    due_date: string | null;
  }>;
  /** Most recent interaction summary, if any (used for headlines / openers). */
  last_summary: string | null;
}

export interface NudgeAction {
  contact_id: string;
  reason: NudgeReason;
  headline: string;
  why_now: string;
  /** Filled later by LLM for top 3; engine leaves null. */
  suggested_opener: string | null;
  score: number;
  /** Convenience for rendering — not scored. */
  name: string;
  company: string | null;
}

export interface RankNudgesOptions {
  /** "Today" as YYYY-MM-DD in the user's timezone. Defaults to UTC today. */
  today?: string;
  maxNudges?: number;
  minScore?: number;
}

const TIER_BASE: Record<NudgeTier, number> = {
  priority: 100,
  warm: 50,
  background: 20,
};

const EXCLUDED_STAGES = new Set(["offer", "dormant"]);
const UPCOMING_PREP_BONUS = 30;
const ACTION_DUE_BONUS = 40;
const OVERDUE_PER_DAY = 5;
const OVERDUE_CAP = 50;

const REASON_PRIORITY: Record<NudgeReason, number> = {
  action_item_due: 3,
  overdue_followup: 2,
  upcoming_prep: 1,
};

function parseYmd(s: string): number {
  // Treat date-only as UTC noon to avoid TZ edge noise in pure logic.
  const d = new Date(`${s.slice(0, 10)}T12:00:00.000Z`);
  return d.getTime();
}

function daysBetween(aYmd: string, bYmd: string): number {
  const ms = parseYmd(bYmd) - parseYmd(aYmd);
  return Math.round(ms / 86_400_000);
}

function todayYmd(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function isSnoozed(snoozedUntil: string | null, today: string): boolean {
  if (!snoozedUntil) return false;
  return parseYmd(snoozedUntil.slice(0, 10)) >= parseYmd(today);
}

function actionDueForMe(
  actions: NudgeContactInput["open_actions"],
  today: string,
): { description: string; due_date: string } | null {
  let best: { description: string; due_date: string; daysUntil: number } | null =
    null;
  for (const a of actions) {
    if (a.owner !== "me" || !a.due_date) continue;
    const daysUntil = daysBetween(today, a.due_date.slice(0, 10));
    // due within 2 days (including today) or past
    if (daysUntil > 2) continue;
    if (!best || daysUntil < best.daysUntil) {
      best = {
        description: a.description,
        due_date: a.due_date.slice(0, 10),
        daysUntil,
      };
    }
  }
  return best;
}

function upcomingWithinWindow(
  upcomingChatAt: string | null,
  today: string,
): boolean {
  if (!upcomingChatAt) return false;
  const daysUntil = daysBetween(today, upcomingChatAt.slice(0, 10));
  return daysUntil >= 0 && daysUntil <= 2;
}

function pickReason(applicable: NudgeReason[]): NudgeReason {
  return applicable.reduce((best, r) =>
    REASON_PRIORITY[r] > REASON_PRIORITY[best] ? r : best,
  );
}

function buildHeadline(
  reason: NudgeReason,
  contact: NudgeContactInput,
  dueAction: { description: string } | null,
): string {
  const who = contact.company
    ? `${contact.name} (${contact.company})`
    : contact.name;
  switch (reason) {
    case "action_item_due":
      return dueAction
        ? `Do: ${dueAction.description}`
        : `Action due — ${who}`;
    case "overdue_followup":
      return `Follow up with ${who}`;
    case "upcoming_prep":
      return `Prep for chat with ${who}`;
  }
}

function buildWhyNow(
  reason: NudgeReason,
  contact: NudgeContactInput,
  dueAction: { description: string; due_date: string } | null,
  today: string,
): string {
  switch (reason) {
    case "action_item_due": {
      if (!dueAction) return "You have an open action item.";
      const daysUntil = daysBetween(today, dueAction.due_date);
      if (daysUntil < 0) {
        return `Action was due ${Math.abs(daysUntil)}d ago.`;
      }
      if (daysUntil === 0) return "Action due today.";
      if (daysUntil === 1) return "Action due tomorrow.";
      return `Action due in ${daysUntil} days.`;
    }
    case "overdue_followup": {
      const d = contact.days_overdue;
      return d === 1
        ? "1 day past cadence."
        : `${d} days past cadence.`;
    }
    case "upcoming_prep": {
      if (!contact.upcoming_chat_at) return "Upcoming chat on the calendar.";
      const daysUntil = daysBetween(today, contact.upcoming_chat_at.slice(0, 10));
      if (daysUntil === 0) return "Chat is today — prep a opener.";
      if (daysUntil === 1) return "Chat is tomorrow.";
      return `Chat in ${daysUntil} days.`;
    }
  }
}

/**
 * Score a single contact. Returns null when excluded or below threshold is
 * NOT applied here — caller filters by minScore after ranking.
 */
export function scoreContact(
  contact: NudgeContactInput,
  today: string,
): Omit<NudgeAction, "suggested_opener"> | null {
  if (EXCLUDED_STAGES.has(contact.stage)) return null;
  if (isSnoozed(contact.snoozed_until, today)) return null;

  const applicable: NudgeReason[] = [];
  let score = TIER_BASE[contact.tier] ?? 20;

  if (contact.days_overdue > 0) {
    score += Math.min(contact.days_overdue * OVERDUE_PER_DAY, OVERDUE_CAP);
    applicable.push("overdue_followup");
  }

  const dueAction = actionDueForMe(contact.open_actions, today);
  if (dueAction) {
    score += ACTION_DUE_BONUS;
    applicable.push("action_item_due");
  }

  if (upcomingWithinWindow(contact.upcoming_chat_at, today)) {
    score += UPCOMING_PREP_BONUS;
    applicable.push("upcoming_prep");
  }

  // Nothing actionable beyond base tier with no signals → skip.
  if (applicable.length === 0) return null;

  const reason = pickReason(applicable);
  return {
    contact_id: contact.contact_id,
    reason,
    headline: buildHeadline(reason, contact, dueAction),
    why_now: buildWhyNow(reason, contact, dueAction, today),
    score,
    name: contact.name,
    company: contact.company,
  };
}

/**
 * Rank contacts into ≤ maxNudges NudgeActions above minScore.
 * Tie-break: higher score → higher days_overdue → name A→Z.
 * At most one nudge per contact (inherent — one score per contact).
 */
export function rankNudges(
  contacts: NudgeContactInput[],
  options: RankNudgesOptions = {},
): NudgeAction[] {
  const today = options.today ?? todayYmd();
  const maxNudges = options.maxNudges ?? 5;
  const minScore = options.minScore ?? 30;

  const scored = contacts
    .map((c) => {
      const s = scoreContact(c, today);
      return s ? { scored: s, days_overdue: c.days_overdue } : null;
    })
    .filter((x): x is { scored: Omit<NudgeAction, "suggested_opener">; days_overdue: number } =>
      x !== null,
    )
    .filter((x) => x.scored.score >= minScore)
    .sort((a, b) => {
      if (b.scored.score !== a.scored.score) return b.scored.score - a.scored.score;
      if (b.days_overdue !== a.days_overdue) return b.days_overdue - a.days_overdue;
      return a.scored.name.localeCompare(b.scored.name);
    })
    .slice(0, maxNudges)
    .map(({ scored }) => ({ ...scored, suggested_opener: null }));

  return scored;
}
