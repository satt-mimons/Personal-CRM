"use client";

import { useState, useTransition } from "react";
import type {
  Direction,
  Interaction,
  InteractionType,
} from "@/lib/db/types";
import { formatShortDate, prettyLabel } from "@/lib/utils/format";
import {
  deleteInteractionAction,
  updateInteractionAction,
} from "./actions";

const TYPE_ICON: Record<InteractionType, string> = {
  coffee_chat: "☕",
  call: "📞",
  email: "✉️",
  event: "🎟",
  note: "📝",
};

const TYPES: InteractionType[] = [
  "coffee_chat",
  "call",
  "email",
  "event",
  "note",
];
const DIRECTIONS: Direction[] = ["outbound", "inbound", "mutual"];

const INPUT =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
const LABEL = "text-xs font-medium uppercase tracking-wide text-neutral-500";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

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

function TimelineItem({
  contactId,
  it,
}: {
  contactId: string;
  it: Interaction;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [occurredAt, setOccurredAt] = useState(it.occurred_at);
  const [type, setType] = useState<InteractionType>(it.type ?? "note");
  const [summary, setSummary] = useState(it.summary ?? "");
  const [rawNotes, setRawNotes] = useState(it.raw_notes ?? "");
  const [warmth, setWarmth] = useState(it.warmth ?? 3);
  const [direction, setDirection] = useState<Direction>(
    it.direction ?? "mutual",
  );

  const icon =
    it.type && TYPE_ICON[it.type] ? TYPE_ICON[it.type] : TYPE_ICON.note;

  function startEdit() {
    setOccurredAt(it.occurred_at);
    setType(it.type ?? "note");
    setSummary(it.summary ?? "");
    setRawNotes(it.raw_notes ?? "");
    setWarmth(it.warmth ?? 3);
    setDirection(it.direction ?? "mutual");
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateInteractionAction(it.id, contactId, {
        occurred_at: occurredAt,
        type,
        summary,
        raw_notes: rawNotes,
        warmth,
        direction,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function remove() {
    if (!window.confirm("Delete this interaction? This can’t be undone.")) {
      return;
    }
    startTransition(() => deleteInteractionAction(it.id, contactId));
  }

  if (editing) {
    return (
      <li
        className={`flex flex-col gap-3 rounded-xl border border-neutral-200 p-3 ${
          pending ? "opacity-70" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-700">
            Edit interaction
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditing(false)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Save
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={LABEL}>When</label>
            <input
              className={INPUT}
              type="datetime-local"
              value={toLocalInput(occurredAt)}
              onChange={(e) => setOccurredAt(fromLocalInput(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Type</label>
            <select
              className={INPUT}
              value={type}
              onChange={(e) => setType(e.target.value as InteractionType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {prettyLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Direction</label>
            <select
              className={INPUT}
              value={direction}
              onChange={(e) => setDirection(e.target.value as Direction)}
            >
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Warmth</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setWarmth(n)}
                  className={`h-9 flex-1 rounded-lg border text-sm font-semibold ${
                    warmth === n
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-neutral-300 text-neutral-600"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Summary</label>
          <textarea
            className={`${INPUT} min-h-24 resize-y`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Raw notes</label>
          <textarea
            className={`${INPUT} min-h-28 resize-y`}
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="self-start text-xs font-medium text-red-600 underline underline-offset-2"
        >
          Delete interaction
        </button>
      </li>
    );
  }

  return (
    <li
      className={`rounded-xl border border-neutral-200 p-3 ${
        pending ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left"
          aria-expanded={notesOpen}
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
            <p className="mt-1 text-sm text-neutral-700">{it.summary}</p>
          )}
          {it.raw_notes && (
            <span className="mt-1 block text-xs text-neutral-400">
              {notesOpen ? "Hide notes ▴" : "Show raw notes ▾"}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={startEdit}
          className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600"
        >
          Edit
        </button>
      </div>
      {notesOpen && it.raw_notes && (
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
          {it.raw_notes}
        </pre>
      )}
    </li>
  );
}

export function InteractionTimeline({
  contactId,
  interactions,
}: {
  contactId: string;
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
        <TimelineItem key={it.id} contactId={contactId} it={it} />
      ))}
    </ul>
  );
}
