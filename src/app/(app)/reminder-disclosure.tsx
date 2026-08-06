"use client";

import { useState } from "react";

export function ReminderDetailsGroup({
  action,
  hasDetails,
  children,
}: {
  action?: React.ReactNode;
  hasDetails: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const chevron = (
    <span
      className={`flex h-7 w-5 flex-col items-center justify-center text-[10px] leading-[0.55rem] text-neutral-400 transition ${
        open ? "rotate-180" : ""
      }`}
      aria-hidden="true"
    >
      <span>v</span>
      <span>v</span>
    </span>
  );

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold text-neutral-900">
              Reminder details
            </span>
            <span className="mt-0.5 block text-sm text-neutral-500">
              {hasDetails
                ? "Expand to see tasks, follow-ups, chats, and outstanding replies."
                : "Nothing needs attention right now."}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {action && <div className="hidden sm:block">{action}</div>}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md px-1 hover:bg-neutral-50"
            aria-expanded={open}
            aria-label={open ? "Collapse reminder details" : "Expand reminder details"}
          >
            {chevron}
          </button>
        </div>
      </div>
      {open && <div className="border-t border-neutral-100 p-3">{children}</div>}
    </section>
  );
}

export function ReminderDetailSection({
  title,
  count,
  summary,
  children,
}: {
  title: string;
  count: number;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-neutral-800">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-neutral-500">
            {summary}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
            {count}
          </span>
          <span
            className={`text-sm text-neutral-400 transition ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            v
          </span>
        </span>
      </button>
      {open && <div className="border-t border-neutral-100 p-3">{children}</div>}
    </section>
  );
}
