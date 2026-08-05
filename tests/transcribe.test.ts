import { describe, it, expect, vi } from "vitest";
import {
  buildVocabularyPrompt,
  createGroqProvider,
  extensionForMimeType,
  GROQ_TRANSCRIBE_MODEL,
  MAX_AUDIO_BYTES,
  TranscriptionError,
  type FetchLike,
} from "@/lib/llm/transcribe";

function audio(mimeType = "audio/webm;codecs=opus", bytes = 1024): Blob {
  return new Blob([new Uint8Array(bytes)], { type: mimeType });
}

function okResponse(text: string): Response {
  return new Response(text, { status: 200 });
}

function errorResponse(status: number, retryAfter?: string): Response {
  const headers = retryAfter ? { "retry-after": retryAfter } : undefined;
  return new Response("nope", { status, headers });
}

describe("extensionForMimeType", () => {
  it("maps Chrome and Firefox webm output", () => {
    expect(extensionForMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMimeType("audio/webm")).toBe("webm");
  });

  it("maps iOS Safari mp4 output to a name Whisper accepts", () => {
    expect(extensionForMimeType("audio/mp4")).toBe("m4a");
    expect(extensionForMimeType("audio/mp4;codecs=mp4a.40.2")).toBe("m4a");
    expect(extensionForMimeType("audio/x-m4a")).toBe("m4a");
  });

  it("is case and whitespace insensitive", () => {
    expect(extensionForMimeType(" AUDIO/MP4 ; codecs=x ")).toBe("m4a");
  });

  it("falls back to webm for unknown types", () => {
    expect(extensionForMimeType("application/octet-stream")).toBe("webm");
    expect(extensionForMimeType("")).toBe("webm");
  });
});

describe("buildVocabularyPrompt", () => {
  it("returns a bare hint when there are no terms", () => {
    const prompt = buildVocabularyPrompt([]);
    expect(prompt).toContain("networking");
    expect(prompt).not.toContain("may include");
  });

  it("includes names and companies", () => {
    const prompt = buildVocabularyPrompt(["Tanay Jaipuria", "Wharton"]);
    expect(prompt).toContain("Tanay Jaipuria");
    expect(prompt).toContain("Wharton");
  });

  it("drops blanks and case-insensitive duplicates", () => {
    const prompt = buildVocabularyPrompt(["Ava", "", "  ", "ava", "AVA"]);
    expect(prompt.match(/Ava/gi)).toHaveLength(1);
  });

  it("truncates to stay inside Whisper's prompt window", () => {
    const terms = Array.from({ length: 100 }, (_, i) => `Person${i}`);
    const prompt = buildVocabularyPrompt(terms);
    expect(prompt).toContain("Person0");
    expect(prompt).not.toContain("Person99");
  });

  it("keeps the first term, so callers can prioritise the picked contact", () => {
    const terms = ["Priority Contact", ...Array.from({ length: 80 }, (_, i) => `Other${i}`)];
    expect(buildVocabularyPrompt(terms)).toContain("Priority Contact");
  });
});

describe("createGroqProvider", () => {
  it("posts the audio and returns trimmed text", async () => {
    const fetchImpl = vi.fn(async () => okResponse("  Met Ava at the mixer.  "));
    const provider = createGroqProvider({ apiKey: "k", fetchImpl: fetchImpl as FetchLike });

    const text = await provider({ audio: audio(), vocabulary: ["Ava"] });

    expect(text).toBe("Met Ava at the mixer.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: FormData },
    ];
    expect(init.headers.Authorization).toBe("Bearer k");
    expect(init.body.get("model")).toBe(GROQ_TRANSCRIBE_MODEL);
    expect(String(init.body.get("prompt"))).toContain("Ava");
  });

  it("names the upload after the recorded container", async () => {
    const fetchImpl = vi.fn(async () => okResponse("hi"));
    const provider = createGroqProvider({ apiKey: "k", fetchImpl: fetchImpl as FetchLike });

    await provider({ audio: audio("audio/mp4") });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      { body: FormData },
    ];
    expect((init.body.get("file") as File).name).toBe("note.m4a");
  });

  it("retries a 429 and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, "0"))
      .mockResolvedValueOnce(okResponse("second try"));
    const provider = createGroqProvider({ apiKey: "k", fetchImpl: fetchImpl as FetchLike });

    await expect(provider({ audio: audio() })).resolves.toBe("second try");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("marks a persistent 429 retryable so the UI can reuse the recording", async () => {
    const fetchImpl = vi.fn(async () => errorResponse(429, "0"));
    const provider = createGroqProvider({ apiKey: "k", fetchImpl: fetchImpl as FetchLike });

    await expect(provider({ audio: audio() })).rejects.toMatchObject({
      name: "TranscriptionError",
      retryable: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a client error", async () => {
    const fetchImpl = vi.fn(async () => errorResponse(400));
    const provider = createGroqProvider({ apiKey: "k", fetchImpl: fetchImpl as FetchLike });

    await expect(provider({ audio: audio() })).rejects.toMatchObject({
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects empty and oversized audio without calling the API", async () => {
    const fetchImpl = vi.fn(async () => okResponse("unused"));
    const provider = createGroqProvider({ apiKey: "k", fetchImpl: fetchImpl as FetchLike });

    await expect(provider({ audio: audio("audio/webm", 0) })).rejects.toBeInstanceOf(
      TranscriptionError,
    );
    await expect(
      provider({ audio: audio("audio/webm", MAX_AUDIO_BYTES + 1) }),
    ).rejects.toBeInstanceOf(TranscriptionError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
