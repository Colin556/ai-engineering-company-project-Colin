export interface IncidentAnalysisResult {
  total_records: number;
  total_valid: number;
  total_invalid: number;
  invalid_reason_counts: Record<string, number>;
  category_breakdown: Record<string, number>;
  status_breakdown: Record<string, number>;
  closed_with_score_count: number;
  avg_satisfaction_closed: number | null;
}
