import Link from "next/link";
import { getReminderSettings } from "@/lib/db/reminder-settings";
import { createClient } from "@/lib/supabase/server";
import { saveReminderSettingsAction } from "./actions";
import { ScheduleControls } from "./schedule-controls";

export const dynamic = "force-dynamic";

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-neutral-200 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-neutral-500">
          {description}
        </p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-neutral-300 accent-neutral-900"
      />
      {label}
    </label>
  );
}

export default async function ReminderSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [{ error, saved }, settings, supabase] = await Promise.all([
    searchParams,
    getReminderSettings(),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "your account email";

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <Link
          href="/"
          className="text-sm font-medium text-neutral-500 hover:text-neutral-900"
        >
          Back to Today
        </Link>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Reminder settings
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
              Email reminders
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
              Choose whether Pipeline sends a lightweight reminder digest for
              the same work that appears on your homepage.
            </p>
          </div>
          {saved === "1" && (
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
              Saved
            </div>
          )}
        </div>
      </div>

      <form
        action={saveReminderSettingsAction}
        className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
      >
        {error === "setup" && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Reminder settings need the latest database migration before they can
            be saved.
          </div>
        )}
        <div className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              Email digest
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Emails will go to {email}.
            </p>
          </div>
          <label className="inline-flex items-center gap-2.5 rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-800">
            <input
              type="checkbox"
              name="email_enabled"
              defaultChecked={settings.email_enabled}
              className="h-4 w-4 rounded border-neutral-300 accent-neutral-900"
            />
            Email reminders on
          </label>
        </div>

        <SettingRow
          title="Schedule"
          description="Start with one digest instead of a stream of one-off emails. It keeps reminders useful without making your inbox noisy."
        >
          <ScheduleControls
            frequency={settings.digest_frequency}
            customCadenceDays={settings.custom_cadence_days}
            digestTime={settings.digest_time}
            timezone={settings.timezone}
          />
        </SettingRow>

        <SettingRow
          title="Include"
          description="Choose what you want included when Pipeline emails your reminders."
        >
          <div className="grid max-w-sm gap-x-5 gap-y-3 sm:grid-cols-2">
            <Checkbox
              name="include_tasks"
              label="Tasks"
              defaultChecked={settings.include_tasks}
            />
            <Checkbox
              name="include_followups"
              label="Follow-ups"
              defaultChecked={settings.include_followups}
            />
            <Checkbox
              name="include_waiting"
              label="Waiting on them"
              defaultChecked={settings.include_waiting}
            />
            <Checkbox
              name="include_upcoming"
              label="Upcoming chats"
              defaultChecked={settings.include_upcoming}
            />
          </div>
        </SettingRow>

        <div className="flex justify-end border-t border-neutral-200 pt-5">
          <button
            type="submit"
            className="inline-flex justify-center rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
          >
            Save settings
          </button>
        </div>
      </form>
    </section>
  );
}
