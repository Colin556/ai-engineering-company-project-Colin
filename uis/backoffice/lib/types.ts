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

export const SUPPLIER_COUNTRIES = ["CO", "US"] as const;
export const SUPPLIER_CATEGORIES = [
  "meat",
  "produce",
  "sauce",
  "beverage",
  "packaging",
  "cleaning",
] as const;

export type SupplierCountry = (typeof SUPPLIER_COUNTRIES)[number];
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];
export type SupplierStatus = "active" | "suspended";

export interface SupplierInput {
  name: string;
  country: SupplierCountry;
  product_categories: SupplierCategory[];
  rate_per_unit: number;
  status: SupplierStatus;
}

export interface Supplier extends SupplierInput {
  id: number;
  updated_at: string;
}
