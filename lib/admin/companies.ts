/**
 * Superadmin company directory — types + client fetchers.
 *
 * Cross-tenant org reads/writes go through the superadmin-guarded service-role
 * API. Subscription tier/cost changes are NOT done here — they reuse the proven
 * /api/billing/org endpoint (lib/billing.ts), which owns the billing columns and
 * their audit trail. This module covers org profile, branding, status, and SSO.
 */

export type CompanyProfile = {
  id: string;
  name: string;
  plan: string | null;
  status: string;
  billing_status: string;
  seats: number | null;
  monthly_price: number | null;
  billing_notes: string | null;
  logo_url: string | null;
  brand_color: string | null;
  sso_provider: string | null;
  sso_domain: string | null;
  evaluation_model: string | null;
  require_proof: boolean | null;
  ai_coaching_enabled: boolean | null;
  promotion_engine_enabled: boolean | null;
  trial_ends_at: string | null;
  created_at: string | null;
  userCount: number;
};

/** Non-billing org fields a superadmin may edit through this API. */
export type CompanyPatch = Partial<
  Pick<CompanyProfile, "name" | "plan" | "status" | "logo_url" | "brand_color" | "sso_provider" | "sso_domain">
>;

export type CompanyPerson = {
  id: string;
  full_name: string | null;
  role: string;
  title: string | null;
  account_status: string;
};
export type CompanyIntegration = {
  source: string;
  status: string;
  records_imported: number | null;
  last_sync_at: string | null;
};
export type CompanyBillingEvent = {
  type: string;
  amount: number | null;
  created_at: string;
  detail: Record<string, unknown>;
};
export type CompanyDetail = {
  company: CompanyProfile;
  people: CompanyPerson[];
  integrations: CompanyIntegration[];
  billingEvents: CompanyBillingEvent[];
  aiUsageCount: number;
};

export type NewCompanyInput = { name: string; plan?: string; adminEmail?: string };

export async function fetchCompanies(accessToken: string): Promise<CompanyProfile[]> {
  const res = await fetch("/api/superadmin/companies", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not load companies");
  return (await res.json()).companies ?? [];
}

export async function fetchCompany(accessToken: string, orgId: string): Promise<CompanyDetail> {
  const res = await fetch(`/api/superadmin/companies?orgId=${encodeURIComponent(orgId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not load company");
  const data = await res.json();
  return {
    company: data.company,
    people: data.people ?? [],
    integrations: data.integrations ?? [],
    billingEvents: data.billingEvents ?? [],
    aiUsageCount: data.aiUsageCount ?? 0,
  };
}

export async function createCompany(accessToken: string, input: NewCompanyInput): Promise<{ orgId: string }> {
  const res = await fetch("/api/superadmin/companies", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not create company");
  return res.json();
}

export async function updateCompany(accessToken: string, orgId: string, patch: CompanyPatch): Promise<void> {
  const res = await fetch("/api/superadmin/companies", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, patch }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not update company");
}

/** Seat-based price suggestion — cost scales with employee count. */
export function suggestMonthlyPrice(seats: number, perSeat = 12): number {
  return Math.max(0, Math.round(seats * perSeat));
}
