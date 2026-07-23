// LLM layer.
//
// Convention (see CLAUDE.md): ALL Anthropic calls live in /lib/llm as typed
// functions, server-side only. Callers pass plain inputs and get typed results;
// prompt construction and parsing stay in this folder.

export { getAnthropic, CLAUDE_MODEL } from "./client";
export {
  extractInteraction,
  parseExtraction,
  buildUserPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  ExtractionParseError,
  type ExtractionResult,
  type ExtractedContact,
  type ExtractedInteraction,
  type ExtractedActionItem,
  type ExtractInput,
  type CreateMessage,
} from "./extract";
export {
  draftSuggestedOpeners,
  attachOpeners,
  type OpenerContext,
} from "./openers";
