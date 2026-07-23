import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionItem, ContactStatus, DigestRun } from "./types";
import { addDaysIso } from "@/lib/utils/format";

/** Open action items for a user (admin / cron path — bypasses RLS). */
export async function adminGetOpenActionItems(
  userId: string,
): Promise<ActionItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("action_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open");
  if (error) throw error;
  return (data ?? []) as ActionItem[];
}

export async function adminGetContactStatuses(
  userId: string,
): Promise<ContactStatus[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contact_status")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as ContactStatus[];
}

/** Latest interaction summary per contact_id. */
export async function adminGetLatestSummaries(
  userId: string,
): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("interactions")
    .select("contact_id, summary, occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as {
      contact_id: string;
      summary: string | null;
    };
    if (!map.has(r.contact_id) && r.summary) {
      map.set(r.contact_id, r.summary);
    }
  }
  return map;
}

export async function adminInsertDigestRun(input: {
  user_id: string;
  nudge_count: number;
  payload: unknown;
}): Promise<DigestRun> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("digest_runs")
    .insert({
      user_id: input.user_id,
      nudge_count: input.nudge_count,
      payload: input.payload,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as DigestRun;
}

export async function adminSnoozeContact(
  contactId: string,
  userId: string,
  days = 7,
): Promise<void> {
  const admin = createAdminClient();
  const until = addDaysIso(days);
  const { error } = await admin
    .from("contacts")
    .update({ snoozed_until: until })
    .eq("id", contactId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function adminMarkTouched(
  contactId: string,
  userId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("interactions").insert({
    user_id: userId,
    contact_id: contactId,
    occurred_at: new Date().toISOString(),
    type: "note",
    raw_notes: null,
    summary: "Marked touched from digest",
    warmth: null,
    direction: "outbound",
  });
  if (error) throw error;
}

/** Resolve the single digest recipient user id. */
export async function resolveDigestUserId(): Promise<string> {
  if (process.env.DIGEST_USER_ID) return process.env.DIGEST_USER_ID;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (error) throw error;
  const first = data.users[0];
  if (!first) throw new Error("No users found for digest.");
  return first.id;
}
