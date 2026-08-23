"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff3d5,_#f4eadf_55%,_#f1eee9)] text-stone-900">
      <header className="border-b border-amber-900/15 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-amber-950">
              {t.appName}
            </h1>
            <p className="text-sm text-stone-600">{t.appSubtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-amber-800/25 bg-white px-4 py-2 text-sm font-medium text-amber-900 transition hover:border-amber-800/45"
            >
              {t.dashboardTitle}
            </Link>
            <Link
              href="/candidates/new"
              className="rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
            >
              {t.addCandidate}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
