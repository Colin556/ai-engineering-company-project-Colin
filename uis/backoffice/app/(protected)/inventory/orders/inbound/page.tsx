"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { InventoryNav } from "@/components/InventoryNav";
import { createInboundOrder, getProducts } from "@/lib/inventory";
import { BRASALAND_LOCATIONS } from "@/lib/locations";
import { Ingredient, IngredientEntryResponse } from "@/lib/types";

function InboundOrderFormContent() {
  const searchParams = useSearchParams();
  const preselectedIngredientId = searchParams.get("ingredient_id");

  const [products, setProducts] = useState<Ingredient[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Form fields
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>(
    preselectedIngredientId || ""
  );
  const [quantity, setQuantity] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [locationId, setLocationId] = useState<number>(1);

  // Status & error states
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successOrder, setSuccessOrder] = useState<IngredientEntryResponse | null>(null);

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

  const selectedIngredient = products.find(
    (p) => p.id === Number(selectedIngredientId)
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(null);
    setFieldErrors({});
    setSuccessOrder(null);

    const ingId = Number(selectedIngredientId);
    if (!ingId) {
      setFieldErrors({ ingredient_id: "Please select an ingredient." });
      return;
    }

    const numQty = parseFloat(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      setFieldErrors({ quantity: "Please enter a valid positive delivery quantity." });
      return;
    }

    if (!supplierName.trim()) {
      setFieldErrors({ supplier_name: "Supplier name is required." });
      return;
    }

    setSubmitting(true);

    try {
      const response = await createInboundOrder({
        ingredient_id: ingId,
        quantity: numQty,
        supplier_name: supplierName.trim(),
        location_id: Number(locationId),
      });

      // On successful submission: clear form and show confirmation message
      setSuccessOrder(response);
      setQuantity("");
      setSupplierName("");
      // Refresh current stock of the ingredient in local list
      setProducts((current) =>
        current.map((item) =>
          item.id === response.ingredient_id ? response.ingredient : item
        )
      );
    } catch (err: any) {
      // On 400 / 500, display the API's error message in a visible element
      const message =
        err?.message || "An unexpected error occurred while logging the delivery.";
      setApiError(message);
      if (err?.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
          Inbound Logistics &bull; Brasaland Digital
        </p>
        <h1 className="text-3xl font-semibold text-stone-900">
          Register Ingredient Delivery (Inbound)
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Log an incoming supplier shipment into central inventory. Delivery increases computed stock.
        </p>
      </header>

      <InventoryNav />

      {/* Success Banner */}
      {successOrder && (
        <div
          role="status"
          className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 text-emerald-900 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="text-xl">✅</span>
            <div className="space-y-1">
              <h2 className="font-semibold text-emerald-950">
                Delivery Registered Successfully!
              </h2>
              <p className="text-sm text-emerald-800">
                Received <strong>{successOrder.quantity} {successOrder.ingredient.unit}</strong> of{" "}
                <strong>{successOrder.ingredient.name}</strong> from{" "}
                <em>{successOrder.supplier_name}</em> at Location #{successOrder.location_id}.
              </p>
              <p className="text-xs text-emerald-700">
                Updated stock for <strong>{successOrder.ingredient.name}</strong> is now{" "}
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

      {/* API Error Alert */}
      {apiError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="space-y-1">
              <h2 className="font-semibold text-red-950">Registration Failed</h2>
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
            className={`w-full rounded-md border px-3 py-2 text-sm text-stone-900 bg-white focus:outline-none focus:ring-1 ${
              fieldErrors.ingredient_id
                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                : "border-stone-300 focus:border-amber-600 focus:ring-amber-600"
            }`}
          >
            {loadingProducts ? (
              <option value="">Loading ingredients list...</option>
            ) : products.length === 0 ? (
              <option value="">No ingredients available</option>
            ) : (
              products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.sku}) — {item.country === "CO" ? "Colombia" : "United States"} [Stock: {item.current_stock} {item.unit}]
                </option>
              ))
            )}
          </select>
          {fieldErrors.ingredient_id && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.ingredient_id}</p>
          )}
          {selectedIngredient && (
            <p className="mt-1.5 text-xs text-stone-500">
              Unit: <strong>{selectedIngredient.unit}</strong> &bull; Category:{" "}
              <strong className="capitalize">{selectedIngredient.category}</strong> &bull; Market:{" "}
              <strong>{selectedIngredient.country === "CO" ? "Colombia" : "United States"}</strong>
            </p>
          )}
        </div>

        {/* Quantity field */}
        <div>
          <label
            htmlFor="quantity"
            className="block text-sm font-medium text-stone-900 mb-1"
          >
            Delivered Quantity {selectedIngredient ? `(${selectedIngredient.unit})` : ""}{" "}
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
              placeholder="e.g. 50"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setFieldErrors((prev) => ({ ...prev, quantity: "" }));
              }}
              className={`w-full rounded-md border px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-1 ${
                fieldErrors.quantity
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-stone-300 focus:border-amber-600 focus:ring-amber-600"
              }`}
            />
            {selectedIngredient && (
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-stone-400 font-mono">
                {selectedIngredient.unit}
              </span>
            )}
          </div>
          {fieldErrors.quantity && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.quantity}</p>
          )}
        </div>

        {/* Supplier Name */}
        <div>
          <label
            htmlFor="supplier_name"
            className="block text-sm font-medium text-stone-900 mb-1"
          >
            Supplier Name <span className="text-red-500">*</span>
          </label>
          <input
            id="supplier_name"
            name="supplier_name"
            type="text"
            disabled={submitting}
            placeholder="e.g. Carnes del Valle S.A., MiamiMeat Co., Salsas Artesanales Ltda."
            value={supplierName}
            onChange={(e) => {
              setSupplierName(e.target.value);
              setFieldErrors((prev) => ({ ...prev, supplier_name: "" }));
            }}
            className={`w-full rounded-md border px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-1 ${
              fieldErrors.supplier_name
                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                : "border-stone-300 focus:border-amber-600 focus:ring-amber-600"
            }`}
          />
          {fieldErrors.supplier_name && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.supplier_name}</p>
          )}
        </div>

        {/* Receiving Location */}
        <div>
          <label
            htmlFor="location_id"
            className="block text-sm font-medium text-stone-900 mb-1"
          >
            Receiving Restaurant Location <span className="text-red-500">*</span>
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
          <p className="mt-1 text-xs text-stone-500">
            Select one of Brasaland&apos;s 14 restaurant locations in Colombia or Florida.
          </p>
        </div>

        {/* Submit button */}
        <div className="pt-2 flex items-center justify-between">
          <Link
            href="/inventory/products"
            className="text-sm text-stone-600 hover:text-stone-900"
          >
            &larr; Cancel and return to Products
          </Link>
          <button
            type="submit"
            disabled={submitting || loadingProducts || products.length === 0}
            className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Registering Delivery..." : "Register Inbound Delivery"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function InboundOrderPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-stone-500">Loading form...</p>}>
      <InboundOrderFormContent />
    </Suspense>
  );
}
