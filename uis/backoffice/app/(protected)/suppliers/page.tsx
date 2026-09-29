"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  createSupplier,
  listSuppliers,
  updateSupplierRate,
  updateSupplierStatus,
} from "@/lib/api";
import {
  SUPPLIER_CATEGORIES,
  Supplier,
  SupplierCategory,
  SupplierCountry,
  SupplierInput,
} from "@/lib/types";

const COUNTRY_LABELS = { CO: "Colombia", US: "United States" } as const;

const EMPTY_FORM: SupplierInput = {
  name: "",
  country: "CO",
  product_categories: [],
  rate_per_unit: 0,
  status: "active",
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [country, setCountry] = useState<SupplierCountry | "">("");
  const [category, setCategory] = useState<SupplierCategory | "">("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    listSuppliers(
      {
        country: country || undefined,
        category: category || undefined,
      },
      controller.signal
    )
      .then(setSuppliers)
      .catch((error) => {
        if (error.name !== "AbortError") setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [country, category]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await createSupplier(form);
      const matchesFilters =
        (!country || created.country === country) &&
        (!category || created.product_categories.includes(category));
      if (matchesFilters) setSuppliers((current) => [...current, created]);
      setForm(EMPTY_FORM);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not register supplier."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function replaceSupplier(updated: Supplier) {
    setSuppliers((current) =>
      current.map((supplier) =>
        supplier.id === updated.id ? updated : supplier
      )
    );
  }

  function toggleCategory(value: SupplierCategory) {
    setForm((current) => ({
      ...current,
      product_categories: current.product_categories.includes(value)
        ? current.product_categories.filter((category) => category !== value)
        : [...current.product_categories, value],
    }));
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase text-amber-700">
          Procurement
        </p>
        <h1 className="text-3xl font-semibold">Supplier Directory</h1>
        <p className="mt-2 text-stone-600">
          Central supplier rates, coverage, and operating status.
        </p>
      </header>

      <section className="border-y border-stone-300 bg-white px-4 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1 text-sm font-medium">
            Country
            <select
              value={country}
              onChange={(event) =>
                setCountry(event.target.value as SupplierCountry | "")
              }
              className="min-w-44 rounded border border-stone-300 bg-white px-3 py-2"
            >
              <option value="">All countries</option>
              <option value="CO">Colombia</option>
              <option value="US">United States</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Category
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as SupplierCategory | "")
              }
              className="min-w-44 rounded border border-stone-300 bg-white px-3 py-2 capitalize"
            >
              <option value="">All categories</option>
              {SUPPLIER_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-2 text-sm text-stone-500">
            {loading ? "Loading..." : `${suppliers.length} supplier(s)`}
          </span>
        </div>
      </section>

      {loadError && <ErrorMessage message={loadError} />}

      <section aria-label="Supplier list" className="overflow-x-auto bg-white">
        <table className="w-full min-w-[850px] border-collapse text-sm">
          <thead className="bg-stone-900 text-left text-white">
            <tr>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium">Categories</th>
              <th className="px-4 py-3 font-medium">Rate / unit</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {!loading && suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-500">
                  No suppliers match these filters.
                </td>
              </tr>
            )}
            {suppliers.map((supplier) => (
              <SupplierRow
                key={supplier.id}
                supplier={supplier}
                onUpdated={replaceSupplier}
              />
            ))}
          </tbody>
        </table>
      </section>

      <section className="border-t-4 border-amber-600 bg-white p-5">
        <h2 className="text-xl font-semibold">Register supplier</h2>
        <form onSubmit={handleCreate} className="mt-5 grid gap-5">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium">
              Name
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="rounded border border-stone-300 px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Country
              <select
                value={form.country}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    country: event.target.value as SupplierCountry,
                  }))
                }
                className="rounded border border-stone-300 bg-white px-3 py-2"
              >
                <option value="CO">Colombia</option>
                <option value="US">United States</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Rate per unit
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={form.rate_per_unit || ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    rate_per_unit: Number(event.target.value),
                  }))
                }
                className="rounded border border-stone-300 px-3 py-2"
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Categories</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {SUPPLIER_CATEGORIES.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={form.product_categories.includes(value)}
                    onChange={() => toggleCategory(value)}
                    className="size-4 accent-amber-700"
                  />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>

          {formError && <ErrorMessage message={formError} />}
          <button
            disabled={submitting}
            className="w-fit rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {submitting ? "Registering..." : "Register supplier"}
          </button>
        </form>
      </section>
    </div>
  );
}

function SupplierRow({
  supplier,
  onUpdated,
}: {
  supplier: Supplier;
  onUpdated: (supplier: Supplier) => void;
}) {
  const [rate, setRate] = useState(String(supplier.rate_per_unit));
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUpdating(true);
    setError(null);
    try {
      const updated = await updateSupplierRate(supplier.id, Number(rate));
      onUpdated(updated);
      setRate(String(updated.rate_per_unit));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rate update failed.");
    } finally {
      setUpdating(false);
    }
  }

  async function toggleStatus() {
    setUpdating(true);
    setError(null);
    try {
      const updated = await updateSupplierStatus(
        supplier.id,
        supplier.status === "active" ? "suspended" : "active"
      );
      onUpdated(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status update failed.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <tr className="border-b border-stone-200 align-top last:border-0">
      <td className="px-4 py-4 font-medium">
        {supplier.name}
        {error && <p className="mt-1 max-w-48 text-xs text-red-700">{error}</p>}
      </td>
      <td className="px-4 py-4">{COUNTRY_LABELS[supplier.country]}</td>
      <td className="px-4 py-4">
        <div className="flex max-w-52 flex-wrap gap-1">
          {supplier.product_categories.map((category) => (
            <span
              key={category}
              className="border border-stone-300 bg-stone-50 px-2 py-0.5 capitalize"
            >
              {category}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-4">
        <form onSubmit={saveRate} className="flex items-center gap-2">
          <input
            aria-label={`Rate for ${supplier.name}`}
            type="number"
            min="0.01"
            step="0.01"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            className="w-24 rounded border border-stone-300 px-2 py-1.5"
          />
          <button
            disabled={updating}
            className="rounded border border-stone-400 px-2 py-1.5 hover:bg-stone-100 disabled:opacity-50"
          >
            Save
          </button>
        </form>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 text-xs font-semibold capitalize ${
              supplier.status === "active"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {supplier.status}
          </span>
          <button
            type="button"
            disabled={updating}
            onClick={toggleStatus}
            className="text-xs font-medium underline decoration-stone-400 underline-offset-4 disabled:opacity-50"
          >
            {supplier.status === "active" ? "Suspend" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}