"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { configureInventoryLocation, getInventoryLocationSettings, rejectDirectStockEdit } from "../lib/inventory";
import { BRASALAND_LOCATIONS } from "../lib/locations";
import { Ingredient } from "../lib/types";

export function InventoryControls({ ingredient, close }: { ingredient: Ingredient; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [location, setLocation] = useState(ingredient.country === "CO" ? 1 : 11);
  const [minimum, setMinimum] = useState("");
  const [threshold, setThreshold] = useState("10");
  const [days, setDays] = useState("30");
  const [samples, setSamples] = useState("3");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    setMinimum("");
    getInventoryLocationSettings(ingredient.id, location).then((settings) => {
      if (!active) return;
      setMinimum(settings ? String(settings.minimum_quantity) : "");
      setThreshold(String(settings?.threshold_percent ?? 10));
      setDays(String(settings?.history_days ?? 30));
      setSamples(String(settings?.minimum_samples ?? 3));
    }).catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [ingredient.id, location]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await configureInventoryLocation(ingredient.id, location, {
        minimum_quantity: Number(minimum), threshold_percent: Number(threshold),
        history_days: Number(days), minimum_samples: Number(samples),
      });
      setMessage("Controls saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save controls.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} onCancel={close} aria-labelledby="controls-title" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl backdrop:bg-black/40">
        <h2 id="controls-title" className="text-xl font-semibold text-stone-900">{ingredient.name}</h2>
        <form onSubmit={save} className="mt-4 grid gap-4 text-sm text-stone-900">
          <label className="grid gap-1">Location
            <select value={location} onChange={(event) => setLocation(Number(event.target.value))} className="rounded border border-stone-300 px-3 py-2">
              {BRASALAND_LOCATIONS.filter((item) => item.country === ingredient.country).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Total Stock ({ingredient.unit})
            <input readOnly value={ingredient.current_stock} aria-readonly="true" className="rounded border border-stone-300 bg-stone-100 px-3 py-2" onPaste={(event) => {
              event.preventDefault();
              const text = event.clipboardData.getData("text").trim();
              const attempted = Number(text);
              if (text && Number.isFinite(attempted)) {
                void rejectDirectStockEdit(ingredient.id, location, attempted).catch((error) => setMessage(error.message));
              }
            }} />
          </label>
          <label className="grid gap-1">Minimum Stock ({ingredient.unit})
            <input type="number" min="0" step="0.000001" required value={minimum} onChange={(event) => setMinimum(event.target.value)} className="rounded border border-stone-300 px-3 py-2" />
          </label>
          <label className="grid gap-1">Price Variance Threshold (%)
            <input type="number" min="0.01" step="0.01" required value={threshold} onChange={(event) => setThreshold(event.target.value)} className="rounded border border-stone-300 px-3 py-2" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-1">History Window (Days)
              <input type="number" min="1" max="365" required value={days} onChange={(event) => setDays(event.target.value)} className="w-full rounded border border-stone-300 px-3 py-2" />
            </label>
            <label className="grid gap-1">Minimum Purchases
              <input type="number" min="1" max="100" required value={samples} onChange={(event) => setSamples(event.target.value)} className="w-full rounded border border-stone-300 px-3 py-2" />
            </label>
          </div>
          {message && <p role="status">{message}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={close} className="px-3 py-2">Close</button>
            <button disabled={busy} className="rounded bg-stone-900 px-4 py-2 text-white">{busy ? "Saving..." : "Save Controls"}</button>
          </div>
        </form>
    </dialog>
  );
}