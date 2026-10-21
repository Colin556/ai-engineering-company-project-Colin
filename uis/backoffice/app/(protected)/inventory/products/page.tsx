"use client";

import Link from "next/link";
import { useState } from "react";
import { InventoryNav } from "@/components/InventoryNav";
import { getProducts } from "@/lib/inventory";
import { useAsyncList } from "@/lib/useAsyncList";
import {
  Ingredient,
  IngredientCategory,
  IngredientCountry,
  INGREDIENT_CATEGORIES,
} from "@/lib/types";

/**
 * Stock Level Thresholds for Brasaland Kitchen Operations:
 * - Critical / Out of Stock (<= 0): Kitchen operations cannot prepare dishes requiring this ingredient; immediate supplier delivery needed.
 * - Low Stock (> 0 and <= 15): Inventory has fallen below the standard safety buffer (~15 units/kg/litres); supplier reorder should be triggered.
 * - Healthy Stock (> 15): Sufficient stock available across restaurant kitchens for standard daily operations.
 */
function getStockStatus(stock: number): {
  level: "critical" | "low" | "healthy";
  label: string;
  badgeClass: string;
  textClass: string;
} {
  if (stock <= 0) {
    return {
      level: "critical",
      label: "Out of Stock",
      badgeClass: "bg-red-100 text-red-800 border-red-200",
      textClass: "text-red-700 font-bold",
    };
  }
  if (stock <= 15) {
    return {
      level: "low",
      label: "Low Stock",
      badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
      textClass: "text-amber-700 font-semibold",
    };
  }
  return {
    level: "healthy",
    label: "Healthy",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    textClass: "text-emerald-700 font-medium",
  };
}

const COUNTRY_NAMES: Record<IngredientCountry, string> = {
  CO: "Colombia (CO)",
  US: "United States (US)",
};

function loadProducts(
  country: string,
  signal: AbortSignal
): Promise<Ingredient[]> {
  return getProducts(
    country ? (country as IngredientCountry) : undefined,
    signal
  );
}

export default function InventoryProductsPage() {
  const [countryFilter, setCountryFilter] = useState<IngredientCountry | "">("");
  const [categoryFilter, setCategoryFilter] = useState<IngredientCategory | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const {
    items: products,
    loading,
    error,
  } = useAsyncList(countryFilter, loadProducts, "Failed to load ingredients.");

  const filteredProducts = products.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesName = item.name.toLowerCase().includes(q);
      const matchesSku = item.sku.toLowerCase().includes(q);
      if (!matchesName && !matchesSku) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
          Operations &bull; Central Inventory
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-stone-900">
              Ingredients &amp; Stock Levels
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Single source of truth for stock across Brasaland kitchens in Colombia and Florida.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/inventory/orders/inbound"
              className="inline-flex items-center rounded-md bg-stone-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-stone-800 transition"
            >
              + Register Delivery
            </Link>
            <Link
              href="/inventory/orders/outbound"
              className="inline-flex items-center rounded-md border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 transition"
            >
              - Log Exit / Waste
            </Link>
          </div>
        </div>
      </header>

      <InventoryNav />

      {/* Filter controls */}
      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="country-filter" className="block text-xs font-semibold uppercase text-stone-600 mb-1">
              Market / Country
            </label>
            <select
              id="country-filter"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value as IngredientCountry | "")}
              className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-600 focus:outline-none"
            >
              <option value="">All Markets (CO &amp; US)</option>
              <option value="CO">Colombia (CO)</option>
              <option value="US">United States (US)</option>
            </select>
          </div>

          <div>
            <label htmlFor="category-filter" className="block text-xs font-semibold uppercase text-stone-600 mb-1">
              Category
            </label>
            <select
              id="category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as IngredientCategory | "")}
              className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 capitalize focus:border-amber-600 focus:outline-none"
            >
              <option value="">All Categories</option>
              {INGREDIENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="search-input" className="block text-xs font-semibold uppercase text-stone-600 mb-1">
              Search by Ingredient or SKU
            </label>
            <input
              id="search-input"
              type="text"
              placeholder="e.g. Beef brisket, BRS-SAUCE..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <div className="font-semibold mb-1">Error loading inventory</div>
          <p>{error}</p>
        </div>
      )}

      {/* Table view */}
      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-stone-900 text-stone-100">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">SKU</th>
                <th scope="col" className="px-4 py-3 font-semibold">Ingredient</th>
                <th scope="col" className="px-4 py-3 font-semibold">Category</th>
                <th scope="col" className="px-4 py-3 font-semibold">Market</th>
                <th scope="col" className="px-4 py-3 font-semibold">Unit</th>
                <th scope="col" className="px-4 py-3 font-semibold">Current Stock</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-stone-500">
                    Loading stock records from Brasaland Inventory API...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-stone-500">
                    No ingredients found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((ingredient) => {
                  const status = getStockStatus(ingredient.current_stock);
                  return (
                    <tr
                      key={ingredient.id}
                      className="hover:bg-stone-50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-stone-600">
                        {ingredient.sku}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-900">
                        {ingredient.name}
                      </td>
                      <td className="px-4 py-3 capitalize text-stone-600">
                        {ingredient.category}
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        <span className="inline-block rounded bg-stone-100 px-2 py-0.5 text-xs font-medium">
                          {ingredient.country === "CO" ? "🇨🇴 CO" : "🇺🇸 US"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {ingredient.unit}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-base ${status.textClass}`}>
                          {ingredient.current_stock.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}{" "}
                          <span className="text-xs font-normal text-stone-500">
                            {ingredient.unit}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.badgeClass}`}
                        >
                          {status.level === "critical" && (
                            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
                          )}
                          {status.level === "low" && (
                            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                          )}
                          {status.level === "healthy" && (
                            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          )}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/inventory/orders/inbound?ingredient_id=${ingredient.id}`}
                            className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 transition"
                            title={`Receive delivery of ${ingredient.name}`}
                          >
                            + Inbound
                          </Link>
                          <Link
                            href={`/inventory/orders/outbound?ingredient_id=${ingredient.id}`}
                            className="rounded border border-amber-600 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 transition"
                            title={`Log exit or waste for ${ingredient.name}`}
                          >
                            - Outbound
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
