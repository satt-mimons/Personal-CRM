import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic model used across the app. Server-side only.
 */
export const CLAUDE_MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

/**
 * Lazily construct the Anthropic client. ANTHROPIC_API_KEY must be set.
 * NEVER import this into client-side code — LLM calls run on the server only.
 */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}
