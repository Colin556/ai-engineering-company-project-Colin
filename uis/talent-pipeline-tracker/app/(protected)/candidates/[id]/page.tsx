"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CandidateDetailClient } from "@/components/CandidateDetailClient";
import { useI18n } from "@/lib/i18n";

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();

  return (
    <AppShell>
      <section className="space-y-5">
        <Link
          href="/"
          className="inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          {t.backToList}
        </Link>

        <header>
          <h2 className="font-serif text-3xl font-semibold text-amber-950">{t.detailTitle}</h2>
        </header>

        <CandidateDetailClient id={id} />
      </section>
    </AppShell>
  );
}
