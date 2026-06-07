/**
 * Org billing types and client helpers.
 * Writes go through /api/billing/org (service role) — never store card data.
 */

export type BillingStatus = "trial" | "active" | "past_due" | "canceled";

export type BillingEventType =
  | "trial_started"
  | "trial_extended"
  | "trial_ended"
  | "plan_set"
  | "charge_mocked"
  | "canceled";

export type OrgBillingRow = {
  id: string;
  name: string;
  billing_status: BillingStatus;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  monthly_price: number | null;
  seats: number | null;
  billing_notes: string | null;
};

export type BillingEventRow = {
  id: string;
  org_id: string;
  type: BillingEventType;
  amount: number | null;
  created_by: string | null;
  created_at: string;
  detail: Record<string, unknown>;
};

export type BillingOverview = {
  totalCompanies: number;
  onTrial: number;
  active: number;
  mockedMrr: number;
};

export type BillingAction =
  | { action: "set_plan"; orgId: string; monthlyPrice: number; seats: number; billingStatus: BillingStatus; notes?: string }
  | { action: "start_trial"; orgId: string; trialDays: number }
  | { action: "extend_trial"; orgId: string; extraDays: number }
  | { action: "end_trial"; orgId: string }
  | { action: "record_charge_mocked"; orgId: string; amount: number; detail?: Record<string, unknown> };

export async function fetchBillingOrgs(accessToken: string): Promise<OrgBillingRow[]> {
  const res = await fetch("/api/billing/org", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not load billing data");
  const data = await res.json();
  return data.orgs ?? [];
}

export async function postBillingAction(accessToken: string, payload: BillingAction) {
  const res = await fetch("/api/billing/org", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Billing action failed");
  return res.json();
}

export function computeBillingOverview(orgs: OrgBillingRow[]): BillingOverview {
  const active = orgs.filter((o) => o.billing_status === "active").length;
  const onTrial = orgs.filter((o) => o.billing_status === "trial").length;
  const mockedMrr = orgs
    .filter((o) => o.billing_status === "active")
    .reduce((sum, o) => sum + (o.monthly_price ?? 0), 0);
  return { totalCompanies: orgs.length, onTrial, active, mockedMrr };
}
