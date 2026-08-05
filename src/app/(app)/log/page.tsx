import { getContactsForPicker } from "@/lib/db/contacts";
import { LogFlow } from "./log-flow";

export const dynamic = "force-dynamic";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const { contactId } = await searchParams;
  const contacts = await getContactsForPicker();
  const preselected =
    contactId ? contacts.find((c) => c.id === contactId) ?? null : null;
  // Boolean only — never pass the key to the client.
  const transcriptionConfigured = Boolean(process.env.GROQ_API_KEY);
  return (
    <LogFlow
      contacts={contacts}
      preselectedContact={preselected}
      transcriptionConfigured={transcriptionConfigured}
    />
  );
}
