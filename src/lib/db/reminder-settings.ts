import { dbContext } from "./session";
import type { ReminderDigestFrequency, ReminderSettings } from "./types";

export const DEFAULT_REMINDER_SETTINGS = {
  email_enabled: false,
  digest_frequency: "daily" as ReminderDigestFrequency,
  custom_cadence_days: null as number | null,
  digest_time: "09:00",
  timezone: "America/New_York",
  include_tasks: true,
  include_followups: true,
  include_waiting: true,
  include_upcoming: true,
};

export interface ReminderSettingsPatch {
  email_enabled: boolean;
  digest_frequency: ReminderDigestFrequency;
  custom_cadence_days: number | null;
  digest_time: string;
  timezone: string;
  include_tasks: boolean;
  include_followups: boolean;
  include_waiting: boolean;
  include_upcoming: boolean;
}

function withDefaults(
  userId: string,
  row: ReminderSettings | null,
): ReminderSettings {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    created_at: row?.created_at ?? now,
    updated_at: row?.updated_at ?? now,
    ...DEFAULT_REMINDER_SETTINGS,
    ...(row ?? {}),
  };
}

function isMissingRelationError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const maybeError = error as { code?: unknown; message?: unknown };
  const message =
    typeof maybeError.message === "string" ? maybeError.message : "";
  return (
    maybeError.code === "42P01" ||
    (message.includes("reminder_settings") &&
      message.toLowerCase().includes("schema cache"))
  );
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  const { supabase, userId } = await dbContext();
  const { data, error } = await supabase
    .from("reminder_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (isMissingRelationError(error)) return withDefaults(userId, null);
  if (error) throw error;
  return withDefaults(userId, data as ReminderSettings | null);
}

export async function upsertReminderSettings(
  patch: ReminderSettingsPatch,
): Promise<ReminderSettings> {
  const { supabase, userId } = await dbContext();
  const { data, error } = await supabase
    .from("reminder_settings")
    .upsert(
      {
        user_id: userId,
        ...patch,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as ReminderSettings;
}
