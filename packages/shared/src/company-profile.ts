// External DTO — always JSON-safe (ISO string timestamps, never `Date`),
// same convention as UserProfile. Mapped once at the Service boundary
// (packages/services/src/company-profile).
//
// Rows are created lazily on first save. A Founder with no company_profiles
// row yet reads back an empty profile rather than a 404.
export type CompanyProfileStatus = "active" | "archived";

export interface CompanyProfile {
  id: string | null;
  workspaceId: string;
  ventureId: string | null;
  name: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  oneLiner: string | null;
  description: string | null;
  hqCountry: string | null;
  hqState: string | null;
  hqCity: string | null;
  hqStreet: string | null;
  hqPostalCode: string | null;
  hqAddressFull: string | null;
  foundedYear: number | null;
  status: CompanyProfileStatus | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdateCompanyProfileInput {
  name?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  oneLiner?: string | null;
  description?: string | null;
  hqCountry?: string | null;
  hqState?: string | null;
  hqCity?: string | null;
  hqStreet?: string | null;
  hqPostalCode?: string | null;
  foundedYear?: number | null;
}
