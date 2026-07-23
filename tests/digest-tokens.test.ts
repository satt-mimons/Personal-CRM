import { describe, it, expect, beforeAll } from "vitest";
import {
  signDigestToken,
  verifyDigestToken,
} from "@/lib/digest/tokens";

beforeAll(() => {
  process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret";
});

describe("digest signed tokens", () => {
  it("round-trips a valid token", () => {
    const token = signDigestToken({
      a: "snooze",
      c: "contact-1",
      u: "user-1",
    });
    const payload = verifyDigestToken(token);
    expect(payload).toMatchObject({
      a: "snooze",
      c: "contact-1",
      u: "user-1",
    });
  });

  it("rejects tampered tokens", () => {
    const token = signDigestToken({
      a: "touched",
      c: "c",
      u: "u",
    });
    expect(verifyDigestToken(token + "x")).toBeNull();
    expect(verifyDigestToken("not.a.token")).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = signDigestToken({
      a: "snooze",
      c: "c",
      u: "u",
      e: Math.floor(Date.now() / 1000) - 10,
    });
    expect(verifyDigestToken(token)).toBeNull();
  });
});
