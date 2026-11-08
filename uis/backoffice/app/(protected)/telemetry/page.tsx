"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { getTelemetryReport } from "@/lib/api";
import { TelemetryReport } from "@/lib/types";

type Bar = { label: string; value: number; display: string };

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const day = (iso: string) => iso.slice(0, 10);
const previousDay = (iso: string) => new Date(Date.parse(iso) - 86_400_000).toISOString().slice(0, 10);

export default function TelemetryReportPage() {
  const [period, setPeriod] = useState<{ start_date?: string; end_date?: string }>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<TelemetryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTelemetryReport(period, controller.signal)
      .then((data) => {
        setReport(data);
        setFrom(day(data.period.from));
        setTo(previousDay(data.period.to));
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "The telemetry report could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  function applyPeriod(event: FormEvent) {
    event.preventDefault();
    setPeriod({ start_date: from || undefined, end_date: to || undefined });
  }

  const metrics = report?.metrics;
  const dailyTotals = new Map<string, number>();
  for (const row of metrics?.events_per_day ?? []) {
    dailyTotals.set(row.date, (dailyTotals.get(row.date) ?? 0) + row.count);
  }
  const dailyErrorRate = new Map<string, number>();
  for (const row of metrics?.error_rate_by_type ?? []) {
    dailyErrorRate.set(row.date, (dailyErrorRate.get(row.date) ?? 0) + row.error_rate);
  }

  return (
    <div className="space-y-8">
      <header className="border-b border-stone-300 pb-5">
        <p className="mb-1 text-xs font-semibold uppercase text-amber-700">Engineering</p>
        <h1 className="text-3xl font-semibold">Telemetry report</h1>
        <p className="mt-2 text-stone-600">Operational health from stored telemetry events (UTC days).</p>
      </header>

      <form onSubmit={applyPeriod} className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm font-medium">
          From
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="rounded border border-stone-300 bg-white px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          To (inclusive)
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="rounded border border-stone-300 bg-white px-3 py-2" />
        </label>
        <button type="submit" className="bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Apply</button>
        <button type="button" onClick={() => setPeriod({})} className="border border-stone-400 bg-white px-4 py-2 text-sm hover:bg-stone-100">Last 7 days</button>
        {loading && <span className="pb-2 text-sm text-stone-500">Loading report...</span>}
      </form>

      {report && (
        <p className="text-sm text-stone-600">
          Showing <strong>{day(report.period.from)}</strong> to <strong>{previousDay(report.period.to)}</strong>{" "}
          (window <code>[{report.period.from}, {report.period.to})</code>). Results are cached for 60 seconds.
        </p>
      )}
      {error && <p role="alert" className="border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {metrics && (
        <>
          <Section title="Events per day">
            <BarChart bars={[...dailyTotals].map(([date, count]) => ({ label: date, value: count, display: String(count) }))} />
          </Section>

          <Section title="Event type distribution">
            <BarChart bars={metrics.event_type_distribution.map((row) => ({
              label: row.event_type, value: row.count, display: `${row.count} (${percent(row.share)}, ${row.active_days} d)`,
            }))} />
          </Section>

          <Section title="API error rate per day">
            <BarChart color="bg-red-600" max={1} bars={[...dailyErrorRate].map(([date, rate]) => ({ label: date, value: rate, display: percent(rate) }))} />
            <Table
              headers={["Date", "Error code", "Failures", "Est. requests", "Error rate"]}
              rows={metrics.error_rate_by_type.map((row) => [row.date, row.error_code, row.failures, row.requests, percent(row.error_rate)])}
            />
          </Section>

          <Section title="API latency by route">
            <Table
              headers={["Date", "Route", "Sampled", "Avg ms (weighted)", "Max ms", "Slow (≥1s)"]}
              rows={metrics.api_latency_by_route.map((row) => [row.date, row.route_id, row.sampled_requests, row.avg_ms, row.max_ms, row.slow_requests])}
            />
          </Section>

          <Section title="Login failure rate per day">
            <BarChart color="bg-amber-600" max={1} bars={metrics.auth_failure_rate.map((row) => ({
              label: row.date, value: row.failure_rate, display: `${percent(row.failure_rate)} (${row.failures}/${row.attempts})`,
            }))} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-stone-300 bg-white px-4 py-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function BarChart({ bars, max, color = "bg-stone-800" }: { bars: Bar[]; max?: number; color?: string }) {
  if (bars.length === 0) return <p className="text-sm text-stone-500">No events in this period.</p>;
  const scale = max ?? Math.max(...bars.map((bar) => bar.value), 1);
  return (
    <div className="space-y-1">
      {bars.map((bar) => (
        <div key={bar.label} className="grid grid-cols-[12rem_1fr_10rem] items-center gap-3 text-sm">
          <span className="truncate font-mono text-xs">{bar.label}</span>
          <div className="h-4 bg-stone-100">
            <div className={`h-4 ${color}`} style={{ width: `${Math.min(bar.value / scale, 1) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums">{bar.display}</span>
        </div>
      ))}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className="text-sm text-stone-500">No events in this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-stone-900 text-left text-white">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-stone-200">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 tabular-nums">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
