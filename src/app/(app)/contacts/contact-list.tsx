import Link from "next/link";
import type { ContactStatus, Tier } from "@/lib/db/types";
import {
  formatRelativePast,
  formatShortDate,
  prettyLabel,
} from "@/lib/utils/format";

const TIER_STYLE: Record<Tier, string> = {
  priority: "bg-emerald-100 text-emerald-800",
  warm: "bg-amber-100 text-amber-900",
  background: "bg-neutral-100 text-neutral-600",
};

function ContactCard({ c }: { c: ContactStatus }) {
  const overdue = c.days_overdue > 0;
  return (
    <Link
      href={`/contacts/${c.contact_id}`}
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 hover:bg-neutral-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">
            {c.name}
          </p>
          <p className="truncate text-xs text-neutral-500">
            {[c.company, c.vertical].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${TIER_STYLE[c.tier]}`}
        >
          {c.tier}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span className="capitalize">{prettyLabel(c.stage)}</span>
        <span>touched {formatRelativePast(c.last_touch_at)}</span>
        <span className={overdue ? "font-semibold text-red-600" : ""}>
          due {formatShortDate(c.next_due_date)}
          {overdue ? ` · ${c.days_overdue}d overdue` : ""}
        </span>
      </div>
    </Link>
  );
}

export function ContactList({ contacts }: { contacts: ContactStatus[] }) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
        No contacts match these filters.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: cards */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {contacts.map((c) => (
          <li key={c.contact_id}>
            <ContactCard c={c} />
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-xl border border-neutral-200 sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Vertical</th>
              <th className="px-4 py-2.5 font-medium">Tier</th>
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="px-4 py-2.5 font-medium">Last touch</th>
              <th className="px-4 py-2.5 font-medium">Next due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {contacts.map((c) => {
              const overdue = c.days_overdue > 0;
              return (
                <tr key={c.contact_id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/contacts/${c.contact_id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {c.company ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {c.vertical ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${TIER_STYLE[c.tier]}`}
                    >
                      {c.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize text-neutral-600">
                    {prettyLabel(c.stage)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {formatRelativePast(c.last_touch_at)}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      overdue ? "font-semibold text-red-600" : "text-neutral-600"
                    }`}
                  >
                    {formatShortDate(c.next_due_date)}
                    {overdue ? ` (${c.days_overdue}d)` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
