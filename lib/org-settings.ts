/**
 * Org-wide admin settings, verification stats, removal requests, and exports.
 */

import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export type EvaluationModel = "A" | "B" | "both";

export type OrgSettings = {
  orgId: string;
  ai_coaching_enabled: boolean;
  promotion_engine_enabled: boolean;
  require_proof: boolean;
  evaluation_model: EvaluationModel;
  logo_url: string | null;
};

export type VerificationStatBucket = {
  month: string;
  level: number;
  kind: string;
  count: number;
};

export type RemovalRequestRow = {
  id: string;
  org_id: string;
  subject_profile_id: string;
  requested_by: string;
  reason: string | null;
  status: string;
  created_at: string;
  subject_name?: string;
  requester_name?: string;
};

const ORG_SELECT =
  "id, ai_coaching_enabled, promotion_engine_enabled, require_proof, evaluation_model, logo_url";

export async function fetchOrgSettingsForUser(userId: string): Promise<OrgSettings | null> {
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", userId).single();
  if (!profile?.org_id) return null;

  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("id", profile.org_id)
    .single();

  if (error || !data) return null;

  return {
    orgId: data.id,
    ai_coaching_enabled: data.ai_coaching_enabled ?? true,
    promotion_engine_enabled: data.promotion_engine_enabled ?? true,
    require_proof: data.require_proof ?? true,
    evaluation_model: (data.evaluation_model ?? "A") as EvaluationModel,
    logo_url: data.logo_url ?? null,
  };
}

export async function updateOrgSettings(
  actorId: string,
  orgId: string,
  patch: Partial<Omit<OrgSettings, "orgId">>,
): Promise<void> {
  const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
  if (error) throw error;

  const actionMap: Record<string, string> = {
    ai_coaching_enabled: "org_ai_coaching_toggled",
    promotion_engine_enabled: "org_promotion_engine_toggled",
    require_proof: "org_require_proof_toggled",
    evaluation_model: "org_evaluation_model_changed",
    logo_url: "org_logo_updated",
  };

  for (const [key, value] of Object.entries(patch)) {
    await writeAuditLog({
      actorId,
      action: actionMap[key] ?? "org_settings_updated",
      targetTable: "organizations",
      targetId: orgId,
      changes: { [key]: value },
    });
  }
}

export async function fetchVerificationStats(orgId: string): Promise<VerificationStatBucket[]> {
  const { data: orgProfiles } = await supabase.from("profiles").select("id").eq("org_id", orgId);
  const profileIds = (orgProfiles ?? []).map((p) => p.id);
  if (!profileIds.length) return [];

  const [achRes, factsRes] = await Promise.all([
    supabase
      .from("achievements")
      .select("kind, verification_level, created_at")
      .eq("org_id", orgId)
      .eq("pending_executive", false),
    supabase
      .from("verified_facts")
      .select("kind, verification_level, created_at")
      .in("profile_id", profileIds),
  ]);

  const buckets = new Map<string, VerificationStatBucket>();

  function add(source: string, kind: string, level: number, createdAt: string) {
    const month = createdAt.slice(0, 7);
    const key = `${month}|${level}|${kind}|${source}`;
    const existing = buckets.get(key);
    if (existing) existing.count += 1;
    else buckets.set(key, { month, level, kind: `${source}:${kind}`, count: 1 });
  }

  for (const row of achRes.data ?? []) {
    if ((row.verification_level ?? 1) >= 2) {
      add("achievement", row.kind ?? "achievement", row.verification_level, row.created_at);
    }
  }
  for (const row of factsRes.data ?? []) {
    if ((row.verification_level ?? 1) >= 2) {
      add("fact", row.kind ?? "fact", row.verification_level, row.created_at);
    }
  }

  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month) || b.level - a.level);
}

