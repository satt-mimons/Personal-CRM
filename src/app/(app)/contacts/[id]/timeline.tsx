"use client";

import { useState } from "react";
import type { Interaction, InteractionType } from "@/lib/db/types";
import { formatShortDate, prettyLabel } from "@/lib/utils/format";

const TYPE_ICON: Record<InteractionType, string> = {
  coffee_chat: "☕",
  call: "📞",
  email: "✉️",
  event: "🎟",
  note: "📝",
};

function WarmthDots({ warmth }: { warmth: number | null }) {
  if (warmth == null) return null;
  return (
    <span className="inline-flex gap-0.5" aria-label={`Warmth ${warmth} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${
            n <= warmth ? "bg-emerald-600" : "bg-neutral-200"
          }`}
        />
      ))}
    </span>
  );
}

function TimelineItem({ it }: { it: Interaction }) {
  const [open, setOpen] = useState(false);
  const icon =
    it.type && TYPE_ICON[it.type] ? TYPE_ICON[it.type] : TYPE_ICON.note;

  return (
    <li className="rounded-xl border border-neutral-200 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col gap-1 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden="true">{icon}</span>
            <span className="capitalize">{prettyLabel(it.type) || "note"}</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-neutral-500">
            <WarmthDots warmth={it.warmth} />
            {formatShortDate(it.occurred_at)}
          </span>
        </div>
        {it.summary && (
          <p className="text-sm text-neutral-700">{it.summary}</p>
        )}
        {it.raw_notes && (
          <span className="text-xs text-neutral-400">
            {open ? "Hide notes ▴" : "Show raw notes ▾"}
          </span>
        )}
      </button>
      {open && it.raw_notes && (
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
          {it.raw_notes}
        </pre>
      )}
    </li>
  );
}

export function InteractionTimeline({
  interactions,
}: {
  interactions: Interaction[];
}) {
  if (interactions.length === 0) {
    return (
      <p className="text-sm text-neutral-400">No interactions logged yet.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {interactions.map((it) => (
        <TimelineItem key={it.id} it={it} />
      ))}
    </ul>
  );
}
