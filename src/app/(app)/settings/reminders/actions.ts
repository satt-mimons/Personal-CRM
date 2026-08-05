"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  upsertReminderSettings,
  type ReminderSettingsPatch,
} from "@/lib/db/reminder-settings";
import type { ReminderDigestFrequency } from "@/lib/db/types";

const FREQUENCIES = new Set(["daily", "weekdays", "weekly", "custom"]);

function checkbox(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function parseFrequency(value: FormDataEntryValue | null) {
  const frequency = typeof value === "string" ? value : "";
  if (!FREQUENCIES.has(frequency)) return "daily";
  return frequency as ReminderDigestFrequency;
}

function parseTime(value: FormDataEntryValue | null) {
  const time = typeof value === "string" ? value : "";
  if (/^\d{2}:\d{2}$/.test(time)) return time;
  return "09:00";
}

function parseTimezone(value: FormDataEntryValue | null) {
  const timezone = typeof value === "string" ? value.trim() : "";
  if (!timezone || timezone.length > 64) return "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "America/New_York";
  }
}

function parseCustomCadenceDays(value: FormDataEntryValue | null) {
  const cadence = Number(value);
  if (!Number.isInteger(cadence)) return 14;
  return Math.min(365, Math.max(1, cadence));
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

export async function saveReminderSettingsAction(formData: FormData) {
  const digestFrequency = parseFrequency(formData.get("digest_frequency"));
  const patch: ReminderSettingsPatch = {
    email_enabled: checkbox(formData, "email_enabled"),
    digest_frequency: digestFrequency,
    custom_cadence_days:
      digestFrequency === "custom"
        ? parseCustomCadenceDays(formData.get("custom_cadence_days"))
        : null,
    digest_time: parseTime(formData.get("digest_time")),
    timezone: parseTimezone(formData.get("timezone")),
    include_tasks: checkbox(formData, "include_tasks"),
    include_followups: checkbox(formData, "include_followups"),
    include_waiting: checkbox(formData, "include_waiting"),
    include_upcoming: checkbox(formData, "include_upcoming"),
  };

  try {
    await upsertReminderSettings(patch);
  } catch (error) {
    if (isMissingRelationError(error)) {
      redirect("/settings/reminders?error=setup");
    }
    throw error;
  }
  revalidatePath("/settings/reminders");
  revalidatePath("/");
  redirect("/settings/reminders?saved=1");
}
