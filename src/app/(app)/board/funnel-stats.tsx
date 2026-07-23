"use client";

import { useState } from "react";
import { STAGES, type Stage } from "@/lib/db/types";
import { BOARD_STAGES, type FunnelStats } from "@/lib/db/funnel-math";
import { prettyLabel } from "@/lib/utils/format";

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v}%`;
}

export function FunnelStatsPanel({ stats }: { stats: FunnelStats }) {
  const [open, setOpen] = useState(true);
  const columns = BOARD_STAGES;

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-neutral-800">
          Funnel stats
          <span className="ml-2 font-normal text-neutral-500">
            {stats.total} contact{stats.total === 1 ? "" : "s"}
          </span>
        </span>
        <span className="text-xs text-neutral-400">{open ? "Hide ▴" : "Show ▾"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-neutral-200 px-4 py-4">
          {/* Stage counts */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {columns.map((s) => (
              <div
                key={s}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                  {prettyLabel(s)}
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">
                  {stats.stage_counts[s] ?? 0}
                </p>
              </div>
            ))}
          </div>

          {/* Conversion */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-neutral-500">Chatted → referral/interview</span>
              <span className="ml-2 font-semibold tabular-nums">
                {fmtPct(stats.chatted_to_referral_pct)}
              </span>
            </div>
            <div>
              <span className="text-neutral-500">Identified → offer</span>
              <span className="ml-2 font-semibold tabular-nums">
                {fmtPct(stats.identified_to_offer_pct)}
              </span>
            </div>
          </div>

          {/* Median days in stage */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              Median days in stage
            </p>
            <div className="flex flex-wrap gap-2">
              {STAGES.filter((s) => s !== "dormant").map((s: Stage) => (
                <span
                  key={s}
                  className="rounded-full bg-white px-2.5 py-1 text-xs text-neutral-600 ring-1 ring-neutral-200"
                >
                  {prettyLabel(s)}{" "}
                  <strong className="tabular-nums text-neutral-900">
                    {stats.median_days_in_stage[s] ?? "—"}
                  </strong>
                </span>
              ))}
            </div>
          </div>

          {/* Vertical cut */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              By vertical
            </p>
            {stats.by_vertical.length === 0 ? (
              <p className="text-sm text-neutral-400">No contacts in this filter.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Vertical</th>
                      <th className="px-3 py-2 font-medium">Contacts</th>
                      <th className="px-3 py-2 font-medium">Chats</th>
                      <th className="px-3 py-2 font-medium">Referrals</th>
                      <th className="px-3 py-2 font-medium">Conv.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {stats.by_vertical.map((row) => (
                      <tr key={row.vertical}>
                        <td className="px-3 py-2 font-medium text-neutral-800">
                          {row.vertical}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.contacts}</td>
                        <td className="px-3 py-2 tabular-nums">{row.chats}</td>
                        <td className="px-3 py-2 tabular-nums">{row.referrals}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmtPct(row.conversion_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
