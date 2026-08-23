import { STAGE_LABELS, STATUS_LABELS } from "@/lib/constants";
import { CandidateStage, CandidateStatus, Locale } from "@/lib/types";

export function getStatusLabel(locale: Locale, status: CandidateStatus): string {
  return STATUS_LABELS[locale][status] || STATUS_LABELS.en[status] || "Unknown";
}

export function getStageLabel(locale: Locale, stage: CandidateStage): string {
  return STAGE_LABELS[locale][stage] || STAGE_LABELS.en[stage] || "Unknown";
}
