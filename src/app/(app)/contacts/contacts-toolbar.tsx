"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { STAGES, type Tier } from "@/lib/db/types";
import type { ContactSort } from "@/lib/db/contacts";

const TIERS: Tier[] = ["priority", "warm", "background"];
const SORTS: { value: ContactSort; label: string }[] = [
  { value: "next_due", label: "Next due" },
  { value: "last_touch", label: "Last touch" },
  { value: "name", label: "Name" },
];

const SELECT =
  "rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-neutral-900";

export function ContactsToolbar({ verticals }: { verticals: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      startTransition(() => {
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [params, pathname, router],
  );

  const overdueOnly = params.get("overdue") === "1";

  return (
    <div
      className={`flex flex-col gap-2 ${pending ? "opacity-70" : ""}`}
    >
      <input
        type="search"
        key={params.get("q") ?? ""}
        defaultValue={params.get("q") ?? ""}
        placeholder="Search name or company"
        onChange={(e) => {
          const v = e.target.value.trim();
          // Debounce-ish: update on idle via short timeout stored on the input.
          const el = e.currentTarget;
          clearTimeout((el as HTMLInputElement & { _t?: number })._t);
          (el as HTMLInputElement & { _t?: number })._t = window.setTimeout(
            () => setParam("q", v || null),
            250,
          ) as unknown as number;
        }}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
      />

      <div className="flex flex-wrap gap-2">
        <select
          className={SELECT}
          value={params.get("vertical") ?? ""}
          onChange={(e) => setParam("vertical", e.target.value || null)}
          aria-label="Filter by vertical"
        >
          <option value="">All verticals</option>
          {verticals.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          className={SELECT}
          value={params.get("tier") ?? ""}
          onChange={(e) => setParam("tier", e.target.value || null)}
          aria-label="Filter by tier"
        >
          <option value="">All tiers</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          className={SELECT}
          value={params.get("stage") ?? ""}
          onChange={(e) => setParam("stage", e.target.value || null)}
          aria-label="Filter by stage"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <select
          className={SELECT}
          value={(params.get("sort") as ContactSort) || "next_due"}
          onChange={(e) => setParam("sort", e.target.value || "next_due")}
          aria-label="Sort"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setParam("overdue", overdueOnly ? null : "1")}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            overdueOnly
              ? "border-red-600 bg-red-600 text-white"
              : "border-neutral-300 bg-white text-neutral-700"
          }`}
        >
          Overdue only
        </button>
      </div>
    </div>
  );
}
