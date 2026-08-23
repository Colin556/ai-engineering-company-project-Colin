"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CandidateForm } from "@/components/CandidateForm";
import { createCandidate } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function NewCandidatePage() {
  const router = useRouter();
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

        <CandidateForm
          mode="create"
          submitLabel={t.submitCreate}
          pendingLabel={t.submitting}
          onSubmit={async (payload) => {
            const created = await createCandidate(payload);
            router.push(`/candidates/${created.id}`);
          }}
        />
      </section>
    </AppShell>
  );
}
