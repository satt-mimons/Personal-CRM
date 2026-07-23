"use client";

import { useTransition } from "react";
import type { Contact } from "@/lib/db/types";
import { STAGES, type Stage, type Tier } from "@/lib/db/types";
import { setContactStageAction, setContactTierAction } from "./actions";

const TIERS: Tier[] = ["priority", "warm", "background"];
const SELECT =
  "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-900";

const TIER_STYLE: Record<Tier, string> = {
  priority: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warm: "bg-amber-100 text-amber-900 border-amber-200",
  background: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

export function ContactHeader({ contact }: { contact: Contact }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`flex flex-col gap-3 ${pending ? "opacity-70" : ""}`}>
      <h1 className="text-2xl font-semibold tracking-tight">{contact.name}</h1>
      <p className="text-sm text-neutral-500">
        {contact.title && contact.company
          ? `${contact.title} @ ${contact.company}`
          : contact.title || contact.company || "—"}
      </p>

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

      {(contact.email || contact.linkedin_url) && (
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
        </div>
      )}
    </div>
  );
}
