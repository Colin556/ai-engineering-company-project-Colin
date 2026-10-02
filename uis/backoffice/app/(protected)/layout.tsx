import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";

const NAV_LINK = "text-sm text-stone-600 hover:text-stone-900";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGuard>
      <header className="border-b border-stone-300 bg-white">
        <nav className="max-w-5xl mx-auto flex items-center gap-6 px-4 py-3">
          <span className="font-semibold">Brasaland Backoffice</span>
          <Link href="/" className={NAV_LINK}>
            Home
          </Link>
          <Link href="/incidents" className={NAV_LINK}>
            Incidents
          </Link>
          <Link href="/incidents/new" className={NAV_LINK}>
            Log incident
          </Link>
          <Link href="/suppliers" className={NAV_LINK}>
            Suppliers
          </Link>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/account/profile" className={NAV_LINK}>
              My profile
            </Link>
            <LogoutButton />
          </div>
        </nav>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {children}
      </main>
    </AuthGuard>
  );
}