export async function connectWorkdayIntegration(orgId: string, actorId: string): Promise<void> {
  const { data: existing } = await supabase
    .from("tenant_integrations")
    .select("id")
    .eq("org_id", orgId)
    .eq("source", "workday")
    .maybeSingle();

  if (existing) {
    await supabase
      .from("tenant_integrations")
      .update({ status: "connected", last_sync_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("tenant_integrations").insert({
      org_id: orgId,
      source: "workday",
      status: "connected",
      records_imported: 0,
    });
  }

  await writeAuditLog({
    actorId,
    action: "workday_connected",
    targetTable: "tenant_integrations",
    targetId: orgId,
    changes: { source: "workday", status: "connected" },
  });
}

export async function createRemovalRequest(input: {
  orgId: string;
  subjectProfileId: string;
  requestedBy: string;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.from("removal_requests").insert({
    org_id: input.orgId,
    subject_profile_id: input.subjectProfileId,
    requested_by: input.requestedBy,
    reason: input.reason ?? null,
    status: "pending",
  });
  if (error) throw error;

  await writeAuditLog({
    actorId: input.requestedBy,
    action: "removal_requested",
    targetTable: "removal_requests",
    targetId: input.subjectProfileId,
    changes: { reason: input.reason ?? null },
  });
}

export async function fetchRemovalRequests(orgId: string): Promise<RemovalRequestRow[]> {
  const { data, error } = await supabase
    .from("removal_requests")
    .select("id, org_id, subject_profile_id, requested_by, reason, status, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as RemovalRequestRow[];
  if (!rows.length) return rows;

  const ids = [...new Set(rows.flatMap((r) => [r.subject_profile_id, r.requested_by]))];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, title").in("id", ids);
  const names = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.title?.trim() || p.id.slice(0, 8)]),
  );

  return rows.map((r) => ({
    ...r,
    subject_name: names[r.subject_profile_id],
    requester_name: names[r.requested_by],
  }));
}

export async function resolveRemovalRequest(
  requestId: string,
  actorId: string,
  action: "approved" | "rejected",
): Promise<void> {
  const { data: req, error: fetchErr } = await supabase
    .from("removal_requests")
    .select("id, subject_profile_id, org_id")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) throw fetchErr ?? new Error("Request not found");

  const { error: updateErr } = await supabase
    .from("removal_requests")
    .update({ status: action })
    .eq("id", requestId);

  if (updateErr) throw updateErr;

  if (action === "approved") {
    const { error: delErr } = await supabase.from("profiles").delete().eq("id", req.subject_profile_id);
    if (delErr) throw delErr;
  }

  await writeAuditLog({
    actorId,
    action: action === "approved" ? "removal_approved" : "removal_rejected",
    targetTable: "removal_requests",
    targetId: requestId,
    changes: { subject_profile_id: req.subject_profile_id },
  });
}

export async function deleteOwnAccount(userId: string): Promise<void> {
  await writeAuditLog({
    actorId: userId,
    action: "account_self_deleted",
    targetTable: "profiles",
    targetId: userId,
    changes: { permanent: true },
  });

  const { error } = await supabase.from("profiles").delete().eq("id", userId);
  if (error) throw error;

  await supabase.auth.signOut();
}

function csvEscape(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function buildAdminRecordCsv(orgId: string): Promise<string> {
  const [{ data: people }, stats] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, title, role, account_status, hire_date, created_at")
      .eq("org_id", orgId)
      .order("full_name"),
    fetchVerificationStats(orgId),
  ]);

  const rosterHeader = "section,name,title,role,account_status,hire_date,joined";
  const rosterRows = (people ?? []).map((p) =>
    [
      "roster",
      csvEscape(p.full_name),
      csvEscape(p.title),
      csvEscape(p.role),
      csvEscape(p.account_status),
      csvEscape(p.hire_date),
      csvEscape(p.created_at?.slice(0, 10)),
    ].join(","),
  );

  const statsHeader = "section,month,verification_level,kind,count";
  const statsRows = stats.map((s) =>
    ["verification_stats", s.month, s.level, csvEscape(s.kind), s.count].join(","),
  );

  return [rosterHeader, ...rosterRows, "", statsHeader, ...statsRows].join("\n");
}

export function buildExecutiveMetricsCsv(metrics: {
  orgHeadcount: number;
  workforceHealth: number;
  productivity: number;
  morale: number;
  retentionRisk: string;
  skillsGrowth: number;
  innovation: number;
  pendingRaises: number;
  pendingBonuses: number;
  underpaidAlerts: number;
  equityScore: number;
  promoReadyNow: number;
  promo6mo: number;
  promo12mo: number;
  successionGaps: number;
}): string {
  const header = "metric,value";
  const rows = [
    ["org_headcount", metrics.orgHeadcount],
    ["workforce_health_score", metrics.workforceHealth],
    ["productivity_index", metrics.productivity.toFixed(2)],
    ["morale_index", metrics.morale.toFixed(2)],
    ["retention_risk", metrics.retentionRisk],
    ["skills_growth_index", metrics.skillsGrowth.toFixed(2)],
    ["innovation_index", metrics.innovation.toFixed(2)],
    ["pending_raises", metrics.pendingRaises],
    ["pending_bonuses", metrics.pendingBonuses],
    ["underpaid_alerts", metrics.underpaidAlerts],
    ["equity_score", metrics.equityScore.toFixed(2)],
    ["promo_ready_now", metrics.promoReadyNow],
    ["promo_6mo", metrics.promo6mo],
    ["promo_12mo", metrics.promo12mo],
    ["succession_gaps", metrics.successionGaps],
  ].map(([k, v]) => `${k},${v}`);

  return [header, ...rows].join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
