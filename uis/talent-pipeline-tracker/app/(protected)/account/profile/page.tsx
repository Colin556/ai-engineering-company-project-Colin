"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ApiError, getMe, updateMyProfile } from "@/lib/authApi";
import { useI18n } from "@/lib/i18n";
import { MeResponse } from "@/lib/types";

type Field = "name" | "phone" | "address";

export default function ProfilePage() {
  const { t } = useI18n();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [form, setForm] = useState<Record<Field, string>>({ name: "", phone: "", address: "" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const fields: { name: Field; label: string; type: string; autoComplete: string }[] = [
    { name: "name", label: t.fullName, type: "text", autoComplete: "name" },
    { name: "phone", label: t.phone, type: "tel", autoComplete: "tel" },
    { name: "address", label: t.address, type: "text", autoComplete: "street-address" },
  ];

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
        if (active) setLoadError(err instanceof Error ? err.message : "");
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
        setFormError(err instanceof Error ? err.message : t.unknownError);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <section className="max-w-xl space-y-5">
        <h2 className="font-serif text-2xl font-semibold text-amber-950">{t.myProfile}</h2>

        {loadError !== null ? (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
            {loadError || t.unknownError}
          </p>
        ) : !me ? (
          <p className="text-stone-600">{t.loading}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-stone-500">{t.email}</dt>
              <dd className="font-medium">{me.email}</dd>
              <dt className="text-stone-500">{t.role}</dt>
              <dd className="capitalize">{me.role}</dd>
            </dl>

            <form
              onSubmit={handleSubmit}
              className="grid gap-4 rounded-3xl border border-amber-900/15 bg-white/90 p-6"
            >
              {fields.map((field) => (
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
                    className={`rounded-xl border bg-white px-3 py-2 ${
                      fieldErrors[field.name] ? "border-red-500" : "border-stone-300"
                    }`}
                  />
                  {fieldErrors[field.name] && (
                    <span className="text-xs font-normal text-red-700">
                      {fieldErrors[field.name]}
                    </span>
                  )}
                </label>
              ))}

              {formError && (
                <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {formError}
                </p>
              )}
              {saved && <p className="text-sm text-green-700">{t.profileUpdated}</p>}

              <button
                type="submit"
                disabled={saving}
                className="justify-self-start rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
              >
                {saving ? t.saving : t.saveChanges}
              </button>
            </form>
          </>
        )}
      </section>
    </AppShell>
  );
}
