"use client";

import { useTransition } from "react";
import type { ActionItem } from "@/lib/db/types";
import { formatShortDate } from "@/lib/utils/format";
import { setActionStatusAction } from "./actions";

export function ActionList({
  contactId,
  items,
}: {
  contactId: string;
  items: ActionItem[];
}) {
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">Nothing open.</p>;
  }

  return (
    <ul className={`flex flex-col gap-2 ${pending ? "opacity-70" : ""}`}>
      {items.map((a) => (
        <li
          key={a.id}
          className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-sm text-neutral-800">{a.description}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {a.owner}
              {a.due_date ? ` · due ${formatShortDate(a.due_date)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() =>
                startTransition(() =>
                  setActionStatusAction(a.id, contactId, "done"),
                )
              }
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() =>
                startTransition(() =>
                  setActionStatusAction(a.id, contactId, "dropped"),
                )
              }
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600"
            >
              Drop
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
