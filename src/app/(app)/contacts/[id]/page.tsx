import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactDetail } from "@/lib/db/contacts";
import { getInteractionsByContact } from "@/lib/db/interactions";
import { getOpenActionItemsByContact } from "@/lib/db/action-items";
import { ContactHeader } from "./contact-header";
import { StatusStrip } from "./status-strip";
import { ActionList } from "./action-list";
import { InteractionTimeline } from "./timeline";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getContactDetail(id);
  if (!detail) notFound();

  const { contact, status } = detail;
  const [interactions, openActions] = await Promise.all([
    getInteractionsByContact(id),
    getOpenActionItemsByContact(id),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/contacts"
          className="text-sm text-neutral-500 underline underline-offset-2"
        >
          ← Contacts
        </Link>
        <Link
          href={`/log?contactId=${contact.id}`}
          className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          + Log interaction
        </Link>
      </div>

      <ContactHeader contact={contact} />
      <StatusStrip status={status} />

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">
          Open action items
          {openActions.length > 0 ? ` (${openActions.length})` : ""}
        </h2>
        <ActionList contactId={contact.id} items={openActions} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">History</h2>
        <InteractionTimeline interactions={interactions} />
      </div>
    </section>
  );
}
