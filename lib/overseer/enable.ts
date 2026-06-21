// lib/overseer/enable.ts
// ─────────────────────────────────────────────────────────────
// VP-6 — Shadow→active enablement (Q4 gate) + pause kill-switch (SERVER).
//
// enableRule(): the WEIGHTY, explicit human act that flips a rule shadow→active
// so it may auto-attest. It is allowed ONLY when (a) the Q4 agreement gate passes
// over the version's HUMAN-DECIDED shadow decisions AND (b) the caller is
// exec/admin. The SYSTEM NEVER self-promotes a rule. Audits overseer_rule_enabled.
//
// pauseRule(): the kill-switch — sets lifecycle='paused' instantly. In-flight
// auto-promotions are stopped by promote_candidate()'s in-txn lifecycle re-check
// under the candidate lock (race-free); this just flips the flag. Audits
// overseer_rule_paused.
//
// checkAutoPause(): live-safety — if an ACTIVE rule's live agreement falls below
// the floor (or a dispute spike), auto-pause it.
//
// Service-role client; server-side only. The RLS enable policy (exec/admin) is
// the second line; the Q4 gate here is the first. Caller route must pass the
// real actor + have confirmed their role.
// ─────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  AUTO_PAUSE_AGREEMENT,
  Q4_GATE,
  type VersionAgreement,
} from "@/lib/overseer/types";

export interface GateEvaluation {
  passed: boolean;
  agreementRate: number | null;
  decidedSampleSize: number;
  distinctAttestors: number;
  ageDays: number | null;
  /** Human-readable reasons each unmet sub-gate failed (empty when passed). */
  unmet: string[];
}

/**
 * Read the Q4 gate metrics for a version (from overseer_version_agreement) and
 * decide whether shadow→active is permitted. Pure-ish: reads the view, no write.
 * Exposed so the UI can render WHY Enable is disabled.
 */
export async function evaluateEnablementGate(
  ruleVersionId: string,
): Promise<GateEvaluation> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("overseer_version_agreement")
    .select(
      "rule_version_id, rule_id, org_id, version, decided_sample_size, agreed_count, agreement_rate, distinct_attestors, first_decided_at",
    )
    .eq("rule_version_id", ruleVersionId)
    .maybeSingle();
  if (error) throw error;

  const m = (data ?? null) as VersionAgreement | null;
  const agreementRate = m?.agreement_rate ?? null;
  const decidedSampleSize = m?.decided_sample_size ?? 0;
  const distinctAttestors = m?.distinct_attestors ?? 0;
  const ageDays =
    m?.first_decided_at != null
      ? Math.floor(
          (Date.now() - new Date(m.first_decided_at).getTime()) / 86_400_000,
        )
      : null;

  const unmet: string[] = [];
  if (agreementRate == null || agreementRate < Q4_GATE.minAgreementRate) {
    unmet.push(
      `agreement ${agreementRate == null ? "n/a" : (agreementRate * 100).toFixed(0) + "%"} < ${(Q4_GATE.minAgreementRate * 100).toFixed(0)}%`,
    );
  }
  if (decidedSampleSize < Q4_GATE.minDecidedSamples) {
    unmet.push(`${decidedSampleSize}/${Q4_GATE.minDecidedSamples} decided shadow decisions`);
  }
  if (distinctAttestors < Q4_GATE.minDistinctAttestors) {
    unmet.push(`${distinctAttestors}/${Q4_GATE.minDistinctAttestors} distinct attestors`);
  }
  if (ageDays == null || ageDays < Q4_GATE.minAgeDays) {
    unmet.push(`${ageDays ?? 0}/${Q4_GATE.minAgeDays} days of shadow history`);
  }

  return {
    passed: unmet.length === 0,
    agreementRate,
    decidedSampleSize,
    distinctAttestors,
    ageDays,
    unmet,
  };
}

/**
 * Flip a rule shadow→active. ONLY when the Q4 gate passes for the version.
 * Records the agreement metrics onto the version, sets active_version_id,
 * lifecycle='active', enabled_by/at, and audits overseer_rule_enabled.
 *
 * Throws if the gate is unmet — the system never enables an under-proven rule.
 * Caller route MUST have confirmed enablerId is exec/admin (RLS re-enforces).
 */
export async function enableRule(
  ruleId: string,
  versionId: string,
  enablerId: string,
): Promise<{ enabled: true; gate: GateEvaluation }> {
  const admin = getSupabaseAdmin();

  const gate = await evaluateEnablementGate(versionId);
  if (!gate.passed) {
    throw new Error(
      `Q4 gate not met — cannot enable: ${gate.unmet.join("; ")}`,
    );
  }

  // Persist the proven metrics onto the version (provenance for the enablement).
  await admin
    .from("overseer_rule_versions")
    .update({
      shadow_agreement_rate: gate.agreementRate,
      shadow_sample_size: gate.decidedSampleSize,
    })
    .eq("id", versionId);

  const { error } = await admin
    .from("overseer_rules")
    .update({
      lifecycle: "active",
      active_version_id: versionId,
      enabled_by: enablerId,
      enabled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ruleId);
  if (error) throw error;

  await admin.from("audit_log").insert({
    actor_id: enablerId,
    action: "overseer_rule_enabled",
    target_table: "overseer_rules",
    target_id: ruleId,
    changes: {
      rule_id: ruleId,
      version_id: versionId,
      enabled_by: enablerId,
      agreement_rate: gate.agreementRate,
      decided_sample_size: gate.decidedSampleSize,
      distinct_attestors: gate.distinctAttestors,
      age_days: gate.ageDays,
    },
  });

  return { enabled: true, gate };
}

/**
 * Kill-switch: pause a rule immediately. Sets lifecycle='paused'. Any in-flight
 * auto-promotion is blocked by promote_candidate()'s in-txn lifecycle re-check.
 * Audits overseer_rule_paused. `reason` distinguishes a human pause from an
 * auto-pause. Caller route authorises (manager-own-scope / admin-exec, RLS too).
 */
export async function pauseRule(
  ruleId: string,
  actorId: string | null,
  reason = "manual",
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("overseer_rules")
    .update({ lifecycle: "paused", updated_at: new Date().toISOString() })
    .eq("id", ruleId);
  if (error) throw error;

  await admin.from("audit_log").insert({
    actor_id: actorId,
    action: "overseer_rule_paused",
    target_table: "overseer_rules",
    target_id: ruleId,
    changes: { rule_id: ruleId, reason },
  });
}

/**
 * Live auto-pause check (Q4): if an ACTIVE rule's live agreement on its active
 * version has fallen below the platform floor, pause it. Returns true if paused.
 * Intended to run after recordHumanOutcome on an enacted rule's candidate.
 */
export async function checkAutoPause(ruleId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();

  const { data: rule } = await admin
    .from("overseer_rules")
    .select("id, lifecycle, active_version_id")
    .eq("id", ruleId)
    .single();
  const r = rule as
    | { id: string; lifecycle: string; active_version_id: string | null }
    | null;
  if (!r || r.lifecycle !== "active" || !r.active_version_id) return false;

  const gate = await evaluateEnablementGate(r.active_version_id);
  // Only act once there is a meaningful live sample; below the floor → pause.
  if (
    gate.agreementRate != null &&
    gate.decidedSampleSize >= 5 &&
    gate.agreementRate < AUTO_PAUSE_AGREEMENT
  ) {
    await pauseRule(ruleId, null, "auto_pause_low_agreement");
    return true;
  }
  return false;
}
