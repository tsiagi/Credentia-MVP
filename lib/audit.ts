import { supabase } from "@/lib/supabase";

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string;
  target_id: string | null;
  changes: Record<string, unknown>;
  created_at: string;
  actor_name?: string;
};

export async function writeAuditLog(input: {
  actorId: string;
  action: string;
  targetTable: string;
  targetId?: string | null;
  changes?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("audit_log").insert({
    actor_id: input.actorId,
    action: input.action,
    target_table: input.targetTable,
    target_id: input.targetId ?? null,
    changes: input.changes ?? {},
  });
  if (error) throw error;
}

export async function fetchAuditHistory(
  targetTable: string,
  targetId: string,
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_id, action, target_table, target_id, changes, created_at")
    .eq("target_table", targetTable)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as AuditLogRow[];
  if (!rows.length) return rows;

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  if (!actorIds.length) return rows;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, title")
    .in("id", actorIds);

  const names = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.title?.trim() || p.id.slice(0, 8)]),
  );

  return rows.map((r) => ({
    ...r,
    changes: (r.changes ?? {}) as Record<string, unknown>,
    actor_name: r.actor_id ? names[r.actor_id] ?? "System" : "System",
  }));
}

export function formatAuditAction(action: string): string {
  const labels: Record<string, string> = {
    verify_approve: "Manager approved",
    verify_reject: "Manager rejected",
    verify_clarify: "Clarification requested",
    achievement_created: "Submitted (self-reported)",
    profile_edit: "Profile updated",
    feedback_edit: "Feedback saved",
    passport_publish: "Passport published",
    passport_unpublish: "Passport unpublished",
    passport_slug_created: "Share link generated",
    verification_request: "Attestation requested",
    ai_insights_generated: "AI insights generated",
    org_invite_sent: "Email invite sent",
    org_invite_accepted: "Invite accepted",
    org_membership_proposed: "Org chart change proposed",
    org_membership_approved: "Org chart change approved",
    org_membership_rejected: "Org chart change rejected",
    personal_plan_subscribed: "Personal passport plan (mock)",
    employee_departed: "Employee departed — records frozen",
    trial_extended: "Trial extended",
    manager_assignment_proposed: "Manager change proposed",
    manager_assignment_approved: "Manager assignment approved",
    manager_assignment_rejected: "Manager assignment rejected",
    billing_settings_updated: "Billing settings updated",
    org_ai_coaching_toggled: "AI Coaching toggled",
    org_promotion_engine_toggled: "Promotion Readiness toggled",
    org_require_proof_toggled: "Proof requirement toggled",
    org_evaluation_model_changed: "Evaluation model changed",
    org_logo_updated: "Company logo updated",
    workday_connected: "Workday connected",
    removal_requested: "Profile removal requested",
    removal_approved: "Profile removal approved",
    removal_rejected: "Profile removal rejected",
    account_self_deleted: "Account self-deleted",
    achievement_manager_submitted: "Manager submitted achievement",
    achievement_executive_approved: "Executive approved achievement",
    achievement_executive_rejected: "Executive rejected achievement",
    billing_trial_started: "Company trial started",
    billing_trial_extended: "Company trial extended",
    billing_trial_ended: "Company trial ended",
    billing_plan_set: "Billing plan updated",
    billing_charge_mocked: "Mock charge recorded",
    billing_canceled: "Subscription canceled",
  };
  return labels[action] ?? action.replace(/_/g, " ");
}
