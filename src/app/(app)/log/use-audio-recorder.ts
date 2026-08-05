"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RECORDING_SECONDS } from "./types";

/**
 * Browsers disagree on containers: Chrome and Firefox produce webm/opus, iOS
 * Safari only mp4/aac. Pick whichever the browser admits to supporting and let
 * the server map the MIME type to a filename Whisper will accept.
 */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Speech stays intelligible far below music bitrates, and small keeps us
 *  inside the request body limit: ~3KB/s, so 3 minutes is roughly 540KB. */
const AUDIO_BITS_PER_SECOND = 24_000;

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export interface Recording {
  blob: Blob;
  durationSeconds: number;
}

export interface UseAudioRecorder {
  recording: boolean;
  elapsedSeconds: number;
  error: string | null;
  start: () => Promise<void>;
  /** Resolves once the final chunk has been flushed. Null if nothing captured. */
  stop: () => Promise<Recording | null>;
  cancel: () => void;
}

export function useAudioRecorder(): UseAudioRecorder {
  const [recording, setRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((r: Recording | null) => void) | null>(null);

  const releaseStream = useCallback(() => {
    // Without this the iOS recording indicator stays lit after we are done.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const stop = useCallback((): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      releaseStream();
      setRecording(false);
      return Promise.resolve(null);
    }
    return new Promise<Recording | null>((resolve) => {
      resolveRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        releaseStream();
        setRecording(false);
        resolve(null);
      }
    });
  }, [releaseStream]);

  const start = useCallback(async () => {
    setError(null);
    if (!isRecordingSupported()) {
      setError("Recording isn't supported in this browser.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was blocked. Enable it in your browser settings."
          : "Couldn't reach your microphone.",
      );
      return;
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError("Couldn't start recording on this device.");
      return;
    }

    chunksRef.current = [];
    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const durationSeconds = (Date.now() - startedAtRef.current) / 1000;
      const blob = new Blob(chunksRef.current, {
        type: mimeType ?? recorder.mimeType ?? "audio/webm",
      });
      chunksRef.current = [];
      releaseStream();
      setRecording(false);
      setElapsedSeconds(0);
      const resolve = resolveRef.current;
      resolveRef.current = null;
      resolve?.(blob.size > 0 ? { blob, durationSeconds } : null);
    };

    recorder.start();
    setRecording(true);
    setElapsedSeconds(0);

    tickRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) void stop();
    }, 250);
  }, [releaseStream, stop]);

  const cancel = useCallback(() => {
    resolveRef.current = null;
    const recorder = recorderRef.current;
    chunksRef.current = [];
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // Already stopped.
      }
    }
    releaseStream();
    setRecording(false);
    setElapsedSeconds(0);
  }, [releaseStream]);

  useEffect(() => cancel, [cancel]);

  return { recording, elapsedSeconds, error, start, stop, cancel };
}
