"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { NudgeAction } from "@/lib/nudge/engine";
import { markTouchedFromToday, snoozeFromToday } from "./today-actions";

const REASON_LABEL: Record<NudgeAction["reason"], string> = {
  overdue_followup: "Overdue",
  action_item_due: "Action due",
  upcoming_prep: "Upcoming",
};

export function NudgeCard({ nudge }: { nudge: NudgeAction }) {
  const [pending, startTransition] = useTransition();

  return (
    <article
      className={`rounded-xl border border-neutral-200 p-4 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {REASON_LABEL[nudge.reason]} · score {nudge.score}
          </p>
          <h2 className="mt-1 text-base font-semibold text-neutral-900">
            {nudge.headline}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">{nudge.why_now}</p>
        </div>
      </div>

      {nudge.suggested_opener && (
        <blockquote className="mt-3 border-l-2 border-emerald-600 bg-emerald-50/60 px-3 py-2 text-sm leading-relaxed text-emerald-950">
          {nudge.suggested_opener}
        </blockquote>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/contacts/${nudge.contact_id}`}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white"
        >
          Open contact
        </Link>
        <button
          type="button"
          onClick={() =>
            startTransition(() => snoozeFromToday(nudge.contact_id))
          }
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700"
        >
          Snooze 1w
        </button>
        <button
          type="button"
          onClick={() =>
            startTransition(() => markTouchedFromToday(nudge.contact_id))
          }
          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
        >
          Mark touched
        </button>
        <Link
          href={`/log?contactId=${nudge.contact_id}`}
          className="rounded-lg border border-emerald-600 px-3 py-2 text-xs font-semibold text-emerald-700"
        >
          Log
        </Link>
      </div>
    </article>
  );
}
