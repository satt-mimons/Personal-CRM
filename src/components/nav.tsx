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

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Top bar (all sizes) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          pipeline
        </Link>

        <div className="flex items-center gap-2">
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
                {t.label}
              </Link>
            ))}
          </nav>

          {/* Log — prominent button, not a tab */}
          <Link
            href="/log"
            className="hidden rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 sm:inline-flex"
          >
            + Log
          </Link>

          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Bottom tab bar (mobile only) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 items-center border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${
              isActive(pathname, t.href)
                ? "text-neutral-900"
                : "text-neutral-400"
            }`}
          >
            {t.label}
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
