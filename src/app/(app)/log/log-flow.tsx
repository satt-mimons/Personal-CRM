"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContactPickerRow } from "@/lib/db/contacts";
import type { ExtractionResult } from "@/lib/llm/extract";
import { normalize } from "@/lib/utils/fuzzy";
import { extractAction, loadThankYouContextAction } from "./actions";
import { ConfirmForm } from "./confirm-form";
import { ThankYouStep } from "./thank-you-step";
import { VoiceRecorder } from "./voice-recorder";
import type { DuplicateInfo, ThankYouContext } from "./types";
import { THANK_YOU_DRAFT_STORAGE_KEY } from "./types";

type Step =
  | { name: "capture" }
  | {
      name: "confirm";
      extraction: ExtractionResult;
      duplicates: DuplicateInfo[];
    }
  | {
      name: "thankYou";
      context: ThankYouContext;
      gmailJustConnected: boolean;
      gmailError: string | null;
    };

function filterContacts(
  contacts: ContactPickerRow[],
  query: string,
): ContactPickerRow[] {
  const q = normalize(query);
  if (!q) return [];
  return contacts
    .map((c) => {
      const hay = normalize(`${c.name} ${c.company ?? ""}`);
      const idx = hay.indexOf(q);
      return { c, idx };
    })
    .filter((x) => x.idx !== -1)
    .sort((a, b) => a.idx - b.idx)
    .slice(0, 8)
    .map((x) => x.c);
}

function readStoredDraft(): ThankYouContext | null {
  try {
    const raw = sessionStorage.getItem(THANK_YOU_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ThankYouContext;
  } catch {
    return null;
  }
}

export function LogFlow({
  contacts,
  preselectedContact = null,
  transcriptionConfigured = false,
  resumeThankYou = null,
}: {
  contacts: ContactPickerRow[];
  preselectedContact?: ContactPickerRow | null;
  /** True when GROQ_API_KEY is present on the server (never the key itself). */
  transcriptionConfigured?: boolean;
  /** Resume thank-you after Gmail OAuth redirect. */
  resumeThankYou?: {
    contactId: string;
    interactionId: string;
    gmailConnected: boolean;
    gmailError: string | null;
  } | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "capture" });
  const [rawText, setRawText] = useState("");
  const [selectedContact, setSelectedContact] =
    useState<ContactPickerRow | null>(preselectedContact);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resuming, setResuming] = useState(Boolean(resumeThankYou));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resumeStarted = useRef(false);

  const results = useMemo(
    () => filterContacts(contacts, query),
    [contacts, query],
  );

  useEffect(() => {
    if (!resumeThankYou || resumeStarted.current) return;
    resumeStarted.current = true;

    const stored = readStoredDraft();
    const storedMatches =
      stored &&
      stored.contactId === resumeThankYou.contactId &&
      stored.interactionId === resumeThankYou.interactionId
        ? stored
        : null;

    void (async () => {
      const loaded = await loadThankYouContextAction({
        contactId: resumeThankYou.contactId,
        interactionId: resumeThankYou.interactionId,
      });
      if (!loaded.ok) {
        setResuming(false);
        setError(loaded.error);
        router.replace("/log");
        return;
      }
      setStep({
        name: "thankYou",
        context: {
          contactId: resumeThankYou.contactId,
          interactionId: resumeThankYou.interactionId,
          contactName: loaded.contactName,
          company: loaded.company,
          email: storedMatches?.email ?? loaded.email,
          interactionType: loaded.interactionType,
          summary: loaded.summary,
          rawNotes: loaded.rawNotes,
          subject: storedMatches?.subject,
          body: storedMatches?.body,
        },
        gmailJustConnected: resumeThankYou.gmailConnected,
        gmailError: resumeThankYou.gmailError,
      });
      setResuming(false);
      router.replace("/log");
    })();
  }, [resumeThankYou, router]);

  /** Append rather than replace so dictation can be mixed with typing, and so
   *  several short bursts add up instead of overwriting each other. */
  function appendTranscript(text: string) {
    setRawText((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function submitCapture() {
    setError(null);
    startTransition(async () => {
      const res = await extractAction({
        rawText,
        contactId: selectedContact?.id ?? null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStep({
        name: "confirm",
        extraction: res.extraction,
        duplicates: res.duplicates,
      });
    });
  }

  if (resuming) {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-sm text-neutral-500">Restoring your thank-you draft…</p>
      </section>
    );
  }

  if (step.name === "thankYou") {
    return (
      <ThankYouStep
        context={step.context}
        gmailJustConnected={step.gmailJustConnected}
        gmailError={step.gmailError}
        onDone={() => setStep({ name: "capture" })}
      />
    );
  }

  if (step.name === "confirm") {
    return (
      <ConfirmForm
        rawText={rawText}
        extraction={step.extraction}
        duplicates={step.duplicates}
        pickedContact={selectedContact}
        onBack={() => {
          setStep({ name: "capture" });
          requestAnimationFrame(() => textareaRef.current?.focus());
        }}
        onSavedThankYou={(ctx) =>
          setStep({
            name: "thankYou",
            context: ctx,
            gmailJustConnected: false,
            gmailError: null,
          })
        }
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Log an interaction</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Dump it now, clean it up in one tap.
        </p>
      </div>

      <div className="relative">
        {selectedContact ? (
          <div className="flex items-center justify-between rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2">
            <span className="text-sm">
              <span className="font-medium">{selectedContact.name}</span>
              {selectedContact.company && (
                <span className="text-neutral-500">
                  {" "}
                  · {selectedContact.company}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedContact(null);
                setQuery("");
              }}
              className="text-sm text-neutral-500 underline underline-offset-2"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              placeholder="Link to an existing contact (optional)"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
            />
            {showResults && results.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedContact(c);
                        setShowResults(false);
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-neutral-50"
                    >
                      <span className="text-sm font-medium">{c.name}</span>
                      {c.company && (
                        <span className="text-xs text-neutral-500">
                          {c.company}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <VoiceRecorder
        contactId={selectedContact?.id ?? null}
        onTranscript={appendTranscript}
        disabled={pending}
        transcriptionConfigured={transcriptionConfigured}
      />

      <textarea
        ref={textareaRef}
        autoFocus
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={10}
        placeholder="Dump everything — who, what company, what you talked about, what you promised."
        className="min-h-[45dvh] w-full resize-y rounded-xl border border-neutral-300 p-4 text-base leading-relaxed outline-none focus:border-neutral-900"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={submitCapture}
        disabled={pending || rawText.trim() === ""}
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Reading your notes…" : "Extract & review"}
      </button>
    </section>
  );
}
