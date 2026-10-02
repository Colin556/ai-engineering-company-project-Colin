"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ApiError, createIncident, getIncidentOptions } from "@/lib/api";
import {
  INCIDENT_STATUSES,
  IncidentInput,
  IncidentOptions,
  IncidentStatus,
} from "@/lib/types";

const EMPTY_FORM: IncidentInput = {
  title: "",
  description: "",
  category: "other",
  status: "open",
  origin: "customer",
  branch: "central",
};
const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  discarded: "Discarded",
};

export default function NewIncidentPage() {
  const [form, setForm] = useState<IncidentInput>(EMPTY_FORM);
  const [options, setOptions] = useState<IncidentOptions | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsError(false);
    getIncidentOptions(controller.signal)
      .then(setOptions)
      .catch((error) => {
        if (error.name !== "AbortError") setOptionsError(true);
      });
    return () => controller.abort();
  }, [retry]);

  function setField<K extends keyof IncidentInput>(field: K, value: IncidentInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setSuccess(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    setSuccess(false);
    try {
      await createIncident(form);
      setForm(EMPTY_FORM);
      setSuccess(true);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setFieldErrors(error.fieldErrors);
      } else {
        setFormError("The incident could not be saved. Please check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass = "w-full rounded border border-stone-300 bg-white px-3 py-2";

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <header className="border-b border-stone-300 pb-5">
        <Link href="/incidents" className="text-sm text-stone-600 underline underline-offset-4">Back to incidents</Link>
        <p className="mb-1 mt-4 text-xs font-semibold uppercase text-amber-700">Operations</p>
        <h1 className="text-3xl font-semibold">Log an incident</h1>
        <p className="mt-2 text-stone-600">Record what happened and where it needs attention.</p>
      </header>

      {optionsError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>Incident form options could not be loaded.</span>
          <button className="underline" onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </div>
      )}
      {success && <p role="status" className="border-l-4 border-green-700 bg-green-50 px-3 py-3 text-sm text-green-900">Incident logged successfully. It is now available in the incident list.</p>}
      {formError && <p role="alert" className="border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}

      <form onSubmit={submit} className="grid gap-5" aria-busy={submitting}>
        <label className="grid gap-1 text-sm font-medium">
          Title
          <input required maxLength={160} value={form.title} onChange={(event) => setField("title", event.target.value)} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? "title-error" : undefined} className={fieldClass} />
          {fieldErrors.title && <FieldError id="title-error" message={fieldErrors.title} />}
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Description
          <textarea required rows={5} maxLength={5000} value={form.description} onChange={(event) => setField("description", event.target.value)} aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? "description-error" : undefined} className={fieldClass} />
          {fieldErrors.description && <FieldError id="description-error" message={fieldErrors.description} />}
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Category
            <select required value={form.category} onChange={(event) => setField("category", event.target.value as IncidentInput["category"])} aria-invalid={Boolean(fieldErrors.category)} className={fieldClass}>
              {options?.categories.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
            </select>
            {fieldErrors.category && <FieldError message={fieldErrors.category} />}
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Status
            <select required value={form.status} onChange={(event) => setField("status", event.target.value as IncidentStatus)} aria-invalid={Boolean(fieldErrors.status)} className={fieldClass}>
              {INCIDENT_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
            {fieldErrors.status && <FieldError message={fieldErrors.status} />}
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Origin
            <select
              required
              value={form.origin}
              onChange={(event) => {
                const nextOrigin = event.target.value as IncidentInput["origin"];
                setField("origin", nextOrigin);
                if (nextOrigin === "branch" && form.branch === "central" && options?.branches[0]) {
                  setField("branch", options.branches[0].value);
                }
              }}
              aria-invalid={Boolean(fieldErrors.origin)}
              className={fieldClass}
            >
              {options?.origins.map((origin) => <option key={origin} value={origin}>{origin[0].toUpperCase() + origin.slice(1)}</option>)}
            </select>
            {fieldErrors.origin && <FieldError message={fieldErrors.origin} />}
          </label>
          <label className={`grid gap-1 rounded border p-3 text-sm font-medium transition-colors ${form.origin === "branch" ? "border-amber-700 bg-amber-50" : "border-transparent"}`}>
            Branch
            <select required value={form.branch} onChange={(event) => setField("branch", event.target.value)} aria-invalid={Boolean(fieldErrors.branch)} className={fieldClass}>
              {options?.branches
                .filter((branch) => form.origin !== "branch" || branch.value !== "central")
                .map((branch) => <option key={branch.value} value={branch.value}>{branch.label}</option>)}
            </select>
            {fieldErrors.branch && <FieldError message={fieldErrors.branch} />}
          </label>
        </div>

        <button type="submit" disabled={submitting || !options} className="w-fit bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50">
          {submitting ? "Saving incident..." : "Submit incident"}
        </button>
      </form>
    </div>
  );
}

function FieldError({ id, message }: { id?: string; message: string }) {
  return <span id={id} className="text-sm font-normal text-red-700">{message}</span>;
}