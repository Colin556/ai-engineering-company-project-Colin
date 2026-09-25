"use client";

import { useCallback, useRef, useState } from "react";
import { analyzeIncidentsFile, exportResultsUrl } from "@/lib/api";
import { IncidentAnalysisResult } from "@/lib/types";

export default function IncidentsPage() {
  const [result, setResult] = useState<IncidentAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeIncidentsFile(file);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error analyzing the file.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onSelectFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Incident Analysis</h1>
      <p className="text-stone-600 mb-6">
        Upload the after-sales incidents CSV export to validate the records and
        view a summary of the analysis.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          dragging ? "border-stone-900 bg-stone-100" : "border-stone-300 bg-white"
        }`}
      >
        <p className="text-stone-700">
          Drag &amp; drop a CSV file here, or click to select one.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={onSelectFile}
        />
      </div>

      {loading && <p className="mt-4 text-stone-600">Analyzing file...</p>}

      {error && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <section className="rounded-lg border border-stone-300 bg-white p-5">
            <h2 className="font-semibold mb-3">General metrics</h2>
            <dl className="grid grid-cols-3 gap-4 text-center">
              <Metric label="Total records" value={result.total_records} />
              <Metric label="Valid" value={result.total_valid} />
              <Metric label="Invalid" value={result.total_invalid} />
            </dl>
          </section>

          {result.total_invalid > 0 && (
            <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
              <h2 className="font-semibold mb-3">
                {result.total_invalid} invalid record(s) were excluded from the
                analysis
              </h2>
              <ul className="text-sm space-y-1">
                {Object.entries(result.invalid_reason_counts).map(([reason, count]) => (
                  <li key={reason} className="flex justify-between">
                    <span>{reason}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-stone-300 bg-white p-5">
            <h2 className="font-semibold mb-3">Breakdown by category</h2>
            <BreakdownTable data={result.category_breakdown} />
          </section>

          <section className="rounded-lg border border-stone-300 bg-white p-5">
            <h2 className="font-semibold mb-3">Breakdown by status</h2>
            <BreakdownTable data={result.status_breakdown} />
          </section>

          <section className="rounded-lg border border-stone-300 bg-white p-5">
            <h2 className="font-semibold mb-3">Satisfaction index</h2>
            <p className="text-sm text-stone-600">
              Closed cases with recorded score: {result.closed_with_score_count}
            </p>
            <p className="text-lg font-semibold">
              Average satisfaction:{" "}
              {result.avg_satisfaction_closed !== null
                ? result.avg_satisfaction_closed.toFixed(2)
                : "N/A"}
            </p>
          </section>

          <a
            href={exportResultsUrl()}
            className="inline-block rounded-md bg-stone-900 px-4 py-2 text-white hover:bg-stone-700"
          >
            Download results as CSV
          </a>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-stone-600">{label}</div>
    </div>
  );
}

function BreakdownTable({ data }: { data: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {Object.entries(data).map(([key, value]) => (
          <tr key={key} className="border-b border-stone-100 last:border-0">
            <td className="py-1 capitalize">{key}</td>
            <td className="py-1 text-right font-medium">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
