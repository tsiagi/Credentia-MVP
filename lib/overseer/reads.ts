// lib/overseer/reads.ts
// ─────────────────────────────────────────────────────────────
// VP-6 — Oversight read surface (BROWSER / RLS client).
//
// All reads here use the browser client (lib/supabase.ts) + RLS. VP-1's SELECT
// policies scope every overseer_* row to current_org() + manager+/leader. This
// file performs NO writes — enable/pause/CRUD go through server routes that call
// lib/overseer/{enable,rules,runShadow}.ts on the service role.
//
// Confidence/agreement: this is the OVERSIGHT/ADMIN surface, so a numeric
// agreement rate is permitted HERE (Q6's "never a numeric probability" applies
// to the EMPLOYEE trust UI, not the operator console). We still never imply the
// AI "decides" — a human enables.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import type {
  OverseerRuleRow,
  OverseerRuleVersionRow,
  ShadowDecisionRow,
  VersionAgreement,
} from "@/lib/overseer/types";

/** A rule plus its active version + that version's agreement metrics. */
export interface RuleWithMetrics {
  rule: OverseerRuleRow;
  activeVersion: OverseerRuleVersionRow | null;
  /** Metrics for the active version (or the latest version if none active). */
  agreement: VersionAgreement | null;
  latestVersionId: string | null;
}

/** List all overseer rules visible to the caller (RLS scopes to org + role). */
export async function listRules(): Promise<RuleWithMetrics[]> {
  const { data: rules, error } = await supabase
    .from("overseer_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const ruleRows = (rules ?? []) as OverseerRuleRow[];
  if (ruleRows.length === 0) return [];

  const ruleIds = ruleRows.map((r) => r.id);

  const { data: versions } = await supabase
    .from("overseer_rule_versions")
    .select("*")
    .in("rule_id", ruleIds)
    .order("version", { ascending: false });
  const versionRows = (versions ?? []) as OverseerRuleVersionRow[];

  const { data: metrics } = await supabase
    .from("overseer_version_agreement")
    .select(
      "rule_version_id, rule_id, org_id, version, decided_sample_size, agreed_count, agreement_rate, distinct_attestors, first_decided_at",
    )
    .in("rule_id", ruleIds);
  const metricRows = (metrics ?? []) as VersionAgreement[];

  const metricByVersion = new Map(metricRows.map((m) => [m.rule_version_id, m]));

  return ruleRows.map((rule) => {
    const ruleVersions = versionRows.filter((v) => v.rule_id === rule.id);
    const latest = ruleVersions[0] ?? null; // ordered desc
    const activeVersion =
      ruleVersions.find((v) => v.id === rule.active_version_id) ?? null;
    const targetVersionId = rule.active_version_id ?? latest?.id ?? null;
    return {
      rule,
      activeVersion,
      agreement: targetVersionId
        ? metricByVersion.get(targetVersionId) ?? null
        : null,
      latestVersionId: latest?.id ?? null,
    };
  });
}

/** Recent shadow decisions for a rule (proof-of-context expandable in the UI). */
export async function listShadowDecisions(
  ruleId: string,
  limit = 20,
): Promise<ShadowDecisionRow[]> {
  const { data, error } = await supabase
    .from("overseer_shadow_decisions")
    .select(
      "id, org_id, rule_id, rule_version_id, candidate_id, proposed_action, proof_of_context, human_action, agreed, was_enacted, created_at",
    )
    .eq("rule_id", ruleId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ShadowDecisionRow[];
}
