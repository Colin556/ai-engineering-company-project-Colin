"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ApiError, resetPassword } from "@/lib/api";
import { validateNewPassword } from "@/lib/password";

const INPUT = "rounded border border-stone-300 px-3 py-2";

function InvalidLinkMessage({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      <p>{message}</p>
      <p className="mt-2">
        <Link href="/forgot-password" className="font-medium underline">
          Request a new reset link
        </Link>
      </p>
    </div>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return <InvalidLinkMessage message="This reset link is missing its token." />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateNewPassword(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      router.replace("/login?reset=success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setTokenError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Could not reset your password.");
      }
      setSubmitting(false);
    }
  }

  if (tokenError) return <InvalidLinkMessage message={tokenError} />;

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label className="grid gap-1 text-sm font-medium">
        New password
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={INPUT}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className={INPUT}
        />
      </label>

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
        {submitting ? "Saving..." : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Choose a new password</h1>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading...</p>}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
