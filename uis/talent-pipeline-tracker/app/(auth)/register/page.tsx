"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ApiError, register } from "@/lib/authApi";
import { useI18n } from "@/lib/i18n";

type Field = "email" | "password" | "name" | "phone" | "address";

const EMPTY_FORM: Record<Field, string> = {
  email: "",
  password: "",
  name: "",
  phone: "",
  address: "",
};

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fields: { name: Field; label: string; type: string; autoComplete: string }[] = [
    { name: "email", label: t.email, type: "email", autoComplete: "email" },
    { name: "password", label: t.password, type: "password", autoComplete: "new-password" },
    { name: "name", label: `${t.fullName} (${t.optional})`, type: "text", autoComplete: "name" },
    { name: "phone", label: `${t.phone} (${t.optional})`, type: "tel", autoComplete: "tel" },
    { name: "address", label: `${t.address} (${t.optional})`, type: "text", autoComplete: "street-address" },
  ];

  function validate(): Partial<Record<Field, string>> {
    const errors: Partial<Record<Field, string>> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = t.emailError;
    }
    if (form.password.length < 8) {
      errors.password = t.passwordError;
    } else if (new TextEncoder().encode(form.password).length > 72) {
      errors.password = t.passwordTooLong;
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      await register({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
      });
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setFieldErrors(err.fieldErrors);
      } else {
        setFormError(err instanceof Error ? err.message : t.unknownError);
      }
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 font-serif text-2xl font-semibold text-amber-950">{t.registerTitle}</h1>
      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
        {fields.map((field) => (
          <label key={field.name} className="grid gap-1 text-sm font-medium">
            {field.label}
            <input
              type={field.type}
              autoComplete={field.autoComplete}
              value={form[field.name]}
              onChange={(event) =>
                setForm((current) => ({ ...current, [field.name]: event.target.value }))
              }
              aria-invalid={Boolean(fieldErrors[field.name])}
              className={`rounded-xl border bg-white px-3 py-2 ${
                fieldErrors[field.name] ? "border-red-500" : "border-stone-300"
              }`}
            />
            {fieldErrors[field.name] && (
              <span className="text-xs font-normal text-red-700">{fieldErrors[field.name]}</span>
            )}
          </label>
        ))}

        {formError && (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-amber-700 px-4 py-2 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
        >
          {submitting ? t.creatingAccount : t.createAccount}
        </button>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        {t.haveAccount}{" "}
        <Link href="/login" className="font-medium text-amber-900 underline">
          {t.signIn}
        </Link>
      </p>
    </>
  );
}
