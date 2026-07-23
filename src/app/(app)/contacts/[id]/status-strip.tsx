"use client";

import { useState, useTransition } from "react";
import type { ContactStatus } from "@/lib/db/types";
import {
  addDaysIso,
  formatRelativePast,
  formatShortDate,
  todayIso,
} from "@/lib/utils/format";
import { snoozeContactAction } from "./actions";

const BTN =
  "rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50";

export function StatusStrip({ status }: { status: ContactStatus }) {
  const [pending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(false);
  const overdue = status.days_overdue > 0;

  function snooze(days: number) {
    const until = addDaysIso(days);
    startTransition(() => snoozeContactAction(status.contact_id, until));
    setShowCustom(false);
  }

  function snoozeCustom(date: string) {
    if (!date) return;
    startTransition(() => snoozeContactAction(status.contact_id, date));
    setShowCustom(false);
  }

  function clearSnooze() {
    startTransition(() => snoozeContactAction(status.contact_id, null));
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 ${
        pending ? "opacity-70" : ""
      }`}
    >
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Last touch
          </p>
          <p className="mt-0.5 font-medium text-neutral-800">
            {formatRelativePast(status.last_touch_at)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Next due
          </p>
          <p
            className={`mt-0.5 font-medium ${
              overdue ? "text-red-600" : "text-neutral-800"
            }`}
          >
            {formatShortDate(status.next_due_date)}
            {overdue ? ` · ${status.days_overdue}d overdue` : ""}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Snoozed until
          </p>
          <p className="mt-0.5 font-medium text-neutral-800">
            {status.snoozed_until
              ? formatShortDate(status.snoozed_until)
              : "—"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">Snooze</span>
        <button type="button" className={BTN} onClick={() => snooze(7)}>
          1w
        </button>
        <button type="button" className={BTN} onClick={() => snooze(14)}>
          2w
        </button>
        <button type="button" className={BTN} onClick={() => snooze(30)}>
          1mo
        </button>
        <button
          type="button"
          className={BTN}
          onClick={() => setShowCustom((v) => !v)}
        >
          Custom
        </button>
        {status.snoozed_until && (
          <button
            type="button"
            className={`${BTN} text-neutral-500`}
            onClick={clearSnooze}
          >
            Clear
          </button>
        )}
      </div>

      {showCustom && (
        <input
          type="date"
          min={todayIso()}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 sm:w-auto"
          onChange={(e) => snoozeCustom(e.target.value)}
        />
      )}
    </div>
  );
}
