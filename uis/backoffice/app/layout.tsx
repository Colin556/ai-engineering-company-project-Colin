import type { Metadata } from "next";
import "./globals.css";
import { TelemetryObserver } from "../components/TelemetryObserver";

export const metadata: Metadata = {
  title: "Brasaland Backoffice",
  description: "Internal operations tools for Brasaland Digital.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col"><TelemetryObserver />{children}</body>
    </html>
  );
}
