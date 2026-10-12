"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { InventoryNav } from "@/components/InventoryNav";
import { createOutboundOrder, getProduct, getProducts } from "@/lib/inventory";
import { BRASALAND_LOCATIONS } from "@/lib/locations";
import {
  Ingredient,
  IngredientExitReason,
  IngredientExitResponse,
  INGREDIENT_EXIT_REASONS,
} from "@/lib/types";

function OutboundOrderFormContent() {
  const searchParams = useSearchParams();
  const preselectedIngredientId = searchParams.get("ingredient_id");

  const [products, setProducts] = useState<Ingredient[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Form fields
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>(
    preselectedIngredientId || ""
  );
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<IngredientExitReason>("consumption");
  const [locationId, setLocationId] = useState<number>(1);

  // Status & error states
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successOrder, setSuccessOrder] = useState<IngredientExitResponse | null>(null);

  // Initial load of ingredients
  useEffect(() => {
    let active = true;
    setLoadingProducts(true);

    getProducts()
      .then((data) => {
        if (!active) return;
        setProducts(data);
        if (preselectedIngredientId && data.some((p) => p.id === Number(preselectedIngredientId))) {
          setSelectedIngredientId(preselectedIngredientId);
        } else if (data.length > 0 && !selectedIngredientId) {
          setSelectedIngredientId(String(data[0].id));
        }
      })
      .catch((err) => {
        if (!active) return;
        setApiError(
          err instanceof Error
            ? err.message
            : "Could not load ingredients list from server."
        );
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });

    return () => {
      active = false;
    };
  }, [preselectedIngredientId]);

  // Reactive stock fetch when selected ingredient changes
  useEffect(() => {
    const ingId = Number(selectedIngredientId);
    if (!ingId) {
      setCurrentStock(null);
      return;
    }

    let active = true;
    setLoadingStock(true);
    setQuantityError(null);

    getProduct(ingId)
      .then((ingredient) => {
        if (!active) return;
        setCurrentStock(ingredient.current_stock);
        // Also sync products list
        setProducts((prev) =>
          prev.map((item) => (item.id === ingId ? ingredient : item))
        );
      })
      .catch((err) => {
        if (!active) return;
        // Fallback to locally cached product if getProduct fails
        const local = products.find((p) => p.id === ingId);
        if (local) {
          setCurrentStock(local.current_stock);
        } else {
          setApiError(err instanceof Error ? err.message : "Failed to fetch stock.");
        }
      })
      .finally(() => {
        if (active) setLoadingStock(false);
      });

    return () => {
      active = false;
    };
  }, [selectedIngredientId]);

  const selectedIngredient = products.find(
    (p) => p.id === Number(selectedIngredientId)
  );

  // Client-side guard: check if entered quantity exceeds available stock
  const numericQuantity = parseFloat(quantity);
  const hasEnteredQuantity = !isNaN(numericQuantity) && numericQuantity > 0;
  const isQuantityExceedingStock =
    currentStock !== null &&
    hasEnteredQuantity &&
    numericQuantity > currentStock;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(null);
    setQuantityError(null);
    setFieldErrors({});
    setSuccessOrder(null);

    const ingId = Number(selectedIngredientId);
    if (!ingId) {
      setFieldErrors({ ingredient_id: "Please select an ingredient." });
      return;
    }

    if (!hasEnteredQuantity) {
      setQuantityError("Please enter a valid positive quantity.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await createOutboundOrder({
        ingredient_id: ingId,
        quantity: numericQuantity,
        reason,
        location_id: Number(locationId),
      });

      // On successful submission
      setSuccessOrder(response);
      setQuantity("");
      setCurrentStock(response.ingredient.current_stock);
      setProducts((current) =>
        current.map((item) =>
          item.id === response.ingredient_id ? response.ingredient : item
        )
      );
    } catch (err: any) {
      const message =
        err?.message || "An unexpected error occurred while logging the exit.";

      // Display the HTTP 400 error message inline near the quantity field
      if (err?.status === 400 || (message && message.toLowerCase().includes("insufficient stock"))) {
        setQuantityError(message);
      } else {
        setApiError(message);
      }

      if (err?.fieldErrors) {
        setFieldErrors(err.fieldErrors);
        if (err.fieldErrors.quantity) {
          setQuantityError(err.fieldErrors.quantity);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
          Kitchen Operations &bull; Brasaland Digital
        </p>
        <h1 className="text-3xl font-semibold text-stone-900">
          Log Ingredient Exit or Waste (Outbound)
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Record ingredient consumption or food waste. Exits reduce available stock and cannot exceed on-hand inventory.
        </p>
      </header>

      <InventoryNav />

      {/* Success Alert */}
      {successOrder && (
        <div
          role="status"
          className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 text-emerald-900 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="text-xl">✅</span>
            <div className="space-y-1">
              <h2 className="font-semibold text-emerald-950">
                Outbound Exit Logged Successfully!
              </h2>
              <p className="text-sm text-emerald-800">
                Logged exit of <strong>{successOrder.quantity} {successOrder.ingredient.unit}</strong> of{" "}
                <strong>{successOrder.ingredient.name}</strong> (Reason:{" "}
                <span className="capitalize font-medium">{successOrder.reason}</span>) at Location #{successOrder.location_id}.
              </p>
              <p className="text-xs text-emerald-700">
                Remaining stock for <strong>{successOrder.ingredient.name}</strong> is now{" "}
                <strong>{successOrder.ingredient.current_stock} {successOrder.ingredient.unit}</strong>.
              </p>
              <div className="pt-2 flex gap-3 text-xs">
                <Link
                  href="/inventory/orders"
                  className="font-medium underline hover:text-emerald-950"
                >
                  View in Order History &rarr;
                </Link>
                <Link
                  href="/inventory/products"
                  className="font-medium underline hover:text-emerald-950"
                >
                  View All Products &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* General API Error Alert */}
      {apiError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="space-y-1">
              <h2 className="font-semibold text-red-950">Error Processing Outbound Order</h2>
              <p className="text-sm">{apiError}</p>
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
      >
        {/* Ingredient selector */}
        <div>
          <label
            htmlFor="ingredient_id"
            className="block text-sm font-medium text-stone-900 mb-1"
          >
            Ingredient (Product) <span className="text-red-500">*</span>
          </label>
          <select
            id="ingredient_id"
            name="ingredient_id"
            disabled={loadingProducts || submitting}
            value={selectedIngredientId}
            onChange={(e) => {
              setSelectedIngredientId(e.target.value);
              setSuccessOrder(null);
            }}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
          >
            {loadingProducts ? (
              <option value="">Loading ingredients list...</option>
            ) : products.length === 0 ? (
              <option value="">No ingredients available</option>
            ) : (
              products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.sku}) — {item.country === "CO" ? "Colombia" : "United States"}
                </option>
              ))
            )}
          </select>
          {fieldErrors.ingredient_id && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.ingredient_id}</p>
          )}
        </div>

        {/* Current Available Stock Display (Reactive requirement) */}
        <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              Current Available Stock
            </span>
            {loadingStock && (
              <span className="text-xs text-stone-400 animate-pulse">
                Refreshing stock...
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            {currentStock !== null ? (
              <>
                <span
                  className={`text-2xl font-bold ${
                    currentStock <= 0
                      ? "text-red-600"
                      : currentStock <= 15
                      ? "text-amber-600"
                      : "text-emerald-700"
                  }`}
                >
                  {currentStock.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-sm font-medium text-stone-600">
                  {selectedIngredient?.unit || "units"} available
                </span>
              </>
            ) : (
              <span className="text-sm text-stone-500">Select an ingredient to view stock</span>
            )}
          </div>
          {currentStock !== null && currentStock <= 0 && (
            <p className="mt-2 text-xs text-red-700 font-medium">
              ⚠️ Stock is currently 0. An exit cannot be logged until new stock is received.
            </p>
          )}
        </div>

        {/* Quantity field with inline error & UX warning */}
        <div>
          <label
            htmlFor="quantity"
            className="block text-sm font-medium text-stone-900 mb-1"
          >
            Exit Quantity {selectedIngredient ? `(${selectedIngredient.unit})` : ""}{" "}
            <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="quantity"
              name="quantity"
              type="number"
              step="any"
              min="0.000001"
              disabled={submitting}
              placeholder="e.g. 10"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setQuantityError(null);
                setFieldErrors((prev) => ({ ...prev, quantity: "" }));
              }}
              className={`w-full rounded-md border px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-1 ${
                quantityError
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : isQuantityExceedingStock
                  ? "border-amber-500 focus:border-amber-500 focus:ring-amber-500"
                  : "border-stone-300 focus:border-amber-600 focus:ring-amber-600"
              }`}
            />
            {selectedIngredient && (
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-stone-400 font-mono">
                {selectedIngredient.unit}
              </span>
            )}
          </div>

          {/* Inline HTTP 400 or validation error near quantity field */}
          {quantityError && (
            <div
              role="alert"
              className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700"
            >
              ⚠️ {quantityError}
            </div>
          )}

          {/* Client-side UX warning before user submits if quantity > available */}
          {!quantityError && isQuantityExceedingStock && (
            <div
              role="alert"
              className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
            >
              ⚠️ <strong>Warning:</strong> Requested quantity ({numericQuantity}{" "}
              {selectedIngredient?.unit}) exceeds current available stock ({currentStock}{" "}
              {selectedIngredient?.unit}). The submission will be rejected by the API because stock cannot go below zero.
            </div>
          )}
        </div>

        {/* Reason selector */}
        <div>
          <label
            htmlFor="reason"
            className="block text-sm font-medium text-stone-900 mb-1"
          >
            Exit Reason <span className="text-red-500">*</span>
          </label>
          <select
            id="reason"
            name="reason"
            disabled={submitting}
            value={reason}
            onChange={(e) => setReason(e.target.value as IngredientExitReason)}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 capitalize focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
          >
            {INGREDIENT_EXIT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r === "consumption"
                  ? "Consumption (Kitchen preparation & daily service)"
                  : "Waste (Spoilage, expiration, or kitchen spills)"}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-stone-500">
            Brasaland classifies kitchen exits as either standard kitchen consumption or documented waste.
          </p>
        </div>

        {/* Location selector */}
        <div>
          <label
            htmlFor="location_id"
            className="block text-sm font-medium text-stone-900 mb-1"
          >
            Restaurant Location <span className="text-red-500">*</span>
          </label>
          <select
            id="location_id"
            name="location_id"
            disabled={submitting}
            value={locationId}
            onChange={(e) => setLocationId(Number(e.target.value))}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
          >
            {BRASALAND_LOCATIONS.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.label} [{loc.country === "CO" ? "Colombia" : "United States"}]
              </option>
            ))}
          </select>
        </div>

        {/* Form actions */}
        <div className="pt-2 flex items-center justify-between">
          <Link
            href="/inventory/products"
            className="text-sm text-stone-600 hover:text-stone-900"
          >
            &larr; Cancel and return to Products
          </Link>
          <button
            type="submit"
            disabled={
              submitting ||
              loadingProducts ||
              products.length === 0 ||
              currentStock === null ||
              currentStock <= 0
            }
            className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Logging Exit..." : "Log Outbound Order"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function OutboundOrderPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-stone-500">Loading form...</p>}>
      <OutboundOrderFormContent />
    </Suspense>
  );
}
