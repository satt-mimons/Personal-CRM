// LLM layer.
//
// Convention (see CLAUDE.md): ALL Anthropic calls live in /lib/llm as typed
// functions, server-side only. Callers pass plain inputs and get typed results;
// prompt construction and parsing stay in this folder.
//
// Planned functions (built in later prompts): summarizeInteraction(),
// proposeWarmth(), extractActionItems(). None implemented yet.

export { getAnthropic, CLAUDE_MODEL } from "./client";
