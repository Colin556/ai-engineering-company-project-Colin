"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { login } from "@/lib/authApi";
import { useI18n } from "@/lib/i18n";

const INPUT = "rounded-xl border border-stone-300 bg-white px-3 py-2";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.unknownError);
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 font-serif text-2xl font-semibold text-amber-950">{t.signInTitle}</h1>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium">
          {t.email}
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t.password}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-amber-700 px-4 py-2 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
        >
          {submitting ? t.signingIn : t.signIn}
        </button>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        {t.noAccount}{" "}
        <Link href="/register" className="font-medium text-amber-900 underline">
          {t.createAccountLink}
        </Link>
      </p>
    </>
  );
}
