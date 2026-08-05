import Link from "next/link";
import { getHomeReminders } from "@/lib/db/reminders";
import type { ContactStatus } from "@/lib/db/types";
import {
  formatRelativePast,
  formatShortDate,
  prettyLabel,
  todayIso,
} from "@/lib/utils/format";
import {
  ActionReminderControls,
  FollowupReminderControls,
  WaitingReminderControls,
} from "./reminder-actions";
import {
  ReminderDetailSection,
  ReminderDetailsGroup,
} from "./reminder-disclosure";
import type { ReminderActionItem } from "@/lib/db/reminders";

export const dynamic = "force-dynamic";

function dateTone(date: string | null) {
  if (!date) return "text-neutral-500";
  return date.slice(0, 10) <= todayIso()
    ? "font-semibold text-red-600"
    : "text-neutral-600";
}

function dueText(date: string | null) {
  return date ? `due ${formatShortDate(date)}` : "no due date";
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight text-neutral-900">
        {value}
      </p>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 p-5 text-sm text-neutral-400">
      {children}
    </div>
  );
}

function PersonLine({
  name,
  company,
}: {
  name: string;
  company: string | null;
}) {
  return (
    <span>
      <span className="font-medium text-neutral-900">{name}</span>
      {company && <span className="text-neutral-500"> - {company}</span>}
    </span>
  );
}

function ActionRow({ item }: { item: ReminderActionItem }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-neutral-900">{item.description}</p>
        <p className="mt-1 text-xs text-neutral-500">
          <PersonLine name={item.contact_name} company={item.contact_company} />
          <span className={dateTone(item.due_date)}>
            {" "}
            - {dueText(item.due_date)}
          </span>
        </p>
      </div>
      <ActionReminderControls
        actionId={item.id}
        contactId={item.contact_id}
      />
    </li>
  );
}

function WaitingRow({ item }: { item: ReminderActionItem }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-neutral-900">{item.description}</p>
        <p className="mt-1 text-xs text-neutral-500">
          Waiting on{" "}
          <PersonLine name={item.contact_name} company={item.contact_company} />
          <span className={dateTone(item.due_date)}>
            {" "}
            - {dueText(item.due_date)}
          </span>
        </p>
      </div>
      <WaitingReminderControls
        actionId={item.id}
        contactId={item.contact_id}
      />
    </li>
  );
}

function FollowupRow({ contact }: { contact: ContactStatus }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm">
          <PersonLine name={contact.name} company={contact.company} />
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {prettyLabel(contact.stage)} - touched{" "}
          {formatRelativePast(contact.last_touch_at)} - due{" "}
          {formatShortDate(contact.next_due_date)}
          <span className="font-semibold text-red-600">
            {" "}
            ({contact.days_overdue}d overdue)
          </span>
        </p>
      </div>
      <FollowupReminderControls contactId={contact.contact_id} />
    </li>
  );
}

function UpcomingRow({ contact }: { contact: ContactStatus }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm">
          <PersonLine name={contact.name} company={contact.company} />
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Chat {formatShortDate(contact.upcoming_chat_at)} - prep notes or log
          after the conversation.
        </p>
      </div>
      <FollowupReminderControls contactId={contact.contact_id} />
    </li>
  );
}

export default async function TodayPage() {
  const reminders = await getHomeReminders();
  const nextTask = reminders.tasks[0] ?? null;
  const nextFollowup = reminders.overdueFollowups[0] ?? null;
  const nextChat = reminders.upcomingChats[0] ?? null;
  const hasDetails =
    reminders.tasks.length > 0 ||
    reminders.overdueFollowups.length > 0 ||
    reminders.upcomingChats.length > 0 ||
    reminders.waitingOnThem.length > 0;

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Pipeline command center
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-3xl font-semibold tracking-tight text-white">
                {reminders.todayCount}
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                  {reminders.todayCount === 0
                    ? "Your network is steady today."
                    : `${reminders.todayCount} priority ${reminders.todayCount === 1 ? "item" : "items"} today.`}
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                  {nextTask
                    ? `Next up: ${nextTask.contact_name} - ${dueText(nextTask.due_date)}.`
                    : nextFollowup
                      ? `Next up: follow up with ${nextFollowup.name}.`
                      : nextChat
                        ? `Next up: prep for ${nextChat.name}.`
                        : "No urgent reminders are queued."}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-neutral-500">
              A topline view of tasks, overdue follow-ups, upcoming chats, and
              replies you are waiting on.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/log"
              className="inline-flex justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              + Log interaction
            </Link>
            <Link
              href="/contacts"
              className="inline-flex justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              View contacts
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Today"
          value={reminders.todayCount}
        />
        <Stat
          label="Tasks"
          value={reminders.openTaskCount}
        />
        <Stat
          label="Follow-ups"
          value={reminders.overdueFollowupCount}
        />
        <Stat
          label="Upcoming"
          value={reminders.upcomingChatCount}
        />
      </div>

      {!hasDetails && (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-5">
          <h2 className="text-base font-semibold text-neutral-900">
            No reminders today
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Nothing needs attention right now. You can log a new interaction or
            add someone to keep the pipeline current.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/log"
              className="inline-flex justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              + Log interaction
            </Link>
            <Link
              href="/contacts"
              className="inline-flex justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              View contacts
            </Link>
          </div>
        </div>
      )}

      <ReminderDetailsGroup hasDetails={hasDetails}>
        <div className="flex flex-col gap-2">
          <ReminderDetailSection
            title="Tasks"
            count={reminders.tasks.length}
            summary={
              nextTask
                ? `${nextTask.contact_name} - ${dueText(nextTask.due_date)}`
                : "No open tasks"
            }
          >
            {reminders.tasks.length === 0 ? (
              <EmptyState>No open tasks. Nice and quiet.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {reminders.tasks.map((item) => (
                  <ActionRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </ReminderDetailSection>

          <ReminderDetailSection
            title="Follow-ups due"
            count={reminders.overdueFollowups.length}
            summary={
              nextFollowup
                ? `${nextFollowup.name} is ${nextFollowup.days_overdue}d overdue`
                : "No one is past cadence"
            }
          >
            {reminders.overdueFollowups.length === 0 ? (
              <EmptyState>No one is past cadence right now.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {reminders.overdueFollowups.map((contact) => (
                  <FollowupRow key={contact.contact_id} contact={contact} />
                ))}
              </ul>
            )}
          </ReminderDetailSection>

          <ReminderDetailSection
            title="Upcoming chats"
            count={reminders.upcomingChats.length}
            summary={
              nextChat
                ? `${nextChat.name} on ${formatShortDate(nextChat.upcoming_chat_at)}`
                : "No upcoming chats in the next week"
            }
          >
            {reminders.upcomingChats.length === 0 ? (
              <EmptyState>No upcoming chats in the next week.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {reminders.upcomingChats.map((contact) => (
                  <UpcomingRow key={contact.contact_id} contact={contact} />
                ))}
              </ul>
            )}
          </ReminderDetailSection>

          <ReminderDetailSection
            title="Waiting on them"
            count={reminders.waitingOnThem.length}
            summary={
              reminders.waitingOnThem[0]
                ? `${reminders.waitingOnThem[0].contact_name}: ${reminders.waitingOnThem[0].description}`
                : "No open items owned by someone else"
            }
          >
            {reminders.waitingOnThem.length === 0 ? (
              <EmptyState>No open items owned by someone else.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {reminders.waitingOnThem.map((item) => (
                  <WaitingRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </ReminderDetailSection>
        </div>
      </ReminderDetailsGroup>
    </section>
  );
}
