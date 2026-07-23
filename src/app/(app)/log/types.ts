import type { ExtractionResult } from "@/lib/llm/extract";
import type {
  Direction,
  InteractionType,
  Stage,
  Tier,
  ActionOwner,
} from "@/lib/db/types";

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
