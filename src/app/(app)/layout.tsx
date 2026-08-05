import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getReminderNavCount } from "@/lib/db/reminders";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already gates auth; this is a defense-in-depth check and gives
  // Server Components a guaranteed session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const todayCount = await getReminderNavCount();

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav todayCount={todayCount} />
      {/* pb-24 leaves room for the mobile bottom bar; wide enough for board */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:pb-6">
        {children}
      </main>
    </div>
  );
}
