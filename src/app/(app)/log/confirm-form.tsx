"use client";

import { useState, useTransition } from "react";
import type { ContactPickerRow } from "@/lib/db/contacts";
import type { ExtractionResult } from "@/lib/llm/extract";
import {
  STAGES,
  type Direction,
  type InteractionType,
  type Stage,
  type Tier,
  type ActionOwner,
} from "@/lib/db/types";
import { saveInteractionAction } from "./actions";
import type {
  DuplicateInfo,
  EditableActionItem,
  EditableContact,
  SavePayload,
} from "./types";

const INPUT =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900";
const LABEL = "text-xs font-medium uppercase tracking-wide text-neutral-500";
const NOTE = "text-xs text-neutral-500";

const TYPES: InteractionType[] = ["coffee_chat", "call", "email", "event", "note"];
const DIRECTIONS: Direction[] = ["outbound", "inbound", "mutual"];
const TIERS: Tier[] = ["priority", "warm", "background"];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
function prettyType(t: string) {
  return t.replace(/_/g, " ");
}

export function ConfirmForm({
  rawText,
  extraction,
  duplicates,
  pickedContact,
  onBack,
}: {
  rawText: string;
  extraction: ExtractionResult;
  duplicates: DuplicateInfo[];
  pickedContact: ContactPickerRow | null;
  onBack: () => void;
}) {
  const [contact, setContact] = useState<EditableContact>(() => ({
    name: extraction.contact?.name ?? "",
    company: extraction.contact?.company ?? null,
    title: extraction.contact?.title ?? null,
    email: extraction.contact?.email ?? null,
    linkedin_url: extraction.contact?.linkedin_url ?? null,
    vertical: extraction.contact?.vertical ?? null,
    tier: extraction.suggested_tier,
  }));
  const [interaction, setInteraction] = useState(() => ({
    occurred_at: extraction.interaction.occurred_at,
    type: extraction.interaction.type,
    summary: extraction.interaction.summary,
    warmth: extraction.interaction.warmth,
    direction: extraction.interaction.direction,
  }));
  const [actionItems, setActionItems] = useState<EditableActionItem[]>(
    () => extraction.action_items.map((a) => ({ ...a })),
  );
  const [stage, setStage] = useState<Stage>(extraction.suggested_stage);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  const existingContactId = pickedContact?.id ?? mergeTargetId;
  const isNewContact = !existingContactId;
  const mergedName = duplicates.find((d) => d.id === mergeTargetId)?.name;

  function setContactField<K extends keyof EditableContact>(
    key: K,
    value: EditableContact[K],
  ) {
    setContact((c) => ({ ...c, [key]: value }));
  }

  function save() {
    setError(null);
    if (isNewContact && contact.name.trim() === "") {
      setError("Give the contact a name.");
      return;
    }
    const payload: SavePayload = {
      rawText,
      existingContactId: existingContactId ?? null,
      contact: isNewContact
        ? {
            ...contact,
            name: contact.name.trim(),
            company: contact.company?.trim() || null,
            title: contact.title?.trim() || null,
            email: contact.email?.trim() || null,
            linkedin_url: contact.linkedin_url?.trim() || null,
            vertical: contact.vertical?.trim() || null,
          }
        : null,
      interaction,
      actionItems,
      stage,
    };
    startTransition(async () => {
      const res = await saveInteractionAction(payload);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review & save</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything below is editable. Fix anything, then save.
        </p>
      </div>

      {/* Duplicate warning */}
      {isNewContact && duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            This might already be in your network.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {duplicates.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-sm text-amber-900">
                  {d.name}
                  {d.company ? ` · ${d.company}` : ""}
                  <span className="ml-1 text-xs text-amber-700">({d.reason})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMergeTargetId(d.id)}
                  className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white"
                >
                  Merge into this
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contact section */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-700">Contact</h2>

        {!isNewContact ? (
          <div className="flex items-center justify-between rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm">
            <span>
              Logging against{" "}
              <span className="font-medium">
                {pickedContact?.name ?? mergedName}
              </span>
            </span>
            {mergeTargetId && !pickedContact && (
              <button
                type="button"
                onClick={() => setMergeTargetId(null)}
                className="text-xs text-neutral-500 underline underline-offset-2"
              >
                Create new instead
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className={LABEL}>Name</label>
              <input
                className={INPUT}
                value={contact.name}
                onChange={(e) => setContactField("name", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Company</label>
                <input
                  className={INPUT}
                  value={contact.company ?? ""}
                  onChange={(e) => setContactField("company", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Title</label>
                <input
                  className={INPUT}
                  value={contact.title ?? ""}
                  onChange={(e) => setContactField("title", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Email</label>
                <input
                  className={INPUT}
                  type="email"
                  value={contact.email ?? ""}
                  onChange={(e) => setContactField("email", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Vertical</label>
                <input
                  className={INPUT}
                  value={contact.vertical ?? ""}
                  onChange={(e) => setContactField("vertical", e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className={LABEL}>LinkedIn URL</label>
              <input
                className={INPUT}
                value={contact.linkedin_url ?? ""}
                onChange={(e) => setContactField("linkedin_url", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={LABEL}>Tier</label>
              <select
                className={INPUT}
                value={contact.tier}
                onChange={(e) =>
                  setContactField("tier", e.target.value as Tier)
                }
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {extraction.suggested_tier_justification && (
                <p className={NOTE}>{extraction.suggested_tier_justification}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Interaction section */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-700">Interaction</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={LABEL}>When</label>
            <input
              className={INPUT}
              type="datetime-local"
              value={toLocalInput(interaction.occurred_at)}
              onChange={(e) =>
                setInteraction((i) => ({
                  ...i,
                  occurred_at: fromLocalInput(e.target.value),
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Type</label>
            <select
              className={INPUT}
              value={interaction.type}
              onChange={(e) =>
                setInteraction((i) => ({
                  ...i,
                  type: e.target.value as InteractionType,
                }))
              }
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {prettyType(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Summary</label>
          <textarea
            className={`${INPUT} min-h-24 resize-y`}
            value={interaction.summary}
            onChange={(e) =>
              setInteraction((i) => ({ ...i, summary: e.target.value }))
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Warmth</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setInteraction((i) => ({ ...i, warmth: n }))}
                className={`h-10 flex-1 rounded-lg border text-sm font-semibold ${
                  interaction.warmth === n
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-neutral-300 text-neutral-600"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {extraction.interaction.warmth_justification && (
            <p className={NOTE}>{extraction.interaction.warmth_justification}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Direction</label>
          <select
            className={INPUT}
            value={interaction.direction}
            onChange={(e) =>
              setInteraction((i) => ({
                ...i,
                direction: e.target.value as Direction,
              }))
            }
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stage */}
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Stage</label>
        <select
          className={INPUT}
          value={stage}
          onChange={(e) => setStage(e.target.value as Stage)}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {prettyType(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Action items */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Action items</h2>
          <button
            type="button"
            onClick={() =>
              setActionItems((rows) => [
                ...rows,
                { description: "", owner: "me", due_date: null },
              ])
            }
            className="text-sm text-emerald-700 underline underline-offset-2"
          >
            + Add
          </button>
        </div>
        {actionItems.length === 0 && (
          <p className={NOTE}>None detected. Add one if you promised something.</p>
        )}
        {actionItems.map((a, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3"
          >
            <input
              className={INPUT}
              placeholder="What needs to happen"
              value={a.description}
              onChange={(e) =>
                setActionItems((rows) =>
                  rows.map((r, i) =>
                    i === idx ? { ...r, description: e.target.value } : r,
                  ),
                )
              }
            />
            <div className="flex gap-2">
              <select
                className={INPUT}
                value={a.owner}
                onChange={(e) =>
                  setActionItems((rows) =>
                    rows.map((r, i) =>
                      i === idx
                        ? { ...r, owner: e.target.value as ActionOwner }
                        : r,
                    ),
                  )
                }
              >
                <option value="me">me</option>
                <option value="them">them</option>
              </select>
              <input
                className={INPUT}
                type="date"
                value={a.due_date ?? ""}
                onChange={(e) =>
                  setActionItems((rows) =>
                    rows.map((r, i) =>
                      i === idx
                        ? { ...r, due_date: e.target.value || null }
                        : r,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() =>
                  setActionItems((rows) => rows.filter((_, i) => i !== idx))
                }
                className="shrink-0 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-500"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Actions */}
      <div className="sticky bottom-20 flex gap-3 sm:bottom-4">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base font-medium text-neutral-700 disabled:opacity-50"
        >
          Back to notes
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
