"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal shape of the parts of the Web Speech API we use. The DOM lib does not
// ship these types, and Safari only exposes the webkit-prefixed constructor.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * iOS ships the API but it is unreliable in practice: sessions end on their own
 * mid-sentence and the first attempt after page load often returns nothing.
 * Losing half a brain dump is the worst failure this screen has, so iOS records
 * audio and transcribes server-side instead.
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as desktop Safari.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isSpeechRecognitionAvailable(): boolean {
  return getConstructor() !== null && !isIOS();
}

export interface UseSpeechRecognition {
  listening: boolean;
  /** Text confirmed so far this session. */
  transcript: string;
  /** Words still being revised by the recognizer. */
  interim: string;
  error: string | null;
  start: () => void;
  /**
   * Stops listening and resolves with the final transcript once the recognizer
   * has flushed. Calling recognition.stop() delivers the last finals
   * asynchronously — returning transcriptRef synchronously used to drop them.
   */
  stop: () => Promise<string>;
  /** Soft-stop without waiting; used when tearing down a live-caption overlay. */
  abort: () => void;
}

export function useSpeechRecognition(): UseSpeechRecognition {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A single instance for the lifetime of the component: constructing a new one
  // per session makes Safari play the system chime on every start.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const interimRef = useRef("");
  const listeningRef = useRef(false);
  // The recognizer ends on every pause; restart until the user actually stops.
  const wantListeningRef = useRef(false);
  const stopResolverRef = useRef<((text: string) => void) | null>(null);

  function markListening(value: boolean) {
    listeningRef.current = value;
    setListening(value);
  }

  const ensureRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = getConstructor();
    if (!Ctor) return null;

    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          transcriptRef.current = `${transcriptRef.current} ${text}`.trim();
        } else {
          pending += text;
        }
      }
      interimRef.current = pending;
      setTranscript(transcriptRef.current);
      setInterim(pending);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      wantListeningRef.current = false;
      markListening(false);
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Enable it in your browser settings."
          : "Dictation stopped unexpectedly. Your words so far are saved.",
      );
      const resolve = stopResolverRef.current;
      if (resolve) {
        stopResolverRef.current = null;
        resolve(combinedTranscript());
      }
    };

    recognition.onend = () => {
      if (wantListeningRef.current) {
        try {
          recognition.start();
        } catch {
          wantListeningRef.current = false;
          markListening(false);
        }
        return;
      }
      markListening(false);
      const resolve = stopResolverRef.current;
      if (resolve) {
        stopResolverRef.current = null;
        resolve(combinedTranscript());
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, []);

  function combinedTranscript(): string {
    // Promote whatever the recognizer was still revising so a quick stop
    // doesn't throw away the last half-sentence.
    const combined = `${transcriptRef.current} ${interimRef.current}`.trim();
    transcriptRef.current = combined;
    interimRef.current = "";
    setTranscript(combined);
    setInterim("");
    return combined;
  }

  const start = useCallback(() => {
    const recognition = ensureRecognition();
    if (!recognition) {
      setError("Dictation isn't supported in this browser.");
      return;
    }
    transcriptRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterim("");
    setError(null);
    wantListeningRef.current = true;
    try {
      recognition.start();
      markListening(true);
    } catch {
      // start() throws if a previous session is still winding down.
      markListening(true);
    }
  }, [ensureRecognition]);

  const stop = useCallback((): Promise<string> => {
    wantListeningRef.current = false;
    const recognition = recognitionRef.current;
    if (!recognition) {
      return Promise.resolve(combinedTranscript());
    }
    return new Promise<string>((resolve) => {
      // Already idle — onend will not fire again.
      if (!listeningRef.current) {
        resolve(combinedTranscript());
        return;
      }
      stopResolverRef.current = resolve;
      try {
        recognition.stop();
      } catch {
        stopResolverRef.current = null;
        resolve(combinedTranscript());
      }
      // Safety net: some browsers never fire onend after stop().
      setTimeout(() => {
        if (stopResolverRef.current === resolve) {
          stopResolverRef.current = null;
          markListening(false);
          resolve(combinedTranscript());
        }
      }, 1500);
    });
  }, []);

  const abort = useCallback(() => {
    wantListeningRef.current = false;
    stopResolverRef.current = null;
    try {
      recognitionRef.current?.abort();
    } catch {
      // Already stopped.
    }
    markListening(false);
    setInterim("");
    interimRef.current = "";
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      stopResolverRef.current = null;
      try {
        recognitionRef.current?.abort();
      } catch {
        // Nothing to release.
      }
    };
  }, []);

  return { listening, transcript, interim, error, start, stop, abort };
}
