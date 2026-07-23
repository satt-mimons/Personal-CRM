import { dbContext } from "./session";
import type { Contact, ContactStatus, Stage, Tier } from "./types";
import { findDuplicates, type DuplicateMatch } from "@/lib/utils/fuzzy";

export interface ContactPickerRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  tier: Tier;
  stage: Stage;
}

export type ContactSort = "next_due" | "last_touch" | "name";

export interface ContactListFilters {
  vertical?: string | null;
  tier?: Tier | null;
  stage?: Stage | null;
  overdueOnly?: boolean;
  search?: string | null;
  sort?: ContactSort;
}

/** Contact row + derived status fields from the contact_status view. */
export interface ContactDetail {
  contact: Contact;
  status: ContactStatus;
}

/** Minimal contact list for the picker / fuzzy search (current user only). */
export async function getContactsForPicker(): Promise<ContactPickerRow[]> {
  const { supabase } = await dbContext();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, company, email, tier, stage")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ContactPickerRow[];
}

/**
 * List contacts via the contact_status view (derived fields live in Postgres —
 * never recompute last_touch / next_due / days_overdue in the app).
 */
export async function getContactStatuses(
  filters: ContactListFilters = {},
): Promise<ContactStatus[]> {
  const { supabase } = await dbContext();
  let query = supabase.from("contact_status").select("*");

  if (filters.vertical) query = query.eq("vertical", filters.vertical);
  if (filters.tier) query = query.eq("tier", filters.tier);
  if (filters.stage) query = query.eq("stage", filters.stage);
  if (filters.overdueOnly) query = query.gt("days_overdue", 0);

  const search = filters.search?.trim();
  if (search) {
    // PostgREST or-filter across name and company.
    const escaped = search.replace(/[%_,]/g, "").replace(/"/g, "");
    query = query.or(
      `name.ilike.%${escaped}%,company.ilike.%${escaped}%`,
    );
  }

  const sort = filters.sort ?? "next_due";
  if (sort === "name") {
    query = query.order("name", { ascending: true });
  } else if (sort === "last_touch") {
    query = query.order("last_touch_at", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("next_due_date", { ascending: true });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ContactStatus[];
}

/** Distinct verticals for filter chips (from contact_status). */
export async function getContactVerticals(): Promise<string[]> {
  const { supabase } = await dbContext();
  const { data, error } = await supabase
    .from("contact_status")
    .select("vertical")
    .not("vertical", "is", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data ?? []) {
    const v = (row as { vertical: string | null }).vertical;
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function getContactById(id: string): Promise<Contact | null> {
  const { supabase } = await dbContext();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Contact) ?? null;
}

export async function getContactStatusById(
  contactId: string,
): Promise<ContactStatus | null> {
  const { supabase } = await dbContext();
  const { data, error } = await supabase
    .from("contact_status")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (error) throw error;
  return (data as ContactStatus) ?? null;
}

export async function getContactDetail(
  id: string,
): Promise<ContactDetail | null> {
  const [contact, status] = await Promise.all([
    getContactById(id),
    getContactStatusById(id),
  ]);
  if (!contact || !status) return null;
  return { contact, status };
}

export interface NewContactInput {
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  vertical: string | null;
  tier: Tier;
  stage: Stage;
  source?: string | null;
}

export async function insertContact(input: NewContactInput): Promise<Contact> {
  const { supabase, userId } = await dbContext();
  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...input, user_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  return data as Contact;
}

/**
 * Upsert a contact by matching on email first, then exact name+company.
 * Returns the contact id. When a match is found, fills in any fields that were
 * previously empty (non-destructive).
 */
export async function upsertContactByIdentity(
  input: NewContactInput,
): Promise<{ id: string; created: boolean }> {
  const { supabase, userId } = await dbContext();

  let existing: Contact | null = null;

  if (input.email) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .ilike("email", input.email)
      .maybeSingle();
    existing = (data as Contact) ?? null;
  }
  if (!existing) {
    const query = supabase
      .from("contacts")
      .select("*")
      .ilike("name", input.name);
    const { data } = input.company
      ? await query.ilike("company", input.company)
      : await query.is("company", null);
    existing = (data?.[0] as Contact) ?? null;
  }

  if (existing) {
    const patch: Record<string, string> = {};
    for (const key of [
      "company",
      "title",
      "email",
      "linkedin_url",
      "vertical",
    ] as const) {
      if (!existing[key] && input[key]) patch[key] = input[key] as string;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("contacts").update(patch).eq("id", existing.id);
    }
    return { id: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...input, user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id, created: true };
}

/** Update stage; the DB trigger appends the stage_events row automatically. */
export async function updateContactStage(id: string, stage: Stage): Promise<void> {
  const { supabase } = await dbContext();
  const { error } = await supabase
    .from("contacts")
    .update({ stage })
    .eq("id", id);
  if (error) throw error;
}

export async function updateContactTier(id: string, tier: Tier): Promise<void> {
  const { supabase } = await dbContext();
  const { error } = await supabase
    .from("contacts")
    .update({ tier })
    .eq("id", id);
  if (error) throw error;
}

/** Set snoozed_until (YYYY-MM-DD). Pass null to clear. */
export async function snoozeContact(
  id: string,
  snoozedUntil: string | null,
): Promise<void> {
  const { supabase } = await dbContext();
  const { error } = await supabase
    .from("contacts")
    .update({ snoozed_until: snoozedUntil })
    .eq("id", id);
  if (error) throw error;
}

/** Find likely duplicates of an extracted contact among the user's contacts. */
export async function findPossibleDuplicates(extracted: {
  name: string;
  company: string | null;
  email: string | null;
}): Promise<DuplicateMatch<ContactPickerRow>[]> {
  const contacts = await getContactsForPicker();
  return findDuplicates(contacts, extracted);
}
