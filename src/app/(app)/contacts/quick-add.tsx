"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { quickAddContact, type QuickAddState } from "./actions";

const initial: QuickAddState = { status: "idle" };
const INPUT =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900";

export function QuickAddContact() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(quickAddContact, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "ok") {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
      >
        + Quick-add contact
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Quick-add (stage: identified)
      </p>
      <input
        name="name"
        required
        autoFocus
        placeholder="Name"
        className={INPUT}
      />
      <input name="company" placeholder="Company" className={INPUT} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state.status === "error" && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
    </form>
  );
}
