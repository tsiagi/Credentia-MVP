/**
 * Company-admin dashboard metrics — single org, read with the RLS-scoped
 * browser client. The admin's own org_id is the boundary (RLS enforces it);
 * we never pass an org id from the client as the source of truth.
 *
 *   Activations  → profile account states (administrative fact, neutral)
 *   AI Usage     → count of AI artifacts for the org (inference, amber)
 *   Verifications→ verified record completions (fact, blue) via fetchVerificationStats
 */

import { supabase } from "@/lib/supabase";
import {
  fetchOrgSettingsForUser,
  fetchVerificationStats,
  type VerificationStatBucket,
} from "@/lib/org-settings";

export type CompanyMetrics = {
  orgId: string;
  totalUsers: number;
  activeUsers: number;
  invitedUsers: number;
  formerUsers: number;
  aiUsageCount: number;
  verifiedCount: number;
  verificationBuckets: VerificationStatBucket[];
};

/** Count rows for a table scoped to org; returns 0 if RLS/schema blocks it. */
async function countForOrg(table: string, orgId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchCompanyMetrics(userId: string): Promise<CompanyMetrics | null> {
  const org = await fetchOrgSettingsForUser(userId);
  if (!org) return null;
  const orgId = org.orgId;

  const [profilesRes, aiTasks, aiReports, buckets] = await Promise.all([
    supabase.from("profiles").select("account_status").eq("org_id", orgId),
    countForOrg("ai_inference_tasks", orgId),
    countForOrg("ai_inference_reports", orgId),
    fetchVerificationStats(orgId).catch(() => [] as VerificationStatBucket[]),
  ]);

  const profiles = profilesRes.data ?? [];
  const isActive = (s: string | null) => s === "active_sso" || s === "active";
  const isFormer = (s: string | null) => (s ?? "").startsWith("former_");

  return {
    orgId,
    totalUsers: profiles.length,
    activeUsers: profiles.filter((p) => isActive(p.account_status)).length,
    invitedUsers: profiles.filter((p) => p.account_status === "invited").length,
    formerUsers: profiles.filter((p) => isFormer(p.account_status)).length,
    aiUsageCount: aiTasks + aiReports,
    verifiedCount: buckets.reduce((s, b) => s + b.count, 0),
    verificationBuckets: buckets,
  };
}

/** Live org roster for the company directory (RLS scopes to the admin's org). */
export type OrgPerson = {
  id: string;
  full_name: string | null;
  title: string | null;
  role: string;
  account_status: string;
  department: string | null;
};

export async function fetchOrgRoster(orgId: string): Promise<OrgPerson[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, title, role, account_status")
    .eq("org_id", orgId)
    .order("full_name");
  if (error) return [];
  return (data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    title: p.title,
    role: p.role,
    account_status: p.account_status,
    department: null,
  }));
}
