"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { login } from "@/lib/api";

const INPUT = "rounded border border-stone-300 px-3 py-2";

function ResetSuccessNotice() {
  if (useSearchParams().get("reset") !== "success") return null;
  return (
    <p role="status" className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
      Your password has been reset. Sign in with your new password.
    </p>
  );
}

export default function LoginPage() {
  const router = useRouter();
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
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <Suspense fallback={null}>
        <ResetSuccessNotice />
      </Suspense>
      <form onSubmit={handleSubmit} className="grid gap-4">
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
        <label className="grid gap-1 text-sm font-medium">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT}
          />
        </label>
        <Link href="/forgot-password" className="-mt-2 justify-self-end text-sm text-stone-600 underline">
          Forgot your password?
        </Link>

        {error && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        No account yet?{" "}
        <Link href="/register" className="font-medium underline">
          Create one
        </Link>
      </p>
    </>
  );
}
