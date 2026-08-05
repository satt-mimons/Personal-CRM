import { dbContext } from "./session";
import type { ActionItem, ContactStatus } from "./types";
import { addDaysIso, todayIso } from "@/lib/utils/format";

const EXCLUDED_FOLLOWUP_STAGES = new Set(["offer", "dormant"]);

export interface ReminderActionItem extends ActionItem {
  contact_name: string;
  contact_company: string | null;
}

export interface HomeReminders {
  todayCount: number;
  openTaskCount: number;
  overdueFollowupCount: number;
  upcomingChatCount: number;
  waitingOnThemCount: number;
  tasks: ReminderActionItem[];
  overdueFollowups: ContactStatus[];
  upcomingChats: ContactStatus[];
  waitingOnThem: ReminderActionItem[];
}

function ymd(v: string | null | undefined): string | null {
  return v ? v.slice(0, 10) : null;
}

function isSoonOrOverdue(dueDate: string | null, soon: string) {
  if (!dueDate) return false;
  const d = ymd(dueDate);
  return Boolean(d && d <= soon);
}

function sortActions(a: ReminderActionItem, b: ReminderActionItem) {
  const aDue = ymd(a.due_date) ?? "9999-12-31";
  const bDue = ymd(b.due_date) ?? "9999-12-31";
  if (aDue !== bDue) return aDue.localeCompare(bDue);
  return a.contact_name.localeCompare(b.contact_name);
}

function sortStatusesByDate(a: ContactStatus, b: ContactStatus) {
  return a.next_due_date.localeCompare(b.next_due_date) ||
    a.name.localeCompare(b.name);
}

function sortUpcoming(a: ContactStatus, b: ContactStatus) {
  const aDate = ymd(a.upcoming_chat_at) ?? "9999-12-31";
  const bDate = ymd(b.upcoming_chat_at) ?? "9999-12-31";
  return aDate.localeCompare(bDate) || a.name.localeCompare(b.name);
}

export async function getHomeReminders(): Promise<HomeReminders> {
  const { supabase } = await dbContext();
  const today = todayIso();
  const soon = addDaysIso(7);
  const prepWindow = addDaysIso(2);

  const [statusesRes, actionsRes] = await Promise.all([
    supabase.from("contact_status").select("*"),
    supabase.from("action_items").select("*").eq("status", "open"),
  ]);

  if (statusesRes.error) throw statusesRes.error;
  if (actionsRes.error) throw actionsRes.error;

  const statuses = (statusesRes.data ?? []) as ContactStatus[];
  const actions = (actionsRes.data ?? []) as ActionItem[];
  const contactsById = new Map(statuses.map((s) => [s.contact_id, s]));

  const enriched = actions
    .map((a): ReminderActionItem | null => {
      const c = contactsById.get(a.contact_id);
      if (!c) return null;
      return {
        ...a,
        contact_name: c.name,
        contact_company: c.company,
      };
    })
    .filter((a): a is ReminderActionItem => a !== null);

  const tasks = enriched
    .filter((a) => a.owner === "me")
    .sort(sortActions);

  const waitingOnThem = enriched
    .filter((a) => a.owner === "them")
    .sort(sortActions);

  const overdueFollowups = statuses
    .filter(
      (s) =>
        s.days_overdue > 0 && !EXCLUDED_FOLLOWUP_STAGES.has(s.stage),
    )
    .sort(sortStatusesByDate);

  const upcomingChats = statuses
    .filter((s) => {
      const chatAt = ymd(s.upcoming_chat_at);
      return Boolean(chatAt && chatAt >= today && chatAt <= soon);
    })
    .sort(sortUpcoming);

  const taskDueCount = tasks.filter((a) =>
    isSoonOrOverdue(a.due_date, prepWindow),
  ).length;
  const upcomingPrepCount = upcomingChats.filter((c) => {
    const chatAt = ymd(c.upcoming_chat_at);
    return Boolean(chatAt && chatAt <= prepWindow);
  }).length;

  return {
    todayCount: taskDueCount + overdueFollowups.length + upcomingPrepCount,
    openTaskCount: tasks.length,
    overdueFollowupCount: overdueFollowups.length,
    upcomingChatCount: upcomingChats.length,
    waitingOnThemCount: waitingOnThem.length,
    tasks,
    overdueFollowups,
    upcomingChats,
    waitingOnThem,
  };
}

export async function getReminderNavCount(): Promise<number> {
  const reminders = await getHomeReminders();
  return reminders.todayCount;
}
