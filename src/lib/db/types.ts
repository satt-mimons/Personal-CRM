// Hand-authored types mirroring the Supabase schema (see supabase/migrations).
// If you later generate types with `supabase gen types typescript`, prefer those
// and treat this file as the source of the domain enums.

export type Tier = "priority" | "warm" | "background";

export const STAGES = [
  "identified",
  "contacted",
  "chatted",
  "following_up",
  "referral_interview",
  "offer",
  "dormant",
] as const;
export type Stage = (typeof STAGES)[number];

export type InteractionType =
  | "coffee_chat"
  | "call"
  | "email"
  | "event"
  | "note";

export type Direction = "outbound" | "inbound" | "mutual";
export type ActionOwner = "me" | "them";
export type ActionStatus = "open" | "done" | "dropped";

/** tier -> default cadence in days when contacts.cadence_days is null. */
export const TIER_CADENCE_DAYS: Record<Tier, number> = {
  priority: 14,
  warm: 30,
  background: 90,
};

export interface Contact {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  vertical: string | null;
  tier: Tier;
  stage: Stage;
  cadence_days: number | null;
  snoozed_until: string | null;
  source: string | null;
  notes: string | null;
}

export interface Interaction {
  id: string;
  user_id: string;
  contact_id: string;
  created_at: string;
  occurred_at: string;
  type: InteractionType | null;
  raw_notes: string | null;
  summary: string | null;
  warmth: number | null;
  direction: Direction | null;
}

export interface ActionItem {
  id: string;
  user_id: string;
  contact_id: string;
  interaction_id: string | null;
  created_at: string;
  description: string;
  owner: ActionOwner;
  due_date: string | null;
  status: ActionStatus;
}

export interface StageEvent {
  id: string;
  user_id: string;
  contact_id: string;
  created_at: string;
  from_stage: string | null;
  to_stage: string;
}

/** Row shape of the `contact_status` view (derived, not stored). */
export interface ContactStatus {
  contact_id: string;
  user_id: string;
  name: string;
  company: string | null;
  tier: Tier;
  stage: Stage;
  vertical: string | null;
  snoozed_until: string | null;
  created_at: string;
  effective_cadence_days: number;
  last_touch_at: string | null;
  open_action_count: number;
  next_due_date: string;
  days_overdue: number;
}
