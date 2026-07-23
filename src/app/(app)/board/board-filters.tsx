"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { Tier } from "@/lib/db/types";

const TIERS: Tier[] = ["priority", "warm", "background"];
const SELECT =
  "rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-neutral-900";

export function BoardFilters({ verticals }: { verticals: string[] }) {
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

  const showDormant = params.get("dormant") === "1";

  return (
    <div className={`flex flex-wrap gap-2 ${pending ? "opacity-70" : ""}`}>
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

      <button
        type="button"
        onClick={() => setParam("dormant", showDormant ? null : "1")}
        className={`rounded-lg border px-3 py-2 text-sm font-medium ${
          showDormant
            ? "border-neutral-900 bg-neutral-900 text-white"
            : "border-neutral-300 bg-white text-neutral-700"
        }`}
      >
        Show dormant
      </button>
    </div>
  );
}
