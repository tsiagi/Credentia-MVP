/**
 * Superadmin platform metrics — types + client fetcher.
 *
 * Cross-tenant aggregation (per-company user counts, AI-insight usage,
 * subscription state) is read server-side with the service-role client behind
 * a superadmin auth guard — the one sanctioned cross-org exception to RLS.
 * Mirrors the Bearer-token fetcher pattern in lib/billing.ts.
 */

export type CompanyMetricRow = {
  orgId: string;
  name: string;
  plan: string | null;
  status: string;
  billingStatus: string;
  seats: number | null;
  monthlyPrice: number | null;
  userCount: number;
  activeUserCount: number;
  /** AI inferences produced for this org (model output count — not facts). */
  aiInsightCount: number;
};

export type PlatformMetrics = {
  totals: {
    companies: number;
    activeCompanies: number;
    users: number;
    activeUsers: number;
    aiInsights: number;
    mrr: number;
  };
  companies: CompanyMetricRow[];
};

export async function fetchPlatformMetrics(accessToken: string): Promise<PlatformMetrics> {
  const res = await fetch("/api/superadmin/metrics", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error ?? "Could not load platform metrics");
  }
  return res.json();
}
