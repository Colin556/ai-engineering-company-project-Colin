import { Locale } from "@/lib/types";

export function formatDate(isoDate: string, locale: Locale): string {
  try {
    const date = new Date(isoDate);
    const region = locale === "es" ? "es-CO" : "en-US";
    return new Intl.DateTimeFormat(region, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return isoDate;
  }
}
