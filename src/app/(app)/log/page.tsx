import { getContactsForPicker } from "@/lib/db/contacts";
import { LogFlow } from "./log-flow";

export const dynamic = "force-dynamic";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{
    contactId?: string;
    thankYouContactId?: string;
    thankYouInteractionId?: string;
    gmailConnected?: string;
    gmailError?: string;
  }>;
}) {
  const params = await searchParams;
  const contacts = await getContactsForPicker();
  const preselected =
    params.contactId
      ? contacts.find((c) => c.id === params.contactId) ?? null
      : null;
  // Boolean only — never pass the key to the client.
  const transcriptionConfigured = Boolean(process.env.GROQ_API_KEY);

  const resumeThankYou =
    params.thankYouContactId && params.thankYouInteractionId
      ? {
          contactId: params.thankYouContactId,
          interactionId: params.thankYouInteractionId,
          gmailConnected: params.gmailConnected === "1",
          gmailError: params.gmailError ?? null,
        }
      : null;

  return (
    <LogFlow
      contacts={contacts}
      preselectedContact={preselected}
      transcriptionConfigured={transcriptionConfigured}
      resumeThankYou={resumeThankYou}
    />
  );
}
