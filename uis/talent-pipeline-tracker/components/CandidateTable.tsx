"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { getStageLabel, getStatusLabel } from "@/lib/labels";
import { useI18n } from "@/lib/i18n";
import { CandidateRecord } from "@/lib/types";

interface CandidateTableProps {
  records: CandidateRecord[];
}

export function CandidateTable({ records }: CandidateTableProps) {
  const { locale, t } = useI18n();

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200">
          <thead className="bg-stone-50">
            <tr>
              <Th>{t.name}</Th>
              <Th>{t.position}</Th>
              <Th>{t.status}</Th>
              <Th>{t.stage}</Th>
              <Th>{t.actions}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {records.map((record) => (
              <tr key={record.id} className="hover:bg-amber-50/40">
                <td className="px-4 py-3.5">
                  <p className="font-medium text-stone-900">{record.full_name}</p>
                  <p className="text-sm text-stone-500">{record.email}</p>
                </td>
                <td className="px-4 py-3.5 text-sm text-stone-700">{record.position}</td>
                <td className="px-4 py-3.5">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
                    {getStatusLabel(locale, record.status)}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm text-stone-700">
                  {getStageLabel(locale, record.stage)}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/candidates/${record.id}`}
                      className="rounded-full border border-amber-700/20 px-3 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                    >
                      {t.viewDetails}
                    </Link>
                    <Link
                      href={`/candidates/${record.id}/edit`}
                      className="rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                    >
                      {t.editData}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">{children}</th>
  );
}
