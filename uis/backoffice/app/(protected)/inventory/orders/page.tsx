"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InventoryNav } from "@/components/InventoryNav";
import { getOrders } from "@/lib/inventory";
import { BRASALAND_LOCATIONS, getLocationLabel } from "@/lib/locations";
import { IngredientCountry, InventoryOrder } from "@/lib/types";

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return isoString;
  }
}

export default function InventoryOrdersPage() {
  const [orders, setOrders] = useState<InventoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [countryFilter, setCountryFilter] = useState<IngredientCountry | "">("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const params: { country?: IngredientCountry; location_id?: number } = {};
    if (countryFilter) params.country = countryFilter;
    if (locationFilter) params.location_id = Number(locationFilter);

    getOrders(params)
      .then((data) => {
        if (!active) return;
        // The API returns orders sorted ascending by created_at.
        // For operations review, reverse so newest orders appear first.
        setOrders([...data].reverse());
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load order history from inventory service."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [countryFilter, locationFilter]);

  const filteredOrders = orders.filter((order) => {
    if (typeFilter !== "all" && order.order_type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const productName = order.ingredient?.name?.toLowerCase() || "";
      const sku = order.ingredient?.sku?.toLowerCase() || "";
      const user = order.user_uuid?.toLowerCase() || "";
      const extra =
        order.order_type === "inbound"
          ? order.supplier_name?.toLowerCase() || ""
          : order.reason?.toLowerCase() || "";
      if (
        !productName.includes(q) &&
        !sku.includes(q) &&
        !user.includes(q) &&
        !extra.includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
          Audit &bull; Brasaland Digital
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-stone-900">
              Inventory Order History
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Read-only immutable log of all ingredient deliveries received and kitchen exits/waste logged.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/inventory/orders/inbound"
              className="inline-flex items-center rounded-md bg-stone-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-stone-800 transition"
            >
              + Inbound Delivery
            </Link>
            <Link
              href="/inventory/orders/outbound"
              className="inline-flex items-center rounded-md border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 transition"
            >
              - Outbound Exit
            </Link>
          </div>
        </div>
      </header>

      <InventoryNav />

      {/* Filter toolbar */}
      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label htmlFor="type-filter" className="block text-xs font-semibold uppercase text-stone-600 mb-1">
              Order Type
            </label>
            <select
              id="type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | "inbound" | "outbound")}
              className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-600 focus:outline-none"
            >
              <option value="all">All Orders (Inbound &amp; Outbound)</option>
              <option value="inbound">Inbound Deliveries Only</option>
              <option value="outbound">Outbound Exits Only</option>
            </select>
          </div>

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
              <option value="">All Markets</option>
              <option value="CO">Colombia (CO)</option>
              <option value="US">United States (US)</option>
            </select>
          </div>

          <div>
            <label htmlFor="location-filter" className="block text-xs font-semibold uppercase text-stone-600 mb-1">
              Location
            </label>
            <select
              id="location-filter"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-600 focus:outline-none"
            >
              <option value="">All Locations (1–14)</option>
              {BRASALAND_LOCATIONS.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="search-filter" className="block text-xs font-semibold uppercase text-stone-600 mb-1">
              Search Orders
            </label>
            <input
              id="search-filter"
              type="text"
              placeholder="Search ingredient, user, supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Error alert */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <div className="font-semibold mb-1">Error retrieving orders</div>
          <p>{error}</p>
        </div>
      )}

      {/* Orders Table */}
      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left text-sm">
            <thead className="bg-stone-900 text-stone-100">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                <th scope="col" className="px-4 py-3 font-semibold">Product Name (Ingredient)</th>
                <th scope="col" className="px-4 py-3 font-semibold">Quantity</th>
                <th scope="col" className="px-4 py-3 font-semibold">Details</th>
                <th scope="col" className="px-4 py-3 font-semibold">Location</th>
                <th scope="col" className="px-4 py-3 font-semibold">Created At</th>
                <th scope="col" className="px-4 py-3 font-semibold">Created By (user_uuid)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-stone-500">
                    Loading order records...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-stone-500">
                    No orders found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isInbound = order.order_type === "inbound";
                  const unit = order.ingredient?.unit || "units";

                  return (
                    <tr
                      key={`${order.order_type}-${order.id}`}
                      className="hover:bg-stone-50 transition-colors"
                    >
                      {/* Visual distinction for order type */}
                      <td className="px-4 py-3">
                        {isInbound ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            <span>↓</span> Inbound Delivery
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                            <span>↑</span> Outbound Exit
                          </span>
                        )}
                      </td>

                      {/* Product Name */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-stone-900">
                          {order.ingredient?.name || `Ingredient #${order.ingredient_id}`}
                        </div>
                        {order.ingredient?.sku && (
                          <div className="font-mono text-xs text-stone-500">
                            {order.ingredient.sku} &bull; {order.ingredient.country === "CO" ? "🇨🇴 CO" : "🇺🇸 US"}
                          </div>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="px-4 py-3 font-semibold">
                        <span
                          className={
                            isInbound ? "text-emerald-700" : "text-amber-800"
                          }
                        >
                          {isInbound ? "+" : "-"}
                          {order.quantity.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}{" "}
                          <span className="text-xs font-normal text-stone-500">
                            {unit}
                          </span>
                        </span>
                      </td>

                      {/* Details (Supplier or Reason) */}
                      <td className="px-4 py-3 text-stone-700">
                        {isInbound ? (
                          <span className="text-xs">
                            Supplier:{" "}
                            <strong className="text-stone-900">
                              {order.supplier_name}
                            </strong>
                          </span>
                        ) : (
                          <span className="text-xs">
                            Reason:{" "}
                            <strong className="capitalize text-stone-900">
                              {order.reason}
                            </strong>
                          </span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3 text-xs text-stone-700">
                        {getLocationLabel(order.location_id)}
                      </td>

                      {/* Creation Date */}
                      <td className="px-4 py-3 text-xs text-stone-600 whitespace-nowrap">
                        {formatDate(order.created_at)}
                      </td>

                      {/* User UUID */}
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-xs text-stone-600 bg-stone-100 rounded px-1.5 py-0.5 inline-block max-w-[140px] truncate"
                          title={order.user_uuid}
                        >
                          {order.user_uuid}
                        </span>
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
