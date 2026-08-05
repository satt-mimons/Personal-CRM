"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { transcribeAction } from "./actions";
import { MAX_RECORDING_SECONDS } from "./types";
import {
  useAudioRecorder,
  isRecordingSupported,
  type Recording,
} from "./use-audio-recorder";
import {
  useSpeechRecognition,
  isSpeechRecognitionAvailable,
} from "./use-speech-recognition";

/**
 * "record" = MediaRecorder → Groq (authoritative). Preferred whenever the
 * server has GROQ_API_KEY, because Web Speech often returns empty on stop.
 * "speech" = in-browser only, used when Groq is not configured.
 */
type Engine = "speech" | "record" | "none";

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z"
        fill="currentColor"
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

export function VoiceRecorder({
  contactId,
  onTranscript,
  disabled = false,
  /** Server-side: process.env.GROQ_API_KEY is set. Never send the key itself. */
  transcriptionConfigured = false,
}: {
  contactId: string | null;
  onTranscript: (text: string) => void;
  disabled?: boolean;
  transcriptionConfigured?: boolean;
}) {
  const [engine, setEngine] = useState<Engine>("none");
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [pending, startTransition] = useTransition();
  // Live captions via Web Speech while MediaRecorder owns the final transcript.
  const [captions, setCaptions] = useState(false);

  const speech = useSpeechRecognition();
  const recorder = useAudioRecorder((recording) => {
    if (recording) send(recording);
  });
  const lastRecordingRef = useRef<Recording | null>(null);

  useEffect(() => {
    // Prefer Groq whenever the key is present — Web Speech's stop() race is
    // what produced "Didn't catch anything" after a session that looked live.
    if (transcriptionConfigured && isRecordingSupported()) {
      setEngine("record");
      setCaptions(isSpeechRecognitionAvailable());
    } else if (isSpeechRecognitionAvailable()) {
      setEngine("speech");
      setCaptions(false);
    } else if (isRecordingSupported()) {
      // Can record, but nothing to transcribe with.
      setEngine("record");
      setCaptions(false);
      setError(
        "Missing GROQ_API_KEY. Add it to .env.local (or Vercel env), then restart the server.",
      );
    } else {
      setEngine("none");
    }
  }, [transcriptionConfigured]);

  const busy = pending || disabled;
  const active = speech.listening || recorder.recording;
  const shownError = error ?? (engine === "speech" ? speech.error : null) ?? recorder.error;

  function send(recording: Recording) {
    lastRecordingRef.current = recording;
    setError(null);
    setRetryable(false);
    startTransition(async () => {
      const form = new FormData();
      form.append("audio", recording.blob);
      form.append("durationSeconds", String(recording.durationSeconds));
      if (contactId) form.append("contactId", contactId);

      const res = await transcribeAction(form);
      if (!res.ok) {
        setError(res.error);
        setRetryable(res.retryable);
        return;
      }
      lastRecordingRef.current = null;
      onTranscript(res.text);
    });
  }

  async function toggle() {
    setError(null);
    setRetryable(false);

    if (engine === "speech") {
      if (speech.listening) {
        const text = await speech.stop();
        if (text) onTranscript(text);
        else
          setError(
            "Didn't catch anything — check your mic and try again.",
          );
      } else {
        speech.start();
      }
      return;
    }

    if (recorder.recording) {
      speech.abort();
      const recording = await recorder.stop();
      if (recording) send(recording);
      return;
    }

    if (!transcriptionConfigured) {
      setError(
        "Missing GROQ_API_KEY. Add it to .env.local (or Vercel env), then restart the server.",
      );
      return;
    }
    await recorder.start();
    // Live captions are best-effort — failures must not block recording.
    if (captions) {
      try {
        speech.start();
      } catch {
        // Ignore.
      }
    }
  }

  function retry() {
    const recording = lastRecordingRef.current;
    if (recording) send(recording);
  }

  if (engine === "none") return null;

  const nearLimit =
    engine === "record" &&
    recorder.recording &&
    recorder.elapsedSeconds >= MAX_RECORDING_SECONDS - 30;

  const showLiveText =
    active &&
    (engine === "speech" || captions) &&
    (speech.transcript || speech.interim);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={active}
          aria-label={active ? "Stop recording" : "Record a voice note"}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors disabled:opacity-50 ${
            active
              ? "bg-red-600 hover:bg-red-700"
              : "bg-neutral-900 hover:bg-neutral-700"
          }`}
        >
          {active ? (
            <StopIcon className="h-5 w-5" />
          ) : (
            <MicIcon className="h-6 w-6" />
          )}
        </button>

        <div className="min-w-0 flex-1 text-sm">
          {pending ? (
            <span className="text-neutral-500">Transcribing…</span>
          ) : active ? (
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 animate-pulse rounded-full bg-red-600"
              />
              <span className="font-medium tabular-nums">
                {engine === "record"
                  ? formatClock(recorder.elapsedSeconds)
                  : "Listening"}
              </span>
              <span className="text-neutral-500">Tap to stop</span>
            </span>
          ) : (
            <span className="text-neutral-500">
              {engine === "speech"
                ? "Dictate a voice note — text appears as you speak."
                : "Record a voice note — we\u2019ll transcribe it when you stop."}
            </span>
          )}
          {nearLimit && (
            <p className="text-xs text-amber-600">
              Stops automatically at {formatClock(MAX_RECORDING_SECONDS)}.
            </p>
          )}
        </div>
      </div>

      {showLiveText && (
        <p className="max-h-24 overflow-y-auto rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          {speech.transcript}
          {speech.interim && (
            <span className="text-neutral-400"> {speech.interim}</span>
          )}
        </p>
      )}

      {shownError && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-red-600">
          <span>{shownError}</span>
          {retryable && lastRecordingRef.current && (
            <button
              type="button"
              onClick={retry}
              disabled={busy}
              className="underline underline-offset-2 disabled:opacity-50"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
