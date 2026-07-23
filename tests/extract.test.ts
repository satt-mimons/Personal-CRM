import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import {
  extractInteraction,
  parseExtraction,
  ExtractionParseError,
  type CreateMessage,
  type ExtractionResult,
} from "@/lib/llm/extract";
import { STAGES } from "@/lib/db/types";

// Load env so live runs can reach the API.
config({ path: ".env.local" });

const LIVE = process.env.LIVE_LLM === "1";
const readFixture = (name: string) =>
  readFileSync(resolve(__dirname, "..", "fixtures", name), "utf8");

interface FixtureSpec {
  file: string;
  canned: string; // canned model output used when NOT running live
  expectOwners: Array<"me" | "them">; // action-item owners that MUST be present
  expectType?: string;
}

const FIXTURES: FixtureSpec[] = [
  {
    file: "coffee-chat-intro.txt",
    expectOwners: ["them", "me"], // offered intro (them) + thank-you note (me)
    expectType: "coffee_chat",
    canned: JSON.stringify({
      contact: {
        name: "Ava Chen",
        company: "Stripe",
        title: "Product Lead",
        email: null,
        linkedin_url: null,
        vertical: "fintech",
      },
      interaction: {
        occurred_at: "2026-07-07T09:00:00.000Z",
        type: "coffee_chat",
        summary:
          "Met Ava for coffee and discussed the platform PM role and her move from banking. She was warm and eager to help.",
        warmth: 5,
        warmth_justification: "Enthusiastic and volunteered an introduction.",
        direction: "outbound",
      },
      action_items: [
        {
          description: "Ava to introduce me to her skip-level in payments",
          owner: "them",
          due_date: null,
        },
        { description: "Send Ava a thank-you note", owner: "me", due_date: null },
      ],
      suggested_tier: "priority",
      suggested_tier_justification: "Senior, warm, actively offering help.",
      suggested_stage: "chatted",
    }),
  },
  {
    file: "call-send-deck.txt",
    expectOwners: ["me"], // I said I'd send the deck by Friday
    expectType: "call",
    canned: JSON.stringify({
      contact: {
        name: "Marcus Webb",
        company: "Databricks",
        title: "Engineering Manager",
        email: null,
        linkedin_url: null,
        vertical: "infra",
      },
      interaction: {
        occurred_at: "2026-07-06T17:00:00.000Z",
        type: "call",
        summary: "Brief, somewhat transactional call about platform PM roles.",
        warmth: 3,
        warmth_justification: "Helpful but busy.",
        direction: "outbound",
      },
      action_items: [
        {
          description: "Send Marcus the product teardown deck",
          owner: "me",
          due_date: "2026-07-10",
        },
      ],
      suggested_tier: "warm",
      suggested_tier_justification: "Relevant role, moderately engaged.",
      suggested_stage: "chatted",
    }),
  },
  {
    file: "event-brief.txt",
    expectOwners: [], // no commitments
    expectType: "event",
    canned: JSON.stringify({
      contact: {
        name: "Lena Fischer",
        company: "Plaid",
        title: "Partnerships",
        email: null,
        linkedin_url: null,
        vertical: "fintech",
      },
      interaction: {
        occurred_at: "2026-07-07T20:00:00.000Z",
        type: "event",
        summary: "Briefly met at a fintech panel; surface-level exchange.",
        warmth: 2,
        warmth_justification: "Very brief, no depth yet.",
        direction: "mutual",
      },
      action_items: [],
      suggested_tier: "background",
      suggested_tier_justification: "Minimal engagement so far.",
      suggested_stage: "identified",
    }),
  },
];

function assertValidShape(r: ExtractionResult) {
  expect(r.interaction).toBeTruthy();
  expect(typeof r.interaction.summary).toBe("string");
  expect(r.interaction.warmth).toBeGreaterThanOrEqual(1);
  expect(r.interaction.warmth).toBeLessThanOrEqual(5);
  expect(["outbound", "inbound", "mutual"]).toContain(r.interaction.direction);
  expect(["coffee_chat", "call", "email", "event", "note"]).toContain(
    r.interaction.type,
  );
  expect(["priority", "warm", "background"]).toContain(r.suggested_tier);
  expect(STAGES as readonly string[]).toContain(r.suggested_stage);
  expect(Array.isArray(r.action_items)).toBe(true);
  for (const a of r.action_items) {
    expect(a.description.length).toBeGreaterThan(0);
    expect(["me", "them"]).toContain(a.owner);
  }
}

describe(`extractInteraction over fixtures (${LIVE ? "LIVE API" : "mocked"})`, () => {
  for (const fx of FIXTURES) {
    it(
      `extracts ${fx.file}`,
      async () => {
        const rawText = readFixture(fx.file);

        const result = LIVE
          ? await extractInteraction({ rawText, contactPicked: false })
          : await extractInteraction(
              { rawText, contactPicked: false },
              mockedCreateMessage(fx.canned, rawText),
            );

        assertValidShape(result);
        if (fx.expectType) expect(result.interaction.type).toBe(fx.expectType);

        for (const owner of fx.expectOwners) {
          expect(
            result.action_items.some((a) => a.owner === owner),
            `expected an action item with owner="${owner}" for ${fx.file}`,
          ).toBe(true);
        }
      },
      LIVE ? 45_000 : 5_000,
    );
  }
});

function mockedCreateMessage(canned: string, expectedRaw: string): CreateMessage {
  return async ({ userPrompt }) => {
    // Sanity: the raw note should be forwarded to the model.
    expect(userPrompt).toContain(expectedRaw.trim().slice(0, 24));
    return canned;
  };
}

describe("parseExtraction is defensive", () => {
  const base = FIXTURES[0].canned;

  it("parses JSON wrapped in ```json fences", () => {
    const r = parseExtraction("```json\n" + base + "\n```");
    expect(r.contact?.name).toBe("Ava Chen");
  });

  it("parses JSON surrounded by stray prose", () => {
    const r = parseExtraction("Sure! Here is the JSON:\n" + base + "\nHope that helps.");
    expect(r.action_items.length).toBeGreaterThan(0);
  });

  it("throws ExtractionParseError on non-JSON", () => {
    expect(() => parseExtraction("I could not do that.")).toThrow(
      ExtractionParseError,
    );
  });

  it("clamps out-of-range warmth", () => {
    const r = parseExtraction(
      JSON.stringify({
        interaction: { type: "note", summary: "x", warmth: 99, direction: "outbound" },
        action_items: [],
        suggested_tier: "warm",
        suggested_stage: "contacted",
      }),
    );
    expect(r.interaction.warmth).toBe(5);
  });

  it("drops action items without a description", () => {
    const r = parseExtraction(
      JSON.stringify({
        interaction: { type: "note", summary: "x", warmth: 3, direction: "outbound" },
        action_items: [{ owner: "me" }, { description: "Real one", owner: "them" }],
        suggested_tier: "warm",
        suggested_stage: "contacted",
      }),
    );
    expect(r.action_items).toHaveLength(1);
    expect(r.action_items[0].description).toBe("Real one");
  });
});
