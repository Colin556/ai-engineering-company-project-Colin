"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, getMe, updateMyProfile } from "@/lib/api";
import { MeResponse } from "@/lib/types";

type Field = "name" | "phone" | "address";

const FIELDS: { name: Field; label: string; type: string; autoComplete: string }[] = [
  { name: "name", label: "Full name", type: "text", autoComplete: "name" },
  { name: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  { name: "address", label: "Address", type: "text", autoComplete: "street-address" },
];

export default function ProfilePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [form, setForm] = useState<Record<Field, string>>({ name: "", phone: "", address: "" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getMe()
      .then((data) => {
        if (!active) return;
        setMe(data);
        setForm({
          name: data.profile?.name ?? "",
          phone: data.profile?.phone ?? "",
          address: data.profile?.address ?? "",
        });
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Could not load your profile.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setFormError(null);
    setFieldErrors({});
    try {
      const profile = await updateMyProfile({
        name: form.name.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
      setMe((current) => (current ? { ...current, profile } : current));
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setFieldErrors(err.fieldErrors);
      } else {
        setFormError(err instanceof Error ? err.message : "Could not save your profile.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
        {loadError}
      </p>
    );
  }
  if (!me) return <p className="text-stone-600">Loading profile...</p>;

  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold">My profile</h1>
      <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-stone-500">Email</dt>
        <dd className="font-medium">{me.email}</dd>
        <dt className="text-stone-500">Role</dt>
        <dd className="capitalize">{me.role}</dd>
      </dl>

      <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border border-stone-300 bg-white p-6">
        {FIELDS.map((field) => (
          <label key={field.name} className="grid gap-1 text-sm font-medium">
            {field.label}
            <input
              type={field.type}
              autoComplete={field.autoComplete}
              value={form[field.name]}
              onChange={(event) => {
                setSaved(false);
                setForm((current) => ({ ...current, [field.name]: event.target.value }));
              }}
              aria-invalid={Boolean(fieldErrors[field.name])}
              className={`rounded border px-3 py-2 ${
                fieldErrors[field.name] ? "border-red-500" : "border-stone-300"
              }`}
            />
            {fieldErrors[field.name] && (
              <span className="text-xs font-normal text-red-700">{fieldErrors[field.name]}</span>
            )}
          </label>
        ))}

        {formError && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {formError}
          </p>
        )}
        {saved && <p className="text-sm text-green-700">Profile updated.</p>}

        <button
          type="submit"
          disabled={saving}
          className="justify-self-start rounded-md bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}
