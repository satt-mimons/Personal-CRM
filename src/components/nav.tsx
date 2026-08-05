"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/actions";

const TABS = [
  { href: "/", label: "Today" },
  { href: "/contacts", label: "Contacts" },
  { href: "/board", label: "Board" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav({ todayCount = 0 }: { todayCount?: number }) {
  const pathname = usePathname();

  return (
    <>
      {/* Top bar (all sizes) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          pipeline
        </Link>

        <div className="flex items-center gap-2">
          {/* Log — prominent button, not a tab */}
          <Link
            href="/log"
            className="hidden rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 sm:inline-flex"
          >
            + Log
          </Link>

          {/* Desktop tabs */}
          <nav className="hidden items-center gap-1 sm:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  isActive(pathname, t.href)
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <span>{t.label}</span>
                {t.href === "/" && todayCount > 0 && (
                  <span
                    className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isActive(pathname, t.href)
                        ? "bg-white text-neutral-900"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {todayCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <form action={signOut}>
            <div className="flex items-center gap-1">
              <Link
                href="/settings/reminders"
                className={`rounded-md px-2 py-1.5 text-sm ${
                  isActive(pathname, "/settings")
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                Settings
              </Link>
              <button
                type="submit"
                className="rounded-md px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
              >
                Sign out
              </button>
            </div>
          </form>
        </div>
      </header>

      {/* Bottom tab bar (mobile only) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 items-center border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${
              isActive(pathname, t.href)
                ? "text-neutral-900"
                : "text-neutral-400"
            }`}
          >
            {t.label}
            {t.href === "/" && todayCount > 0 && (
              <span className="absolute right-5 top-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {todayCount}
              </span>
            )}
          </Link>
        ))}
        <Link
          href="/log"
          className="mx-auto my-1 inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow"
        >
          + Log
        </Link>
      </nav>
    </>
  );
}
