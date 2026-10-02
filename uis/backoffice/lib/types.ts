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

export const INCIDENT_CATEGORIES = [
  "billing",
  "technical",
  "shipping",
  "product",
  "other",
] as const;
export const INCIDENT_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "discarded",
] as const;
export const INCIDENT_ORIGINS = ["customer", "branch", "internal"] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export type IncidentOrigin = (typeof INCIDENT_ORIGINS)[number];

export interface IncidentInput {
  title: string;
  description: string;
  category: IncidentCategory;
  status: IncidentStatus;
  origin: IncidentOrigin;
  branch: string;
}

export interface Incident extends IncidentInput {
  id: number;
  created_at: string;
  updated_at: string;
}

export interface IncidentOptions {
  categories: IncidentCategory[];
  statuses: IncidentStatus[];
  origins: IncidentOrigin[];
  branches: { value: string; label: string }[];
}

export interface IncidentSummary {
  total: number;
  by_status: Record<IncidentStatus, number>;
  by_category: Record<IncidentCategory, number>;
  by_origin: Record<IncidentOrigin, number>;
  by_branch: Record<string, number>;
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

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ProfileInput {
  name: string | null;
  phone: string | null;
  address: string | null;
}

export interface RegisterInput extends Partial<ProfileInput> {
  email: string;
  password: string;
}

export interface Profile extends ProfileInput {
  id: string;
  user_id: string;
}

export interface MeResponse {
  id: string;
  email: string;
  role: "admin" | "manager" | "user";
  is_active: boolean;
  profile: Profile | null;
}

export interface Supplier extends SupplierInput {
  id: number;
  updated_at: string;
}
