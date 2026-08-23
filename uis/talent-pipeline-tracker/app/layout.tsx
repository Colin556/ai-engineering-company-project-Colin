import type { Metadata } from "next";
import { Bitter, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/providers";

const uiSans = Manrope({
  variable: "--font-ui-sans",
  subsets: ["latin"],
});

const uiSerif = Bitter({
  variable: "--font-ui-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brasaland Talent Desk",
  description: "Internal recruiting operations tracker for Brasaland Digital.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${uiSans.variable} ${uiSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
