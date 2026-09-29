"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CandidateForm } from "@/components/CandidateForm";
import { getCandidate, replaceCandidate } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { CandidateRecord } from "@/lib/types";

export default function EditCandidatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [record, setRecord] = useState<CandidateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await getCandidate(id);
        setRecord(response);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : t.unknownError);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id, t.unknownError]);

  return (
    <AppShell>
      <section className="space-y-5">
        <Link
          href={`/candidates/${id}`}
          className="inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          {t.backToList}
        </Link>

        {loading ? <p className="text-sm text-stone-600">{t.loading}</p> : null}
        {!loading && error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        {!loading && !error && record ? (
          <CandidateForm
            mode="edit"
            initialValues={{
              full_name: record.full_name,
              email: record.email,
              phone: record.phone,
              position: record.position,
              linkedin_url: record.linkedin_url || "",
              cv_url: record.cv_url || "",
              experience_years: String(record.experience_years),
            }}
            submitLabel={t.submitEdit}
            pendingLabel={t.submitting}
            onSubmit={async (payload) => {
              await replaceCandidate(id, payload);
              router.push(`/candidates/${id}`);
            }}
          />
        ) : null}
      </section>
    </AppShell>
  );
}
