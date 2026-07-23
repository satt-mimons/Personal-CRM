import { describe, it, expect } from "vitest";
import { medianDaysInStageFromEvents } from "@/lib/db/funnel-math";
import type { StageEvent } from "@/lib/db/types";

function ev(
  contact_id: string,
  to_stage: string,
  created_at: string,
  from_stage: string | null = null,
): StageEvent {
  return {
    id: `${contact_id}-${created_at}`,
    user_id: "u",
    contact_id,
    created_at,
    from_stage,
    to_stage,
  };
}

describe("medianDaysInStageFromEvents", () => {
  it("computes median dwell across contacts", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const events: StageEvent[] = [
      // A: identified 10d → contacted (still there 5d to now)
      ev("a", "identified", "2026-07-07T12:00:00.000Z"),
      ev("a", "contacted", "2026-07-17T12:00:00.000Z", "identified"),
      // B: identified 20d → contacted
      ev("b", "identified", "2026-06-27T12:00:00.000Z"),
      ev("b", "contacted", "2026-07-17T12:00:00.000Z", "identified"),
    ];
    const m = medianDaysInStageFromEvents(events, now);
    expect(m.identified).toBe(15); // median of 10 and 20
    expect(m.contacted).toBe(5); // both still in contacted for 5d
  });

  it("returns empty when no events", () => {
    expect(medianDaysInStageFromEvents([])).toEqual({});
  });
});
