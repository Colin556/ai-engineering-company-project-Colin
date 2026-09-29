"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fff3d5,_#f4eadf_55%,_#f1eee9)] px-4 py-12 text-stone-900">
      <div className="w-full max-w-md rounded-3xl border border-amber-900/15 bg-white/90 p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="font-serif text-lg font-semibold text-amber-950">{t.appName}</p>
          <LanguageSwitcher />
        </div>
        {children}
      </div>
    </div>
  );
}
