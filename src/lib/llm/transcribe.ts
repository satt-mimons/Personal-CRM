// Speech-to-text. Server-side only (holds the API key).
//
// Provider is swappable on purpose: Groq's free tier covers the expected volume
// today, but if proper-noun accuracy turns out to be the failure mode, swapping
// in a higher-accuracy vendor should be this one file plus an env var.

export const GROQ_TRANSCRIBE_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";
export const GROQ_TRANSCRIBE_MODEL = "whisper-large-v3-turbo";

/** Free tier caps uploads at 25MB; we stay far below via the client-side cap. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export interface TranscribeInput {
  audio: Blob;
  /** Sent to the model as a spelling hint. See buildVocabularyPrompt. */
  vocabulary?: string[];
}

export type TranscribeProvider = (input: TranscribeInput) => Promise<string>;

// ---------------------------------------------------------------------------
// Vocabulary biasing
// ---------------------------------------------------------------------------

/**
 * Whisper accepts a short prompt that biases decoding toward the spellings it
 * contains. Names and employers are exactly what a networking note gets wrong,
 * and we already know the user's contact list — so feed it in.
 *
 * The window is ~224 tokens, so this is deliberately truncated. Roughly four
 * tokens per name-and-company pair keeps us well inside it.
 */
const MAX_VOCABULARY_TERMS = 30;

export function buildVocabularyPrompt(terms: string[]): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of terms) {
    const term = raw?.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(term);
    if (unique.length >= MAX_VOCABULARY_TERMS) break;
  }
  const base =
    "Notes from a professional networking conversation about recruiting.";
  if (unique.length === 0) return base;
  return `${base} Names and companies mentioned may include: ${unique.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Audio container handling
// ---------------------------------------------------------------------------

/**
 * Whisper infers the container from the filename, and browsers disagree on what
 * they produce: Chrome gives webm/opus, iOS Safari gives mp4/aac. Sending a
 * `.webm` name for mp4 bytes is rejected, so derive the extension from the type.
 */
export function extensionForMimeType(mimeType: string): string {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  switch (type) {
    case "audio/webm":
    case "video/webm":
      return "webm";
    case "audio/mp4":
    case "video/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    case "audio/flac":
      return "flac";
    default:
      return "webm";
  }
}

// ---------------------------------------------------------------------------
// Groq provider
// ---------------------------------------------------------------------------

/** Injectable so tests can exercise retry and error mapping without network. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: FormData },
) => Promise<Response>;

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 2;

function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers?.get?.("retry-after");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 10_000);
  }
  return 500 * 2 ** attempt;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createGroqProvider(options: {
  apiKey: string;
  fetchImpl?: FetchLike;
  model?: string;
}): TranscribeProvider {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const model = options.model ?? GROQ_TRANSCRIBE_MODEL;

  return async ({ audio, vocabulary }) => {
    if (audio.size === 0) {
      throw new TranscriptionError("The recording was empty.", false);
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new TranscriptionError("That recording is too long.", false);
    }

    const filename = `note.${extensionForMimeType(audio.type)}`;
    let lastError: TranscriptionError | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Rebuilt per attempt: a FormData body is consumed once it is sent.
      const form = new FormData();
      form.append("file", audio, filename);
      form.append("model", model);
      form.append("response_format", "text");
      form.append("language", "en");
      form.append("temperature", "0");
      form.append("prompt", buildVocabularyPrompt(vocabulary ?? []));

      const res = await fetchImpl(GROQ_TRANSCRIBE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}` },
        body: form,
      });

      if (res.ok) return (await res.text()).trim();

      const retryable = RETRY_STATUSES.has(res.status);
      lastError = new TranscriptionError(
        res.status === 429
          ? "Transcription is busy right now. Your recording is still here — try again."
          : `Transcription failed (${res.status}).`,
        retryable,
      );
      if (!retryable || attempt === MAX_ATTEMPTS - 1) break;
      await sleep(retryDelayMs(res, attempt));
    }

    throw lastError ?? new TranscriptionError("Transcription failed.", true);
  };
}

let cachedProvider: TranscribeProvider | null = null;

export function getTranscribeProvider(): TranscribeProvider {
  if (cachedProvider) return cachedProvider;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new TranscriptionError(
      "Voice notes aren't configured on this deployment.",
      false,
    );
  }
  cachedProvider = createGroqProvider({ apiKey });
  return cachedProvider;
}

/** Transcribe a recording into raw text. Throws TranscriptionError. */
export async function transcribeAudio(
  input: TranscribeInput,
  provider: TranscribeProvider = getTranscribeProvider(),
): Promise<string> {
  return provider(input);
}
