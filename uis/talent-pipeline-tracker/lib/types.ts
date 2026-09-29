export type Locale = "es" | "en";

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface AccountProfileInput {
  name: string | null;
  phone: string | null;
  address: string | null;
}

export interface RegisterInput extends Partial<AccountProfileInput> {
  email: string;
  password: string;
}

export interface AccountProfile extends AccountProfileInput {
  id: string;
  user_id: string;
}

export interface MeResponse {
  id: string;
  email: string;
  role: "admin" | "manager" | "user";
  is_active: boolean;
  profile: AccountProfile | null;
}

export type CandidateStatus =
  | "received"
  | "in_progress"
  | "selected"
  | "discarded";

export type CandidateStage =
  | "pending"
  | "review"
  | "personal_interview"
  | "technical_interview"
  | "offer_presented";

export interface CandidateNote {
  id: string;
  record_id: string;
  content: string;
  created_at: string;
}

export interface CandidateRecord {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  linkedin_url: string | null;
  cv_url: string | null;
  status: CandidateStatus;
  stage: CandidateStage;
  experience_years: number;
  notes_count: number;
  applied_at: string;
  updated_at: string;
}

export interface CandidateListResponse {
  total: number;
  page: number;
  limit: number;
  data: CandidateRecord[];
}

export interface CandidateNotesResponse {
  data: CandidateNote[];
  meta: {
    total: number;
  };
}

export interface CandidateCreatePayload {
  full_name: string;
  email: string;
  phone: string;
  position: string;
  linkedin_url: string | null;
  cv_url: string | null;
  experience_years: number;
}

export interface CandidatePatchPayload {
  status?: CandidateStatus;
  stage?: CandidateStage;
}

export interface CandidateQuery {
  status?: CandidateStatus;
  stage?: CandidateStage;
  search?: string;
  page?: number;
  limit?: number;
}
