"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  completeActionFromToday,
  dropActionFromToday,
  markTouchedFromToday,
  snoozeFromToday,
} from "./today-actions";

const BTN =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";
const PRIMARY =
  "rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";

export function ActionReminderControls({
  actionId,
  contactId,
}: {
  actionId: string;
  contactId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function complete() {
    setError(null);
    startTransition(async () => {
      try {
        await completeActionFromToday(actionId, contactId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not mark done.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-wrap gap-2 ${pending ? "opacity-70" : ""}`}>
        <button
          type="button"
          disabled={pending}
          onClick={complete}
          className={PRIMARY}
        >
          Done
        </button>
        <Link href={`/contacts/${contactId}`} className={BTN}>
          Open
        </Link>
        <Link href={`/log?contactId=${contactId}`} className={BTN}>
          Log
        </Link>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function FollowupReminderControls({ contactId }: { contactId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function markTouched() {
    setError(null);
    startTransition(async () => {
      try {
        await markTouchedFromToday(contactId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not mark touched.");
      }
    });
  }

  function snooze() {
    setError(null);
    startTransition(async () => {
      try {
        await snoozeFromToday(contactId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not snooze.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-wrap gap-2 ${pending ? "opacity-70" : ""}`}>
        <button
          type="button"
          disabled={pending}
          onClick={markTouched}
          className={PRIMARY}
        >
          Mark touched
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={snooze}
          className={BTN}
        >
          Snooze 1w
        </button>
        <Link href={`/contacts/${contactId}`} className={BTN}>
          Open
        </Link>
        <Link href={`/log?contactId=${contactId}`} className={BTN}>
          Log
        </Link>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function WaitingReminderControls({
  actionId,
  contactId,
}: {
  actionId: string;
  contactId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function received() {
    setError(null);
    startTransition(async () => {
      try {
        await completeActionFromToday(actionId, contactId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not mark received.");
      }
    });
  }

  function drop() {
    setError(null);
    startTransition(async () => {
      try {
        await dropActionFromToday(actionId, contactId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not drop item.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-wrap gap-2 ${pending ? "opacity-70" : ""}`}>
        <button
          type="button"
          disabled={pending}
          onClick={received}
          className={PRIMARY}
        >
          Received
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={drop}
          className={BTN}
        >
          Drop
        </button>
        <Link href={`/log?contactId=${contactId}`} className={BTN}>
          Follow up
        </Link>
        <Link href={`/contacts/${contactId}`} className={BTN}>
          Open
        </Link>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
