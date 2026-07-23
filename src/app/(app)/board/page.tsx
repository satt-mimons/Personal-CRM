import { Suspense } from "react";
import {
  getBoardCards,
  getFunnelStats,
  type BoardFilters,
} from "@/lib/db/funnel";
import { getContactVerticals } from "@/lib/db/contacts";
import type { Tier } from "@/lib/db/types";
import { BoardFilters as BoardFiltersBar } from "./board-filters";
import { FunnelStatsPanel } from "./funnel-stats";
import { KanbanBoard } from "./kanban";

export const dynamic = "force-dynamic";

const TIERS: Tier[] = ["priority", "warm", "background"];

function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): BoardFilters {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const tier = one("tier");
  return {
    vertical: one("vertical") || null,
    tier: tier && (TIERS as string[]).includes(tier) ? (tier as Tier) : null,
    showDormant: one("dormant") === "1",
  };
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [cards, stats, verticals] = await Promise.all([
    getBoardCards(filters),
    getFunnelStats(filters),
    getContactVerticals(),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Board</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pipeline by stage. Drag on desktop · pick stage on mobile.
        </p>
      </div>

      <Suspense fallback={null}>
        <BoardFiltersBar verticals={verticals} />
      </Suspense>

      <FunnelStatsPanel stats={stats} />

      <KanbanBoard cards={cards} showDormant={Boolean(filters.showDormant)} />
    </section>
  );
}
