import { describe, it, expect } from "vitest";
import {
  rankNudges,
  scoreContact,
  type NudgeContactInput,
} from "@/lib/nudge/engine";

const TODAY = "2026-07-22";

function contact(
  overrides: Partial<NudgeContactInput> & Pick<NudgeContactInput, "contact_id" | "name">,
): NudgeContactInput {
  return {
    company: null,
    tier: "warm",
    stage: "chatted",
    snoozed_until: null,
    days_overdue: 0,
    next_due_date: TODAY,
    upcoming_chat_at: null,
    open_actions: [],
    last_summary: null,
    ...overrides,
  };
}

describe("scoreContact exclusions", () => {
  it("excludes snoozed contacts (snoozed_until >= today)", () => {
    expect(
      scoreContact(
        contact({
          contact_id: "1",
          name: "Ava",
          days_overdue: 10,
          snoozed_until: "2026-07-29",
        }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("includes contacts whose snooze has expired", () => {
    const r = scoreContact(
      contact({
        contact_id: "1",
        name: "Ava",
        days_overdue: 5,
        snoozed_until: "2026-07-20",
      }),
      TODAY,
    );
    expect(r).not.toBeNull();
    expect(r!.reason).toBe("overdue_followup");
  });

  it("excludes stage=offer and stage=dormant", () => {
    expect(
      scoreContact(
        contact({
          contact_id: "1",
          name: "A",
          stage: "offer",
          days_overdue: 20,
          tier: "priority",
        }),
        TODAY,
      ),
    ).toBeNull();
    expect(
      scoreContact(
        contact({
          contact_id: "2",
          name: "B",
          stage: "dormant",
          days_overdue: 20,
          tier: "priority",
        }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("returns null when no actionable signal (not overdue, no due action, no upcoming)", () => {
    expect(
      scoreContact(
        contact({ contact_id: "1", name: "Quiet", tier: "priority" }),
        TODAY,
      ),
    ).toBeNull();
  });
});

describe("scoring math", () => {
  it("uses tier base scores", () => {
    const overdue = { days_overdue: 1 };
    expect(
      scoreContact(
        contact({ contact_id: "p", name: "P", tier: "priority", ...overdue }),
        TODAY,
      )!.score,
    ).toBe(100 + 5);
    expect(
      scoreContact(
        contact({ contact_id: "w", name: "W", tier: "warm", ...overdue }),
        TODAY,
      )!.score,
    ).toBe(50 + 5);
    expect(
      scoreContact(
        contact({ contact_id: "b", name: "B", tier: "background", ...overdue }),
        TODAY,
      )!.score,
    ).toBe(20 + 5);
  });

  it("adds +5 per day overdue, capped at +50", () => {
    const uncapped = scoreContact(
      contact({ contact_id: "1", name: "A", days_overdue: 8 }),
      TODAY,
    )!;
    expect(uncapped.score).toBe(50 + 40); // warm + 8*5

    const capped = scoreContact(
      contact({ contact_id: "2", name: "B", days_overdue: 20 }),
      TODAY,
    )!;
    expect(capped.score).toBe(50 + 50); // warm + cap
  });

  it("adds +40 for owner=me action due within 2 days or past", () => {
    const r = scoreContact(
      contact({
        contact_id: "1",
        name: "Marcus",
        open_actions: [
          {
            description: "Send deck",
            owner: "me",
            due_date: "2026-07-22",
          },
        ],
      }),
      TODAY,
    )!;
    expect(r.score).toBe(50 + 40);
    expect(r.reason).toBe("action_item_due");
  });

  it("ignores action items owned by them or due >2 days out", () => {
    expect(
      scoreContact(
        contact({
          contact_id: "1",
          name: "A",
          open_actions: [
            { description: "Intro", owner: "them", due_date: "2026-07-22" },
            { description: "Later", owner: "me", due_date: "2026-07-30" },
          ],
        }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("prefers action_item_due over overdue_followup as primary reason", () => {
    const r = scoreContact(
      contact({
        contact_id: "1",
        name: "Ava",
        days_overdue: 12,
        open_actions: [
          { description: "Thank-you note", owner: "me", due_date: "2026-07-21" },
        ],
      }),
      TODAY,
    )!;
    expect(r.reason).toBe("action_item_due");
    expect(r.score).toBe(50 + Math.min(12 * 5, 50) + 40);
  });

  it("scores upcoming_prep for chats within 2 days", () => {
    const r = scoreContact(
      contact({
        contact_id: "1",
        name: "Lena",
        upcoming_chat_at: "2026-07-23",
      }),
      TODAY,
    )!;
    expect(r.reason).toBe("upcoming_prep");
    expect(r.score).toBe(50 + 30);
  });
});

describe("rankNudges", () => {
  it("caps at 5 and enforces min score 30", () => {
    const many: NudgeContactInput[] = Array.from({ length: 8 }, (_, i) =>
      contact({
        contact_id: `c${i}`,
        name: `Contact ${i}`,
        tier: "priority",
        days_overdue: 1 + i,
      }),
    );
    // background with tiny overdue might still clear 30: 20+5=25 < 30
    many.push(
      contact({
        contact_id: "low",
        name: "Low",
        tier: "background",
        days_overdue: 1, // score 25 → filtered
      }),
    );

    const ranked = rankNudges(many, { today: TODAY });
    expect(ranked).toHaveLength(5);
    expect(ranked.every((n) => n.score >= 30)).toBe(true);
    expect(ranked.find((n) => n.contact_id === "low")).toBeUndefined();
  });

  it("never emits two nudges for the same contact", () => {
    const ranked = rankNudges(
      [
        contact({
          contact_id: "same",
          name: "Same",
          days_overdue: 5,
          open_actions: [
            { description: "X", owner: "me", due_date: TODAY },
          ],
          upcoming_chat_at: TODAY,
        }),
      ],
      { today: TODAY },
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].contact_id).toBe("same");
  });

  it("tie-breaks equal scores by days_overdue desc, then name", () => {
    const ranked = rankNudges(
      [
        contact({
          contact_id: "b",
          name: "Ben",
          tier: "warm",
          days_overdue: 2, // 50+10=60
        }),
        contact({
          contact_id: "a",
          name: "Amy",
          tier: "warm",
          days_overdue: 2, // 50+10=60 — name wins
        }),
        contact({
          contact_id: "c",
          name: "Cara",
          tier: "warm",
          days_overdue: 4, // 50+20=70 — higher overdue wins vs equal tier base path
        }),
      ],
      { today: TODAY },
    );
    // Cara highest score
    expect(ranked[0].contact_id).toBe("c");
    // Amy before Ben on name tie at score 60
    expect(ranked[1].contact_id).toBe("a");
    expect(ranked[2].contact_id).toBe("b");
  });

  it("leaves suggested_opener null (LLM fills later)", () => {
    const ranked = rankNudges(
      [contact({ contact_id: "1", name: "A", days_overdue: 3 })],
      { today: TODAY },
    );
    expect(ranked[0].suggested_opener).toBeNull();
  });
});
