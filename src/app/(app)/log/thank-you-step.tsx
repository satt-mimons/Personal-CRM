"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectGmailAction,
  draftThankYouAction,
  openThankYouInGmailAction,
} from "./actions";
import type { ThankYouContext } from "./types";
import { THANK_YOU_DRAFT_STORAGE_KEY } from "./types";

const INPUT =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900";
const LABEL = "text-xs font-medium uppercase tracking-wide text-neutral-500";

function persistDraft(ctx: ThankYouContext & { subject: string; body: string; email: string }) {
  try {
    sessionStorage.setItem(THANK_YOU_DRAFT_STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // Private mode / quota — OAuth resume may need to regenerate.
  }
}

function gmailErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "token":
      return "Google approved access, but no refresh token came back. Disconnect Pipeline in your Google Account permissions, then Connect Gmail again.";
    case "config":
      return "Gmail connect isn't fully configured on the server (missing encryption key). Restart the app after setting GMAIL_TOKEN_ENCRYPTION_KEY.";
    case "persist":
      return "Couldn't save Gmail access. Apply the gmail_connections migration in Supabase, then Connect Gmail again.";
    default:
      return "Gmail connected, but something went wrong saving access. Try Connect Gmail again.";
  }
}

export function ThankYouStep({
  context,
  gmailJustConnected = false,
  gmailError = null,
  onDone,
}: {
  context: ThankYouContext;
  /** True when returning from incremental Gmail OAuth with a saved token. */
  gmailJustConnected?: boolean;
  /** Set when OAuth returned but token persistence failed. */
  gmailError?: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [to, setTo] = useState(context.email ?? "");
  const [subject, setSubject] = useState(context.subject ?? "");
  const [body, setBody] = useState(context.body ?? "");
  const [gmailConnected, setGmailConnected] = useState(gmailJustConnected);
  const [drafting, setDrafting] = useState(!context.subject && !context.body);
  const [error, setError] = useState<string | null>(
    gmailError ? gmailErrorMessage(gmailError) : null,
  );
  const [showConnectHint, setShowConnectHint] = useState(Boolean(gmailError));
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const statusLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (context.subject || context.body) {
      setDrafting(false);
      if (!statusLoaded.current) {
        statusLoaded.current = true;
        void draftThankYouAction({
          contactId: context.contactId,
          interactionId: context.interactionId,
          summary: context.summary,
          rawNotes: context.rawNotes,
          interactionType: context.interactionType,
          contactName: context.contactName,
          company: context.company,
        }).then((res) => {
          if (!cancelled && res.ok && !gmailJustConnected) {
            setGmailConnected(res.gmailConnected);
          }
        });
      }
      return () => {
        cancelled = true;
      };
    }

    setDrafting(true);
    void draftThankYouAction({
      contactId: context.contactId,
      interactionId: context.interactionId,
      summary: context.summary,
      rawNotes: context.rawNotes,
      interactionType: context.interactionType,
      contactName: context.contactName,
      company: context.company,
    }).then((res) => {
      if (cancelled) return;
      setDrafting(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSubject(res.subject);
      setBody(res.body);
      if (!gmailJustConnected) setGmailConnected(res.gmailConnected);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.interactionId]);

  function regenerate() {
    setError(null);
    setDrafting(true);
    startTransition(async () => {
      const res = await draftThankYouAction({
        contactId: context.contactId,
        interactionId: context.interactionId,
        summary: context.summary,
        rawNotes: context.rawNotes,
        interactionType: context.interactionType,
        contactName: context.contactName,
        company: context.company,
      });
      setDrafting(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSubject(res.subject);
      setBody(res.body);
      setGmailConnected(res.gmailConnected);
    });
  }

  function buildReturnPath(): string {
    const params = new URLSearchParams({
      thankYouContactId: context.contactId,
      thankYouInteractionId: context.interactionId,
    });
    return `/log?${params.toString()}`;
  }

  function openInGmail() {
    setError(null);
    if (!to.trim() || !to.includes("@")) {
      setError("Add their email so Gmail knows who to send to.");
      return;
    }

    persistDraft({
      ...context,
      email: to.trim(),
      subject,
      body,
    });

    if (!gmailConnected) {
      setShowConnectHint(true);
      return;
    }

    startTransition(async () => {
      const res = await openThankYouInGmailAction({
        contactId: context.contactId,
        to,
        subject,
        body,
      });
      if (!res.ok) {
        if (res.needsConnect) {
          setGmailConnected(false);
          setShowConnectHint(true);
        }
        setError(res.error);
        return;
      }
      try {
        sessionStorage.removeItem(THANK_YOU_DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }
      window.location.assign(res.gmailUrl);
    });
  }

  function connectGmail() {
    persistDraft({
      ...context,
      email: to.trim(),
      subject,
      body,
    });
    startTransition(async () => {
      await connectGmailAction(buildReturnPath());
    });
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy — select the text manually.");
    }
  }

  function skip() {
    try {
      sessionStorage.removeItem(THANK_YOU_DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
    onDone();
    router.push(`/contacts/${context.contactId}`);
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Thank them?</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Based on today&apos;s notes with{" "}
          <span className="font-medium text-neutral-700">
            {context.contactName}
          </span>
          . Edit anything — nothing sends until you hit Send in Gmail.
        </p>
      </div>

      {gmailJustConnected && !gmailError && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Gmail connected. Click <span className="font-medium">Open draft in Gmail</span>{" "}
          to create the draft — nothing sends until you hit Send there.
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>To</label>
          <input
            className={INPUT}
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Subject</label>
          <input
            className={INPUT}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={drafting}
            placeholder={drafting ? "Drafting…" : "Subject"}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className={LABEL}>Message</label>
            <button
              type="button"
              onClick={regenerate}
              disabled={drafting || pending}
              className="text-xs text-emerald-700 underline underline-offset-2 disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
          <textarea
            className={`${INPUT} min-h-40 resize-y leading-relaxed`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={drafting}
            placeholder={drafting ? "Drafting a thank-you…" : "Write your thank-you"}
          />
        </div>
      </div>

      {showConnectHint && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm text-neutral-700">
            Connect Gmail to create a draft in your inbox. Nothing sends until
            you hit Send in Gmail.
          </p>
          <button
            type="button"
            onClick={connectGmail}
            disabled={pending}
            className="mt-3 w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Redirecting…" : "Connect Gmail"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="sticky bottom-20 flex flex-col gap-2 sm:bottom-4">
        <button
          type="button"
          onClick={openInGmail}
          disabled={pending || drafting}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "Working…" : "Open draft in Gmail"}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyBody}
            disabled={!body.trim() || pending}
            className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={skip}
            disabled={pending}
            className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      </div>
    </section>
  );
}
