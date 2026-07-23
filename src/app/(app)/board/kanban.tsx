"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BOARD_STAGES,
  type BoardCard,
} from "@/lib/db/funnel-math";
import { STAGES, type Stage, type Tier } from "@/lib/db/types";
import { prettyLabel } from "@/lib/utils/format";
import { moveBoardCard } from "./actions";

const TIER_STYLE: Record<Tier, string> = {
  priority: "bg-emerald-100 text-emerald-800",
  warm: "bg-amber-100 text-amber-900",
  background: "bg-neutral-100 text-neutral-600",
};

function BoardCardView({
  card,
  stages,
  onMove,
  pending,
}: {
  card: BoardCard;
  stages: readonly Stage[];
  onMove: (id: string, stage: Stage) => void;
  pending: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/contact-id", card.contact_id);
        e.dataTransfer.setData("text/from-stage", card.stage);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`rounded-lg border border-neutral-200 bg-white p-3 shadow-sm ${
        pending ? "opacity-60" : ""
      } cursor-grab active:cursor-grabbing`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/contacts/${card.contact_id}`}
          className="min-w-0 text-sm font-semibold text-neutral-900 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {card.name}
        </Link>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ${TIER_STYLE[card.tier]}`}
        >
          {card.tier}
        </span>
      </div>
      {card.company && (
        <p className="mt-0.5 truncate text-xs text-neutral-500">{card.company}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {card.vertical && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
            {card.vertical}
          </span>
        )}
        <span className="text-[10px] tabular-nums text-neutral-400">
          {card.days_in_stage}d in stage
        </span>
      </div>

      {/* Mobile: tap to pick stage (hidden on sm+ where drag works) */}
      <div className="mt-2 sm:hidden">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-600"
        >
          Move stage ▾
        </button>
        {pickerOpen && (
          <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-neutral-200 bg-white">
            {stages.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  disabled={s === card.stage}
                  onClick={() => {
                    setPickerOpen(false);
                    if (s !== card.stage) onMove(card.contact_id, s);
                  }}
                  className={`w-full px-2 py-1.5 text-left text-xs capitalize ${
                    s === card.stage
                      ? "bg-neutral-100 font-semibold text-neutral-900"
                      : "text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {prettyLabel(s)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Column({
  stage,
  cards,
  onMove,
  pendingId,
}: {
  stage: Stage;
  cards: BoardCard[];
  onMove: (id: string, stage: Stage) => void;
  pendingId: string | null;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={`flex w-[280px] shrink-0 flex-col rounded-xl border bg-neutral-50 sm:w-[260px] ${
        over ? "border-emerald-500 ring-2 ring-emerald-200" : "border-neutral-200"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/contact-id");
        const from = e.dataTransfer.getData("text/from-stage");
        if (id && from !== stage) onMove(id, stage);
      }}
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
          {prettyLabel(stage)}
        </h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-500 ring-1 ring-neutral-200">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-2 min-h-[120px]">
        {cards.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-neutral-400">Empty</p>
        ) : (
          cards.map((c) => (
            <BoardCardView
              key={c.contact_id}
              card={c}
              stages={STAGES}
              onMove={onMove}
              pending={pendingId === c.contact_id}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  cards: initial,
  showDormant,
}: {
  cards: BoardCard[];
  showDormant: boolean;
}) {
  const [cards, setCards] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Sync when server revalidates with new props
  const fingerprint = initial
    .map((c) => `${c.contact_id}:${c.stage}:${c.days_in_stage}`)
    .join("|");
  useEffect(() => {
    setCards(initial);
    // fingerprint captures stage moves from the server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const columns = useMemo(
    () =>
      showDormant
        ? ([...BOARD_STAGES, "dormant"] as Stage[])
        : ([...BOARD_STAGES] as Stage[]),
    [showDormant],
  );

  function onMove(contactId: string, stage: Stage) {
    setError(null);
    const prev = cards;
    setCards((list) =>
      list.map((c) => (c.contact_id === contactId ? { ...c, stage } : c)),
    );
    setPendingId(contactId);
    startTransition(async () => {
      const res = await moveBoardCard(contactId, stage);
      setPendingId(null);
      if (!res.ok) {
        setCards(prev);
        setError(res.error);
      }
    });
  }

  const byStage = useMemo(() => {
    const map = new Map<Stage, BoardCard[]>();
    for (const s of columns) map.set(s, []);
    for (const c of cards) {
      const list = map.get(c.stage);
      if (list) list.push(c);
    }
    return map;
  }, [cards, columns]);

  return (
    <div className={pending ? "opacity-90" : ""}>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {columns.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            cards={byStage.get(stage) ?? []}
            onMove={onMove}
            pendingId={pendingId}
          />
        ))}
      </div>
      <p className="mt-2 hidden text-xs text-neutral-400 sm:block">
        Drag cards between columns to change stage. Mobile: use Move stage on
        each card.
      </p>
    </div>
  );
}
