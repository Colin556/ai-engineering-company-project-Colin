import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Brasaland Backoffice",
  description: "Internal operations tools for Brasaland Digital.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-stone-300 bg-white">
          <nav className="max-w-5xl mx-auto flex items-center gap-6 px-4 py-3">
            <span className="font-semibold">Brasaland Backoffice</span>
            <Link href="/" className="text-sm text-stone-600 hover:text-stone-900">
              Home
            </Link>
            <Link
              href="/incidents"
              className="text-sm text-stone-600 hover:text-stone-900"
            >
              Incident Analysis
            </Link>
          </nav>
        </header>
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
