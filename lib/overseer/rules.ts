// lib/overseer/rules.ts
// ─────────────────────────────────────────────────────────────
// VP-6 — Overseer rule + version CRUD (SERVER, service-role writer).
//
// These functions WRITE overseer_rules / overseer_rule_versions. They run with
// the SERVICE-ROLE client (getSupabaseAdmin → SUPABASE_SERVICE_ROLE_KEY,
// server-side ONLY, never NEXT_PUBLIC_), mirroring lib/verification/ingest.ts.
// Authorisation for HUMAN-initiated proposals/approvals is enforced by the
// passed actor + the RLS write policies in verification-vp6-overseer.sql when a
// route runs them on a user client; here (service role) the caller route is
// responsible for having checked the actor's role. Each write audits.
//
// `logic` is STRUCTURED, INSPECTABLE JSON (RuleLogic) — never executed prose.
// `rationale` is advisory only. NO model call.
// ─────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  CandidateTargetKind,
} from "@/lib/verification/ingest";
import type {
  OverseerRuleRow,
  OverseerRuleVersionRow,
  RuleLogic,
} from "@/lib/overseer/types";

async function audit(
  actorId: string | null,
  action: string,
  targetId: string,
  changes: Record<string, unknown>,
) {
  const admin = getSupabaseAdmin();
  await admin.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_table: "overseer_rules",
    target_id: targetId,
    changes,
  });
}

export interface ProposeRuleInput {
  orgId: string;
  name: string;
  targetKind: CandidateTargetKind;
  scope?: "team" | "department" | "org";
  scopeSubject?: string | null;
  /** First version's structured predicate logic. */
  logic: RuleLogic;
  /** Advisory prose for the human reviewer (never executed). */
  rationale?: string | null;
  /** Actor proposing; null = Overseer/system. */
  proposedBy?: string | null;
}

/**
 * Propose a NEW rule. Creates the rule (lifecycle='draft') AND its version 1.
 * The rule is NOT active and CANNOT auto-promote until a human enables it via
 * enableRule() (which requires the Q4 gate). Audits `overseer_rule_proposed`.
 */
export async function proposeRule(
  input: ProposeRuleInput,
): Promise<{ rule: OverseerRuleRow; version: OverseerRuleVersionRow }> {
  const admin = getSupabaseAdmin();

  const { data: ruleRow, error: ruleErr } = await admin
    .from("overseer_rules")
    .insert({
      org_id: input.orgId,
      name: input.name,
      target_kind: input.targetKind,
      scope: input.scope ?? "team",
      scope_subject: input.scopeSubject ?? null,
      lifecycle: "draft",
    })
    .select("*")
    .single();
  if (ruleErr) throw ruleErr;
  const rule = ruleRow as OverseerRuleRow;

  const version = await insertVersion(admin, {
    ruleId: rule.id,
    orgId: input.orgId,
    version: 1,
    logic: input.logic,
    rationale: input.rationale ?? null,
    proposedBy: input.proposedBy ?? null,
  });

  await audit(input.proposedBy ?? null, "overseer_rule_proposed", rule.id, {
    rule_id: rule.id,
    version_id: version.id,
    target_kind: input.targetKind,
    scope: rule.scope,
  });

  return { rule, version };
}

export interface AddVersionInput {
  ruleId: string;
  orgId: string;
  logic: RuleLogic;
  rationale?: string | null;
  proposedBy?: string | null;
}

/**
 * Add a NEW immutable version to an existing rule (editing a rule = new
 * version). The active_version_id is NOT moved here — enabling is a separate,
 * human, Q4-gated act. Audits `overseer_rule_proposed`.
 */
export async function addRuleVersion(
  input: AddVersionInput,
): Promise<OverseerRuleVersionRow> {
  const admin = getSupabaseAdmin();

  // Next version number for this rule.
  const { data: maxRow } = await admin
    .from("overseer_rule_versions")
    .select("version")
    .eq("rule_id", input.ruleId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((maxRow?.version as number | undefined) ?? 0) + 1;

  const version = await insertVersion(admin, {
    ruleId: input.ruleId,
    orgId: input.orgId,
    version: nextVersion,
    logic: input.logic,
    rationale: input.rationale ?? null,
    proposedBy: input.proposedBy ?? null,
  });

  await audit(input.proposedBy ?? null, "overseer_rule_proposed", input.ruleId, {
    rule_id: input.ruleId,
    version_id: version.id,
    version: nextVersion,
    note: "new version",
  });

  return version;
}

async function insertVersion(
  admin: ReturnType<typeof getSupabaseAdmin>,
  args: {
    ruleId: string;
    orgId: string;
    version: number;
    logic: RuleLogic;
    rationale: string | null;
    proposedBy: string | null;
  },
): Promise<OverseerRuleVersionRow> {
  const { data, error } = await admin
    .from("overseer_rule_versions")
    .insert({
      rule_id: args.ruleId,
      org_id: args.orgId,
      version: args.version,
      logic: args.logic,
      rationale: args.rationale,
      shadow_sample_size: 0,
      proposed_by: args.proposedBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as OverseerRuleVersionRow;
}

/**
 * Approve a version (admin/exec, Q3). Stamps approved_by. Approval is a human
 * sign-off on the LOGIC; it does NOT enable auto-promotion (that is enableRule,
 * Q4-gated). Caller (route) must have verified the actor is admin/exec.
 */
export async function approveVersion(
  versionId: string,
  approverId: string,
): Promise<OverseerRuleVersionRow> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("overseer_rule_versions")
    .update({ approved_by: approverId })
    .eq("id", versionId)
    .select("*")
    .single();
  if (error) throw error;
  const version = data as OverseerRuleVersionRow;

  await audit(approverId, "overseer_rule_proposed", version.rule_id, {
    rule_id: version.rule_id,
    version_id: version.id,
    note: "version approved",
    approved_by: approverId,
  });
  return version;
}
