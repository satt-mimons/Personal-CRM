"use client";

import { useState, useTransition } from "react";
import type { ActionItem, ActionOwner } from "@/lib/db/types";
import { formatShortDate } from "@/lib/utils/format";
import { setActionStatusAction, updateActionItemAction } from "./actions";

const INPUT =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
const LABEL = "text-xs font-medium uppercase tracking-wide text-neutral-500";

function ActionRow({
  contactId,
  item,
}: {
  contactId: string;
  item: ActionItem;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(item.description);
  const [owner, setOwner] = useState<ActionOwner>(item.owner);
  const [dueDate, setDueDate] = useState(item.due_date?.slice(0, 10) ?? "");
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDescription(item.description);
    setOwner(item.owner);
    setDueDate(item.due_date?.slice(0, 10) ?? "");
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateActionItemAction(item.id, contactId, {
        description,
        owner,
        due_date: dueDate || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <li
        className={`flex flex-col gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 ${
          pending ? "opacity-70" : ""
        }`}
      >
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Description</label>
          <textarea
            className={`${INPUT} min-h-16 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Owner</label>
            <select
              className={INPUT}
              value={owner}
              onChange={(e) => setOwner(e.target.value as ActionOwner)}
            >
              <option value="me">me</option>
              <option value="them">them</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Due date</label>
            <input
              className={INPUT}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Save
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setEditing(false)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
        pending ? "opacity-70" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm text-neutral-800">{item.description}</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {item.owner}
          {item.due_date ? ` · due ${formatShortDate(item.due_date)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={startEdit}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() =>
            startTransition(() =>
              setActionStatusAction(item.id, contactId, "done"),
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
              setActionStatusAction(item.id, contactId, "dropped"),
            )
          }
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600"
        >
          Drop
        </button>
      </div>
    </li>
  );
}

export function ActionList({
  contactId,
  items,
}: {
  contactId: string;
  items: ActionItem[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">Nothing open.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((a) => (
        <ActionRow key={a.id} contactId={contactId} item={a} />
      ))}
    </ul>
  );
}
