import { CandidateStage, CandidateStatus, Locale } from "@/lib/types";

export const DEFAULT_API_BASE_URL = "https://playground.4geeks.com/tracker/api/v1";

export const STATUS_ORDER: CandidateStatus[] = [
  "received",
  "in_progress",
  "selected",
  "discarded",
];

export const STAGE_ORDER: CandidateStage[] = [
  "pending",
  "review",
  "personal_interview",
  "technical_interview",
  "offer_presented",
];

export const STATUS_LABELS: Record<Locale, Record<CandidateStatus, string>> = {
  en: {
    received: "Received",
    in_progress: "In progress",
    selected: "Selected",
    discarded: "Discarded",
  },
  es: {
    received: "Recibido",
    in_progress: "En progreso",
    selected: "Seleccionado",
    discarded: "Descartado",
  },
};

export const STAGE_LABELS: Record<Locale, Record<CandidateStage, string>> = {
  en: {
    pending: "Pending review",
    review: "Under review",
    personal_interview: "Personal interview",
    technical_interview: "Technical interview",
    offer_presented: "Offer presented",
  },
  es: {
    pending: "Pendiente de revision",
    review: "En revision",
    personal_interview: "Entrevista personal",
    technical_interview: "Entrevista tecnica",
    offer_presented: "Oferta presentada",
  },
};
