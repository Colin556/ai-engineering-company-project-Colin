"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { requestPasswordReset } from "@/lib/api";

const INPUT = "rounded border border-stone-300 px-3 py-2 disabled:bg-stone-100";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || submitted) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">Forgot your password?</h1>
      <p className="mb-6 text-sm text-stone-600">
        Enter your account email and we&apos;ll send you a link to reset your password.
      </p>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <fieldset disabled={submitting || submitted} className="grid gap-4">
          <label className="grid gap-1 text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={INPUT}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          {submitted && (
            <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              If that address is registered, you&apos;ll receive a link shortly.
            </p>
          )}

          <button
            type="submit"
            className="rounded-md bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-60"
          >
            {submitting ? "Sending..." : submitted ? "Link requested" : "Send reset link"}
          </button>
        </fieldset>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        <Link href="/login" className="font-medium underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
