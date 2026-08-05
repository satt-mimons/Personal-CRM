import type { ExtractionResult } from "@/lib/llm/extract";
import type {
  Direction,
  InteractionType,
  Stage,
  Tier,
  ActionOwner,
} from "@/lib/db/types";

/**
 * Hard cap on one recording. At the 24kbps mono bitrate the recorder requests
 * this is roughly 540KB, comfortably inside Vercel's 4.5MB request body limit.
 */
export const MAX_RECORDING_SECONDS = 180;

export interface DuplicateInfo {
  id: string;
  name: string;
  company: string | null;
  score: number;
  reason: string;
}

export type ExtractResponse =
  | { ok: true; extraction: ExtractionResult; duplicates: DuplicateInfo[] }
  | { ok: false; error: string; rawText: string };

export type TranscribeResponse =
  | { ok: true; text: string }
  /** `retryable` lets the UI offer "try again" without re-recording. */
  | { ok: false; error: string; retryable: boolean };

export interface EditableContact {
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  vertical: string | null;
  tier: Tier;
}

export interface EditableInteraction {
  occurred_at: string; // ISO 8601
  type: InteractionType;
  summary: string;
  warmth: number;
  direction: Direction;
}

export interface EditableActionItem {
  description: string;
  owner: ActionOwner;
  due_date: string | null; // YYYY-MM-DD
}

export interface SavePayload {
  rawText: string;
  /** Set when the user picked an existing contact or chose "merge into". */
  existingContactId: string | null;
  /** Set when creating a new contact (null if existingContactId is used). */
  contact: EditableContact | null;
  interaction: EditableInteraction;
  actionItems: EditableActionItem[];
  stage: Stage;
}

/** Interaction types that surface the post-save thank-you draft step. */
export const THANK_YOU_INTERACTION_TYPES: readonly InteractionType[] = [
  "coffee_chat",
  "call",
  "event",
] as const;

export function isThankYouEligible(type: InteractionType): boolean {
  return (THANK_YOU_INTERACTION_TYPES as readonly string[]).includes(type);
}

/** Returned by saveInteractionAction on success (no longer redirects). */
export interface SaveSuccess {
  ok: true;
  contactId: string;
  interactionId: string;
  contactName: string;
  company: string | null;
  email: string | null;
  interactionType: InteractionType;
  summary: string;
  rawNotes: string;
}

export type SaveResponse = SaveSuccess | { ok: false; error: string };

/** Client-side payload for the thank-you step (and sessionStorage across OAuth). */
export interface ThankYouContext {
  contactId: string;
  interactionId: string;
  contactName: string;
  company: string | null;
  email: string | null;
  interactionType: InteractionType;
  summary: string;
  rawNotes: string;
  /** Preserved edits across Gmail OAuth reconnect. */
  subject?: string;
  body?: string;
}

export const THANK_YOU_DRAFT_STORAGE_KEY = "pipeline.thankYouDraft";
