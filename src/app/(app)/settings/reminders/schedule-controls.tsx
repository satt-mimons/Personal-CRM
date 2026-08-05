"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReminderDigestFrequency } from "@/lib/db/types";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Phoenix", label: "Arizona Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Central Europe" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export function ScheduleControls({
  frequency,
  customCadenceDays,
  digestTime,
  timezone,
}: {
  frequency: ReminderDigestFrequency;
  customCadenceDays: number | null;
  digestTime: string;
  timezone?: string | null;
}) {
  const initialTimezone = timezone || "America/New_York";
  const [selectedFrequency, setSelectedFrequency] = useState(frequency);
  const [selectedTimezone, setSelectedTimezone] = useState(initialTimezone);
  const timezoneOptions = useMemo(() => {
    if (TIMEZONES.some((option) => option.value === selectedTimezone)) {
      return TIMEZONES;
    }
    return [
      { value: selectedTimezone, label: selectedTimezone.replaceAll("_", " ") },
      ...TIMEZONES,
    ];
  }, [selectedTimezone]);

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected || initialTimezone !== "America/New_York") return;
    setSelectedTimezone(detected);
  }, [initialTimezone]);

  return (
    <div className="grid gap-3 sm:w-[20rem] sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Frequency
        <select
          name="digest_frequency"
          value={selectedFrequency}
          onChange={(event) =>
            setSelectedFrequency(
              event.target.value as ReminderDigestFrequency,
            )
          }
          className="h-9 rounded-md border border-neutral-300 bg-white px-2.5 text-sm font-medium normal-case tracking-normal text-neutral-900"
        >
          <option value="daily">Daily</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekly">Weekly</option>
          <option value="custom">Custom cadence</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Send at
        <input
          type="time"
          name="digest_time"
          defaultValue={digestTime.slice(0, 5)}
          className="h-9 rounded-md border border-neutral-300 px-2.5 text-sm font-medium normal-case tracking-normal text-neutral-900"
        />
      </label>

      {selectedFrequency === "custom" && (
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-400 sm:col-span-2">
          Custom cadence
          <span className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-neutral-300 px-2.5 py-1 text-sm normal-case tracking-normal text-neutral-600">
            <span>Repeat every</span>
            <input
              type="number"
              name="custom_cadence_days"
              min="1"
              max="365"
              defaultValue={customCadenceDays ?? 14}
              aria-label="Custom cadence days"
              className="h-8 w-20 rounded border border-neutral-200 px-2 text-center text-sm font-semibold text-neutral-900 outline-none"
            />
            <span>days</span>
          </span>
        </label>
      )}

      {selectedFrequency !== "custom" && (
        <input
          type="hidden"
          name="custom_cadence_days"
          value={customCadenceDays ?? 14}
        />
      )}

      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-400 sm:col-span-2">
        Timezone
        <select
          name="timezone"
          value={selectedTimezone}
          onChange={(event) => setSelectedTimezone(event.target.value)}
          className="h-9 rounded-md border border-neutral-300 bg-white px-2.5 text-sm font-medium normal-case tracking-normal text-neutral-900"
        >
          {timezoneOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
