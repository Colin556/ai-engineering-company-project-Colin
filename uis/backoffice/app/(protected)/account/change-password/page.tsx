"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { changePassword } from "@/lib/api";
import { validateNewPassword } from "@/lib/password";

const INPUT = "rounded border border-stone-300 px-3 py-2";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setError(null);

    const validationError = validateNewPassword(newPassword, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold">Change password</h1>
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border border-stone-300 bg-white p-6">
        <label className="grid gap-1 text-sm font-medium">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className={INPUT}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
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
        {saved && <p role="status" className="text-sm text-green-700">Password changed.</p>}

        <button
          type="submit"
          disabled={saving}
          className="justify-self-start rounded-md bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Change password"}
        </button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/account/profile" className="text-stone-600 underline hover:text-stone-900">
          Back to my profile
        </Link>
      </p>
    </div>
  );
}
