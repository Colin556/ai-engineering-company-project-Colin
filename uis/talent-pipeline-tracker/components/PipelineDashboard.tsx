"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { listCandidates } from "@/lib/api";
import { STAGE_ORDER, STATUS_ORDER } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { getStageLabel, getStatusLabel } from "@/lib/labels";
import { CandidateRecord, CandidateStage, CandidateStatus } from "@/lib/types";
import { CandidateTable } from "@/components/CandidateTable";

export function PipelineDashboard() {
  const { locale, t } = useI18n();
  const [records, setRecords] = useState<CandidateRecord[]>([]);
  const [status, setStatus] = useState<"" | CandidateStatus>("");
  const [stage, setStage] = useState<"" | CandidateStage>("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await listCandidates({
          status: status || undefined,
          stage: stage || undefined,
          search: searchQuery || undefined,
          page: 1,
          limit: 50,
        });
        setRecords(response.data);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : t.unknownError);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [status, stage, searchQuery, t.unknownError]);

  const headerStats = useMemo(() => {
    const inProgress = records.filter((record) => record.status === "in_progress").length;
    const selected = records.filter((record) => record.status === "selected").length;
    return {
      total: records.length,
      inProgress,
      selected,
    };
  }, [records]);

  const onSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value);
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-900/15 bg-white/85 p-6 shadow-sm">
        <h2 className="font-serif text-3xl font-semibold text-amber-950">{t.dashboardTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm text-stone-600">{t.dashboardSubtitle}</p>
        <p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t.noOrdersMessage}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MetricCard label={t.listSectionTitle} value={String(headerStats.total)} />
          <MetricCard label={getStatusLabel(locale, "in_progress")} value={String(headerStats.inProgress)} />
          <MetricCard label={getStatusLabel(locale, "selected")} value={String(headerStats.selected)} />
        </div>
      </div>

      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-[220px] flex-1 gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Search</span>
            <input
              value={searchInput}
              onChange={onSearchChange}
              placeholder={t.searchPlaceholder}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="grid min-w-[170px] gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">{t.status}</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "" | CandidateStatus)}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {STATUS_ORDER.map((currentStatus) => (
                <option key={currentStatus} value={currentStatus}>
                  {getStatusLabel(locale, currentStatus)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-[190px] gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">{t.stage}</span>
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value as "" | CandidateStage)}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {STAGE_ORDER.map((currentStage) => (
                <option key={currentStage} value={currentStage}>
                  {getStageLabel(locale, currentStage)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              setStatus("");
              setStage("");
              setSearchInput("");
              setSearchQuery("");
            }}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          >
            {t.clearFilters}
          </button>

          <Link
            href="/candidates/new"
            className="rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
          >
            {t.addCandidate}
          </Link>
        </div>

        <div className="mt-5">
          {isLoading ? <p className="text-sm text-stone-600">{t.loading}</p> : null}
          {!isLoading && error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {!isLoading && !error && records.length === 0 ? (
            <p className="text-sm text-stone-600">{t.emptyCandidates}</p>
          ) : null}
          {!isLoading && !error && records.length > 0 ? <CandidateTable records={records} /> : null}
        </div>
      </section>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
    </div>
  );
}
