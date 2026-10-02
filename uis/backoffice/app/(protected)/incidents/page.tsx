"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getIncidentOptions,
  getIncidentSummary,
  listIncidents,
  updateIncidentStatus,
} from "@/lib/api";
import {
  INCIDENT_STATUSES,
  Incident,
  IncidentOptions,
  IncidentOrigin,
  IncidentStatus,
  IncidentSummary,
} from "@/lib/types";

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  discarded: "Discarded",
};
const ORIGIN_LABELS: Record<IncidentOrigin, string> = {
  customer: "Customer",
  branch: "Branch",
  internal: "Internal",
};
const NEXT_STATUSES: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["in_progress", "discarded"],
  in_progress: ["resolved", "discarded"],
  resolved: [],
  discarded: [],
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [options, setOptions] = useState<IncidentOptions | null>(null);
  const [summary, setSummary] = useState<IncidentSummary | null>(null);
  const [status, setStatus] = useState<IncidentStatus | "">("");
  const [origin, setOrigin] = useState<IncidentOrigin | "">("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [updating, setUpdating] = useState<number[]>([]);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    listIncidents(
      { status: status || undefined, origin: origin || undefined, branch: branch || undefined },
      controller.signal
    )
      .then(setIncidents)
      .catch((error) => {
        if (error.name !== "AbortError") setLoadError("Incidents could not be loaded. Please retry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status, origin, branch, retry]);

  useEffect(() => {
    const controller = new AbortController();
    getIncidentOptions(controller.signal)
      .then(setOptions)
      .catch((error) => {
        if (error.name !== "AbortError") setOptions(null);
      });
    return () => controller.abort();
  }, [optionsRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryError(null);
    getIncidentSummary(controller.signal)
      .then(setSummary)
      .catch((error) => {
        if (error.name !== "AbortError") setSummaryError("Summary metrics are unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });
    return () => controller.abort();
  }, [summaryRetry]);

  async function changeStatus(incident: Incident, nextStatus: IncidentStatus) {
    setUpdateError(null);
    setUpdating((current) => [...current, incident.id]);
    setIncidents((current) =>
      current.map((item) => item.id === incident.id ? { ...item, status: nextStatus } : item)
    );
    try {
      const updatedIncident = await updateIncidentStatus(incident.id, nextStatus);
      setIncidents((current) =>
        current.map((item) => item.id === incident.id ? updatedIncident : item)
      );
      setSummaryRetry((current) => current + 1);
    } catch {
      setIncidents((current) =>
        current.map((item) => item.id === incident.id ? { ...item, status: incident.status } : item)
      );
      setUpdateError(`Could not update incident #${incident.id}; its status was restored.`);
    } finally {
      setUpdating((current) => current.filter((id) => id !== incident.id));
    }
  }

  const branchLabels = new Map(options?.branches.map((item) => [item.value, item.label]) ?? []);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 pb-5">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-amber-700">Operations</p>
          <h1 className="text-3xl font-semibold">Incident manager</h1>
          <p className="mt-2 text-stone-600">Track reports across Brasaland locations.</p>
        </div>
        <Link href="/incidents/new" className="bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Log incident
        </Link>
      </header>

      <section aria-label="Incident summary" className="border-y border-stone-300 bg-white px-4 py-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-semibold">Summary</h2>
          {summaryLoading && <span className="text-sm text-stone-500">Loading metrics...</span>}
        </div>
        {summaryError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-800">
            <span>{summaryError}</span>
            <button className="underline" onClick={() => setSummaryRetry((value) => value + 1)}>Retry summary</button>
          </div>
        )}
        {summary && !summaryError && (
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-5">
            <MetricGroup title={`All incidents (${summary.total})`} values={{ total: summary.total }} />
            <MetricGroup title="By status" values={summary.by_status} labels={STATUS_LABELS} />
            <MetricGroup title="By category" values={summary.by_category} />
            <MetricGroup title="By origin" values={summary.by_origin} labels={ORIGIN_LABELS} />
            <MetricGroup title="By branch" values={summary.by_branch} labels={Object.fromEntries(branchLabels)} />
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-end gap-4 border-b border-stone-300 pb-4">
        <label className="grid gap-1 text-sm font-medium">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as IncidentStatus | "")} className="min-w-40 rounded border border-stone-300 bg-white px-3 py-2">
            <option value="">All statuses</option>
            {INCIDENT_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Origin
          <select value={origin} onChange={(event) => setOrigin(event.target.value as IncidentOrigin | "")} className="min-w-40 rounded border border-stone-300 bg-white px-3 py-2">
            <option value="">All origins</option>
            {Object.entries(ORIGIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Branch
          <select value={branch} onChange={(event) => setBranch(event.target.value)} className="min-w-56 rounded border border-stone-300 bg-white px-3 py-2">
            <option value="">All branches</option>
            {options?.branches.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <span className="pb-2 text-sm text-stone-500">{loading ? "Loading incidents..." : `${incidents.length} incident(s)`}</span>
      </section>

      {updateError && <p role="alert" className="border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{updateError}</p>}
      {loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-800">
          <span>{loadError}</span>
          <button className="underline" onClick={() => setRetry((value) => value + 1)}>Retry list</button>
        </div>
      )}
      {options === null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-800">
          <span>Branch options are unavailable. The list remains usable.</span>
          <button className="underline" onClick={() => setOptionsRetry((value) => value + 1)}>Retry options</button>
        </div>
      )}

      <section aria-label="Incidents" className="overflow-x-auto bg-white">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-stone-900 text-left text-white">
            <tr>
              <th className="px-4 py-3 font-medium">Incident</th>
              <th className="px-4 py-3 font-medium">Category / origin</th>
              <th className="px-4 py-3 font-medium">Branch</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-500">Loading incidents...</td></tr>}
            {!loading && !loadError && incidents.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-500">No incidents match these filters. Try changing a filter or log a new incident.</td></tr>
            )}
            {!loading && incidents.map((incident) => (
              <tr key={incident.id} className="border-b border-stone-200 align-top last:border-0">
                <td className="max-w-[34rem] px-4 py-4">
                  <p className="font-semibold">{incident.title}</p>
                  <p className="mt-1 whitespace-normal text-stone-600">{incident.description}</p>
                </td>
                <td className="px-4 py-4"><p className="capitalize">{incident.category}</p><p className="mt-1 text-stone-500">{ORIGIN_LABELS[incident.origin]}</p></td>
                <td className="px-4 py-4">{branchLabels.get(incident.branch) ?? incident.branch}</td>
                <td className="px-4 py-4">
                  <select
                    aria-label={`Status for ${incident.title}`}
                    value={incident.status}
                    disabled={updating.includes(incident.id) || NEXT_STATUSES[incident.status].length === 0}
                    onChange={(event) => changeStatus(incident, event.target.value as IncidentStatus)}
                    className="rounded border border-stone-300 bg-white px-2 py-1.5 disabled:bg-stone-100"
                  >
                    <option value={incident.status}>{STATUS_LABELS[incident.status]}</option>
                    {NEXT_STATUSES[incident.status].map((nextStatus) => <option key={nextStatus} value={nextStatus}>{STATUS_LABELS[nextStatus]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-4 text-stone-600">{new Date(incident.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MetricGroup({
  title,
  values,
  labels = {},
}: {
  title: string;
  values: Record<string, number>;
  labels?: Record<string, string>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase text-stone-500">{title}</h3>
      <dl className="space-y-1 text-sm">
        {Object.entries(values).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3">
            <dt>{labels[key] ?? key.replaceAll("_", " ")}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
