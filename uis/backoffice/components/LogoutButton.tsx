"use client";

import { logout } from "@/lib/auth";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={logout}
      className="rounded-md border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
    >
      Log out
    </button>
  );
}
