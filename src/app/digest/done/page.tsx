import Link from "next/link";

/**
 * Lightweight confirmation landing for one-click digest email actions.
 * Public (no auth) so the email link works without a login dance.
 */
export default async function DigestDonePage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    action?: string;
    contact?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const action = sp.action;
  const contactId = sp.contact;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">pipeline</h1>
      {ok ? (
        <>
          <p className="mt-3 text-sm text-neutral-700">
            {action === "snooze"
              ? "Snoozed for 1 week. You’re clear."
              : "Marked as touched. Cadence resets from today."}
          </p>
          {contactId && (
            <Link
              href={`/contacts/${contactId}`}
              className="mt-6 inline-flex justify-center rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
            >
              Open contact
            </Link>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-red-600">
          That link is invalid or expired. Open the app and act from Today
          instead.
        </p>
      )}
      <Link
        href="/"
        className="mt-4 text-center text-sm text-neutral-500 underline underline-offset-2"
      >
        Go to Today
      </Link>
    </main>
  );
}
