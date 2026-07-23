import { dbContext } from "./session";
import {
  daysBetween,
  everReached,
  medianDaysInStageFromEvents,
  stageReachedSet,
  type BoardCard,
  type BoardFilters,
  type FunnelStats,
  type VerticalFunnelRow,
} from "./funnel-math";
import {
  STAGES,
  type ContactStatus,
  type Stage,
  type StageEvent,
} from "./types";

export {
  BOARD_STAGES,
  medianDaysInStageFromEvents,
  type BoardCard,
  type BoardFilters,
  type FunnelStats,
  type VerticalFunnelRow,
} from "./funnel-math";

/**
 * Days each contact has spent in their *current* stage, from the latest
 * stage_events row (fallback: contact created_at).
 */
export async function getDaysInCurrentStage(
  contactIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (contactIds.length === 0) return map;

  const { supabase } = await dbContext();
  const now = new Date();

  const { data: events, error } = await supabase
    .from("stage_events")
    .select("contact_id, to_stage, created_at")
    .in("contact_id", contactIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const latestEnter = new Map<string, string>();
  for (const row of events ?? []) {
    const r = row as { contact_id: string; created_at: string };
    if (!latestEnter.has(r.contact_id)) {
      latestEnter.set(r.contact_id, r.created_at);
    }
  }

  const missing = contactIds.filter((id) => !latestEnter.has(id));
  if (missing.length > 0) {
    const { data: contacts, error: cErr } = await supabase
      .from("contacts")
      .select("id, created_at")
      .in("id", missing);
    if (cErr) throw cErr;
    for (const c of contacts ?? []) {
      const row = c as { id: string; created_at: string };
      latestEnter.set(row.id, row.created_at);
    }
  }

  for (const id of contactIds) {
    const iso = latestEnter.get(id);
    if (!iso) {
      map.set(id, 0);
      continue;
    }
    map.set(id, Math.floor(daysBetween(new Date(iso), now)));
  }
  return map;
}

/** Board cards for the filtered contact set, with days_in_stage. */
export async function getBoardCards(
  filters: BoardFilters = {},
): Promise<BoardCard[]> {
  const { supabase } = await dbContext();
  let query = supabase.from("contact_status").select("*");

  if (filters.vertical) query = query.eq("vertical", filters.vertical);
  if (filters.tier) query = query.eq("tier", filters.tier);
  if (!filters.showDormant) query = query.neq("stage", "dormant");

  query = query.order("name", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as ContactStatus[];
  const daysMap = await getDaysInCurrentStage(rows.map((r) => r.contact_id));

  return rows.map((r) => ({
    contact_id: r.contact_id,
    name: r.name,
    company: r.company,
    vertical: r.vertical,
    tier: r.tier,
    stage: r.stage,
    days_in_stage: daysMap.get(r.contact_id) ?? 0,
  }));
}

/**
 * Funnel / vertical readout for the filtered set.
 * Kept here for reuse (vertical readout Prompt later).
 */
export async function getFunnelStats(
  filters: BoardFilters = {},
): Promise<FunnelStats> {
  const { supabase } = await dbContext();
  let query = supabase.from("contact_status").select("*");
  if (filters.vertical) query = query.eq("vertical", filters.vertical);
  if (filters.tier) query = query.eq("tier", filters.tier);
  if (!filters.showDormant) query = query.neq("stage", "dormant");

  const { data, error } = await query;
  if (error) throw error;
  const contacts = (data ?? []) as ContactStatus[];
  const ids = contacts.map((c) => c.contact_id);

  const stage_counts = Object.fromEntries(
    STAGES.map((s) => [s, 0]),
  ) as Record<Stage, number>;
  for (const c of contacts) {
    stage_counts[c.stage] = (stage_counts[c.stage] ?? 0) + 1;
  }

  let events: StageEvent[] = [];
  if (ids.length > 0) {
    const { data: ev, error: evErr } = await supabase
      .from("stage_events")
      .select("*")
      .in("contact_id", ids)
      .order("created_at", { ascending: true });
    if (evErr) throw evErr;
    events = (ev ?? []) as StageEvent[];
  }

  const eventsByContact = new Map<string, StageEvent[]>();
  for (const e of events) {
    const list = eventsByContact.get(e.contact_id) ?? [];
    list.push(e);
    eventsByContact.set(e.contact_id, list);
  }

  let reachedChatted = 0;
  let reachedReferral = 0;
  let reachedOffer = 0;
  const reachedIdentified = contacts.length;

  type VAgg = { contacts: number; chats: number; referrals: number };
  const verticalAgg = new Map<string, VAgg>();

  for (const c of contacts) {
    const reached = stageReachedSet(eventsByContact.get(c.contact_id) ?? []);
    reached.add(c.stage);

    const chat = everReached(reached, c.stage, "chatted");
    const referral = everReached(reached, c.stage, "referral_interview");
    const offer = everReached(reached, c.stage, "offer");

    if (chat) reachedChatted++;
    if (referral) reachedReferral++;
    if (offer) reachedOffer++;

    const vKey = c.vertical?.trim() || "(none)";
    const agg = verticalAgg.get(vKey) ?? {
      contacts: 0,
      chats: 0,
      referrals: 0,
    };
    agg.contacts++;
    if (chat) agg.chats++;
    if (referral) agg.referrals++;
    verticalAgg.set(vKey, agg);
  }

  const pct = (num: number, den: number): number | null =>
    den === 0 ? null : Math.round((num / den) * 1000) / 10;

  const by_vertical: VerticalFunnelRow[] = [...verticalAgg.entries()]
    .map(([vertical, agg]) => ({
      vertical,
      contacts: agg.contacts,
      chats: agg.chats,
      referrals: agg.referrals,
      conversion_pct: pct(agg.referrals, agg.chats),
    }))
    .sort(
      (a, b) => b.contacts - a.contacts || a.vertical.localeCompare(b.vertical),
    );

  return {
    stage_counts,
    chatted_to_referral_pct: pct(reachedReferral, reachedChatted),
    identified_to_offer_pct: pct(reachedOffer, reachedIdentified),
    by_vertical,
    median_days_in_stage: medianDaysInStageFromEvents(events),
    total: contacts.length,
  };
}
