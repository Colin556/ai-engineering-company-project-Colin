"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ApiError, register } from "@/lib/api";

type Field = "email" | "password" | "name" | "phone" | "address";

const FIELDS: { name: Field; label: string; type: string; autoComplete: string }[] = [
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
  { name: "name", label: "Full name (optional)", type: "text", autoComplete: "name" },
  { name: "phone", label: "Phone (optional)", type: "tel", autoComplete: "tel" },
  { name: "address", label: "Address (optional)", type: "text", autoComplete: "street-address" },
];

const EMPTY_FORM: Record<Field, string> = {
  email: "",
  password: "",
  name: "",
  phone: "",
  address: "",
};

function validate(form: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (form.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else if (new TextEncoder().encode(form.password).length > 72) {
    errors.password = "Password must be at most 72 bytes.";
  }
  return errors;
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = validate(form);
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
        setFormError(err instanceof Error ? err.message : "Could not create the account.");
      }
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Create account</h1>
      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
        {FIELDS.map((field) => (
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
              className={`rounded border px-3 py-2 ${
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
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        Already registered?{" "}
        <Link href="/login" className="font-medium underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
