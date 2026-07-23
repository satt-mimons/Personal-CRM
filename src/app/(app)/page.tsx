import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contactsToNudgeInputs, rankAndAttachOpeners } from "@/lib/nudge/build";
import { formatShortDate } from "@/lib/utils/format";
import { NudgeCard } from "./nudge-card";
import type { ActionItem, ContactStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);

  const [statusRes, actionsRes, interactionsRes, upcomingRes] =
    await Promise.all([
      supabase.from("contact_status").select("*"),
      supabase
        .from("action_items")
        .select("*")
        .eq("status", "open"),
      supabase
        .from("interactions")
        .select("contact_id, summary, occurred_at")
        .order("occurred_at", { ascending: false }),
      supabase
        .from("contact_status")
        .select("*")
        .not("upcoming_chat_at", "is", null)
        .gte("upcoming_chat_at", today)
        .order("upcoming_chat_at", { ascending: true })
        .limit(10),
    ]);

  if (statusRes.error) throw statusRes.error;
  if (actionsRes.error) throw actionsRes.error;
  if (interactionsRes.error) throw interactionsRes.error;

  const statuses = (statusRes.data ?? []) as ContactStatus[];
  const actions = (actionsRes.data ?? []) as ActionItem[];
  const summaries = new Map<string, string>();
  for (const row of interactionsRes.data ?? []) {
    const r = row as { contact_id: string; summary: string | null };
    if (!summaries.has(r.contact_id) && r.summary) {
      summaries.set(r.contact_id, r.summary);
    }
  }

  const { inputs, contexts } = contactsToNudgeInputs(
    statuses,
    actions,
    summaries,
  );
  const nudges = await rankAndAttachOpeners(inputs, contexts, {
    withOpeners: true,
  });
  const upcoming = (upcomingRes.data ?? []) as ContactStatus[];

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Today</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {nudges.length === 0
            ? "Nothing cleared the bar — protect the signal."
            : `${nudges.length} nudge${nudges.length === 1 ? "" : "s"} worth acting on.`}
        </p>
      </div>

      {nudges.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
          No nudges above the score threshold. Enjoy the quiet — or{" "}
          <Link href="/log" className="text-emerald-700 underline">
            log something
          </Link>
          .
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {nudges.map((n) => (
            <li key={n.contact_id}>
              <NudgeCard nudge={n} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-700">
          Upcoming chats
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-400">
            None flagged yet. Set upcoming_chat_at on a contact when you have a
            chat on the calendar.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {upcoming.map((c) => (
              <li key={c.contact_id}>
                <Link
                  href={`/contacts/${c.contact_id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                >
                  <span>
                    <span className="text-sm font-medium">{c.name}</span>
                    {c.company && (
                      <span className="text-xs text-neutral-500">
                        {" "}
                        · {c.company}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {formatShortDate(c.upcoming_chat_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
