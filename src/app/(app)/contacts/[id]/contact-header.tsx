"use client";

import { useState, useTransition } from "react";
import type { Contact } from "@/lib/db/types";
import { STAGES, type Stage, type Tier } from "@/lib/db/types";
import {
  setContactStageAction,
  setContactTierAction,
  updateContactProfileAction,
} from "./actions";

const TIERS: Tier[] = ["priority", "warm", "background"];
const SELECT =
  "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-900";
const INPUT =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
const LABEL = "text-xs font-medium uppercase tracking-wide text-neutral-500";

const TIER_STYLE: Record<Tier, string> = {
  priority: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warm: "bg-amber-100 text-amber-900 border-amber-200",
  background: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

type ProfileDraft = {
  name: string;
  company: string;
  title: string;
  email: string;
  linkedin_url: string;
  vertical: string;
  notes: string;
  upcoming_chat_at: string;
};

function draftFromContact(c: Contact): ProfileDraft {
  return {
    name: c.name,
    company: c.company ?? "",
    title: c.title ?? "",
    email: c.email ?? "",
    linkedin_url: c.linkedin_url ?? "",
    vertical: c.vertical ?? "",
    notes: c.notes ?? "",
    upcoming_chat_at: c.upcoming_chat_at?.slice(0, 10) ?? "",
  };
}

export function ContactHeader({ contact }: { contact: Contact }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    draftFromContact(contact),
  );
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(draftFromContact(contact));
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateContactProfileAction(contact.id, {
        name: draft.name,
        company: draft.company,
        title: draft.title,
        email: draft.email,
        linkedin_url: draft.linkedin_url,
        vertical: draft.vertical,
        notes: draft.notes,
        upcoming_chat_at: draft.upcoming_chat_at,
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
      <div
        className={`flex flex-col gap-3 rounded-xl border border-neutral-200 p-3 ${
          pending ? "opacity-70" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-700">
            Edit contact
          </h2>
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
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className={LABEL}>Name</label>
            <input
              className={INPUT}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Company</label>
            <input
              className={INPUT}
              value={draft.company}
              onChange={(e) =>
                setDraft((d) => ({ ...d, company: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Title</label>
            <input
              className={INPUT}
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Email</label>
            <input
              className={INPUT}
              type="email"
              value={draft.email}
              onChange={(e) =>
                setDraft((d) => ({ ...d, email: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Vertical</label>
            <input
              className={INPUT}
              value={draft.vertical}
              onChange={(e) =>
                setDraft((d) => ({ ...d, vertical: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className={LABEL}>LinkedIn URL</label>
            <input
              className={INPUT}
              value={draft.linkedin_url}
              onChange={(e) =>
                setDraft((d) => ({ ...d, linkedin_url: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Upcoming chat</label>
            <input
              className={INPUT}
              type="date"
              value={draft.upcoming_chat_at}
              onChange={(e) =>
                setDraft((d) => ({ ...d, upcoming_chat_at: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className={LABEL}>Notes</label>
            <textarea
              className={`${INPUT} min-h-20 resize-y`}
              value={draft.notes}
              onChange={(e) =>
                setDraft((d) => ({ ...d, notes: e.target.value }))
              }
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${pending ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {contact.name}
          </h1>
          <p className="text-sm text-neutral-500">
            {contact.title && contact.company
              ? `${contact.title} @ ${contact.company}`
              : contact.title || contact.company || "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={startEdit}
          className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
        >
          Edit
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {contact.vertical && (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {contact.vertical}
          </span>
        )}

        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Tier
          <select
            className={`${SELECT} capitalize ${TIER_STYLE[contact.tier]}`}
            value={contact.tier}
            onChange={(e) => {
              const tier = e.target.value as Tier;
              startTransition(() => setContactTierAction(contact.id, tier));
            }}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Stage
          <select
            className={SELECT}
            value={contact.stage}
            onChange={(e) => {
              const stage = e.target.value as Stage;
              startTransition(() => setContactStageAction(contact.id, stage));
            }}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(contact.email || contact.linkedin_url || contact.upcoming_chat_at) && (
        <div className="flex flex-wrap gap-3 text-sm">
          {contact.email && (
            <a
              className="text-emerald-700 underline underline-offset-2"
              href={`mailto:${contact.email}`}
            >
              {contact.email}
            </a>
          )}
          {contact.linkedin_url && (
            <a
              className="text-emerald-700 underline underline-offset-2"
              href={contact.linkedin_url}
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          )}
          {contact.upcoming_chat_at && (
            <span className="text-neutral-500">
              Chat {contact.upcoming_chat_at.slice(0, 10)}
            </span>
          )}
        </div>
      )}

      {contact.notes && (
        <p className="whitespace-pre-wrap text-sm text-neutral-600">
          {contact.notes}
        </p>
      )}
    </div>
  );
}
