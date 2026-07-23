import { Suspense } from "react";
import {
  getContactStatuses,
  getContactVerticals,
  type ContactSort,
} from "@/lib/db/contacts";
import type { Stage, Tier } from "@/lib/db/types";
import { STAGES } from "@/lib/db/types";
import { ContactList } from "./contact-list";
import { ContactsToolbar } from "./contacts-toolbar";
import { QuickAddContact } from "./quick-add";

export const dynamic = "force-dynamic";

const TIERS: Tier[] = ["priority", "warm", "background"];
const SORTS: ContactSort[] = ["next_due", "last_touch", "name"];

function parseFilters(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const tier = one("tier");
  const stage = one("stage");
  const sort = one("sort");
  return {
    vertical: one("vertical") || null,
    tier: tier && (TIERS as string[]).includes(tier) ? (tier as Tier) : null,
    stage:
      stage && (STAGES as readonly string[]).includes(stage)
        ? (stage as Stage)
        : null,
    overdueOnly: one("overdue") === "1",
    search: one("q") || null,
    sort:
      sort && (SORTS as string[]).includes(sort)
        ? (sort as ContactSort)
        : ("next_due" as ContactSort),
  };
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [contacts, verticals] = await Promise.all([
    getContactStatuses(filters),
    getContactVerticals(),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Contacts</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {contacts.length} shown
          {filters.overdueOnly ? " · overdue only" : ""}.
        </p>
      </div>

      <Suspense fallback={null}>
        <ContactsToolbar verticals={verticals} />
      </Suspense>

      <QuickAddContact />

      <ContactList contacts={contacts} />
    </section>
  );
}
