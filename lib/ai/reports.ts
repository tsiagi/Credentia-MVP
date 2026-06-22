// lib/ai/reports.ts
// ─────────────────────────────────────────────────────────────
// AI Data Parsing & Analytics Engine — leadership reports.
//
// Architecture: DETERMINISTIC metrics are computed here in code from the
// operational + verified tables (completion rates, mood, revenue impact,
// sentiment slopes). The LLM only does QUALITATIVE SYNTHESIS — clustering
// free-text blocker notes into bottleneck themes and writing the narrative.
//
// Retention flags are computed deterministically (a sustained sentiment drop
// is a fact, not a guess) and persisted by us — the model never fabricates a
// risk flag about a real person. Everything written is AI INFERENCE: internal,
// advisory, server-side only (service role), and clearly labelled.
//
// Mirrors lib/ai/anthropic.ts (prompt+fetch) and lib/ai/persist.ts (writes).
// ─────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type ReportScope = "team" | "department" | "org";
export type PeriodType = "weekly" | "monthly";
export type FlagSeverity = "watch" | "elevated" | "high";

export type PillarCompletion = { pillar: string; total: number; completed: number; completionRate: number };
export type MoodVsCompletion = { date: string; avgCheckin: number | null; completionRate: number | null; tasks: number };
export type BlockerNote = { pillar: string; note: string };

export type RetentionCandidate = {
  employeeId: string;
  entries: number;
  recentAvg: number;
  priorAvg: number;
  severity: FlagSeverity;
  signal: string;
};

export type ReportPayload = {
  orgId: string;
  scope: ReportScope;
  subjectId: string | null;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  headcount: number;
  pillarCompletion: PillarCompletion[];
  moodVsCompletion: MoodVsCompletion[];
  revenuePillarTasks: { total: number; completed: number };
  verifiedRevenueImpact: number;
  blockerNotes: BlockerNote[];
  retentionCandidates: RetentionCandidate[];
};

/** The synthesis the LLM is responsible for. */
export type LeadershipReport = {
  bottlenecks: { theme: string; frequency: number; examplePillars: string[]; summary: string }[];
  productivityVsMorale: { correlation: "positive" | "negative" | "none"; narrative: string };
  revenueImpact: { tasksOnRevenuePillar: number; verifiedRevenueImpact: number; narrative: string };
  retentionRisks: { count: number; narrative: string };
  confidence: number;
  disclaimer: string;
};

type TaskLite = { pillar_id: string; status: string; blocker_note: string | null; employee_id: string; task_date: string };
type PulseLite = { employee_id: string; pulse_date: string; checkin_mood: number | null; checkout_sentiment: number | null };

const REVENUE_PILLAR = /revenue/i;
const MAX_BLOCKER_NOTES = 60; // cap what we send to the model

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ════════════════ DETERMINISTIC METRICS (code, not the LLM) ════════════════
export async function loadReportPayload(opts: {
  orgId: string;
  employeeIds: string[];
  scope: ReportScope;
  subjectId: string | null;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
}): Promise<ReportPayload> {
  const admin = getSupabaseAdmin();
  const { orgId, employeeIds, periodStart, periodEnd } = opts;

  const base: ReportPayload = {
    orgId,
    scope: opts.scope,
    subjectId: opts.subjectId,
    periodType: opts.periodType,
    periodStart,
    periodEnd,
    headcount: employeeIds.length,
    pillarCompletion: [],
    moodVsCompletion: [],
    revenuePillarTasks: { total: 0, completed: 0 },
    verifiedRevenueImpact: 0,
    blockerNotes: [],
    retentionCandidates: [],
  };
  if (!employeeIds.length) return base;

  const [pillarsRes, tasksRes, pulseRes, projRes] = await Promise.all([
    admin.from("strategic_pillars").select("id, name").eq("org_id", orgId),
    admin.from("tasks").select("pillar_id, status, blocker_note, employee_id, task_date")
      .in("employee_id", employeeIds).gte("task_date", periodStart).lte("task_date", periodEnd),
    admin.from("daily_pulse").select("employee_id, pulse_date, checkin_mood, checkout_sentiment")
      .in("employee_id", employeeIds).gte("pulse_date", periodStart).lte("pulse_date", periodEnd),
    admin.from("projects").select("revenue_impact, verification_level, created_at, profile_id")
      .in("profile_id", employeeIds).gte("verification_level", 2).gte("created_at", periodStart),
  ]);

  const pillarName = new Map<string, string>((pillarsRes.data ?? []).map((p) => [p.id as string, p.name as string]));
  const revenuePillarIds = new Set(
    (pillarsRes.data ?? []).filter((p) => REVENUE_PILLAR.test(p.name as string)).map((p) => p.id as string),
  );
  const tasks = (tasksRes.data ?? []) as TaskLite[];
  const pulse = (pulseRes.data ?? []) as PulseLite[];

  // ── pillar completion ──
  const pillarAgg = new Map<string, { total: number; completed: number }>();
  for (const t of tasks) {
    const name = pillarName.get(t.pillar_id) ?? "Uncategorised";
    const a = pillarAgg.get(name) ?? { total: 0, completed: 0 };
    a.total += 1;
    if (t.status === "complete") a.completed += 1;
    pillarAgg.set(name, a);
  }
  base.pillarCompletion = [...pillarAgg.entries()].map(([pillar, a]) => ({
    pillar, total: a.total, completed: a.completed,
    completionRate: a.total ? round2(a.completed / a.total) : 0,
  }));

  // ── revenue pillar tasks ──
  const revTasks = tasks.filter((t) => revenuePillarIds.has(t.pillar_id));
  base.revenuePillarTasks = {
    total: revTasks.length,
    completed: revTasks.filter((t) => t.status === "complete").length,
  };
  base.verifiedRevenueImpact = (projRes.data ?? []).reduce(
    (s, p) => s + (Number(p.revenue_impact) || 0), 0,
  );

  // ── productivity vs morale, by day ──
  const byDate = new Map<string, { moods: number[]; total: number; completed: number }>();
  for (const p of pulse) {
    const d = byDate.get(p.pulse_date) ?? { moods: [], total: 0, completed: 0 };
    if (p.checkin_mood != null) d.moods.push(p.checkin_mood);
    byDate.set(p.pulse_date, d);
  }
  for (const t of tasks) {
    const d = byDate.get(t.task_date) ?? { moods: [], total: 0, completed: 0 };
    d.total += 1;
    if (t.status === "complete") d.completed += 1;
    byDate.set(t.task_date, d);
  }
  base.moodVsCompletion = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      avgCheckin: d.moods.length ? round2(d.moods.reduce((a, b) => a + b, 0) / d.moods.length) : null,
      completionRate: d.total ? round2(d.completed / d.total) : null,
      tasks: d.total,
    }));

  // ── blocker notes (free text → for the model to cluster) ──
  base.blockerNotes = tasks
    .filter((t) => (t.status === "partial" || t.status === "incomplete") && t.blocker_note?.trim())
    .slice(0, MAX_BLOCKER_NOTES)
    .map((t) => ({ pillar: pillarName.get(t.pillar_id) ?? "Uncategorised", note: t.blocker_note!.trim() }));

  // ── retention candidates (deterministic sentiment slope) ──
  base.retentionCandidates = computeRetentionCandidates(pulse);

  return base;
}

/** Sustained check-out sentiment decline → a retention candidate. Deterministic. */
export function computeRetentionCandidates(pulse: PulseLite[]): RetentionCandidate[] {
  const byEmployee = new Map<string, { date: string; v: number }[]>();
  for (const p of pulse) {
    if (p.checkout_sentiment == null) continue;
    const arr = byEmployee.get(p.employee_id) ?? [];
    arr.push({ date: p.pulse_date, v: p.checkout_sentiment });
    byEmployee.set(p.employee_id, arr);
  }

  const out: RetentionCandidate[] = [];
  for (const [employeeId, raw] of byEmployee) {
    if (raw.length < 4) continue; // not enough signal
    const series = raw.sort((a, b) => a.date.localeCompare(b.date));
    const recent = series.slice(-3);
    const prior = series.slice(0, -3);
    const avg = (xs: { v: number }[]) => xs.reduce((s, x) => s + x.v, 0) / xs.length;
    const recentAvg = round2(avg(recent));
    const priorAvg = round2(avg(prior));
    const drop = priorAvg - recentAvg;
    if (drop < 0.75) continue;

    const severity: FlagSeverity = drop >= 1.5 ? "high" : drop >= 1.0 ? "elevated" : "watch";
    out.push({
      employeeId,
      entries: series.length,
      recentAvg,
      priorAvg,
      severity,
      signal: `Check-out sentiment fell from ${priorAvg} to ${recentAvg} over the period (${series.length} entries).`,
    });
  }
  return out;
}

// ════════════════ LLM SYNTHESIS (clustering + narrative only) ════════════════
export const REPORT_SYSTEM_PROMPT = `You are Core-Roborate's internal workforce analytics model.

STRICT RULES (never break these):
1. Output is AI INFERENCE / decision SUPPORT only — never a final decision or judgement about an individual.
2. Use ONLY the METRICS and BLOCKER_NOTES provided. Never invent numbers, names, or trends.
3. The METRICS are deterministic ground truth. Echo their figures; do not recompute or alter them.
4. Your job is qualitative synthesis: cluster the free-text BLOCKER_NOTES into recurring bottleneck
   themes, and write short neutral narratives. Do not name or single out individuals.
5. Respond with valid JSON only — no markdown, no prose outside the JSON object.

JSON shape:
{
  "bottlenecks": [{ "theme": "string", "frequency": number, "examplePillars": ["string"], "summary": "string" }],
  "productivityVsMorale": { "correlation": "positive"|"negative"|"none", "narrative": "string" },
  "revenueImpact": { "tasksOnRevenuePillar": number, "verifiedRevenueImpact": number, "narrative": "string" },
  "retentionRisks": { "count": number, "narrative": "string — aggregate only, never name a person" },
  "confidence": 0.0-1.0,
  "disclaimer": "string — must state humans decide"
}`;

function buildReportUserPrompt(p: ReportPayload): string {
  const metrics = {
    period: { type: p.periodType, start: p.periodStart, end: p.periodEnd },
    headcount: p.headcount,
    pillarCompletion: p.pillarCompletion,
    moodVsCompletion: p.moodVsCompletion,
    revenuePillarTasks: p.revenuePillarTasks,
    verifiedRevenueImpact: p.verifiedRevenueImpact,
    retentionCandidateCount: p.retentionCandidates.length,
    retentionSeverities: p.retentionCandidates.map((c) => c.severity),
  };
  return `Scope: ${p.scope}

METRICS (deterministic ground truth — echo these figures):
${JSON.stringify(metrics, null, 2)}

BLOCKER_NOTES (free text, employee-reported — cluster into themes):
${JSON.stringify(p.blockerNotes, null, 2)}

Generate the leadership report JSON.`;
}

function parseJsonFromText(text: string): LeadershipReport {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(trimmed.slice(start, end + 1)) as LeadershipReport;
}

export async function callAnthropicReport(payload: ReportPayload): Promise<LeadershipReport> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: REPORT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildReportUserPrompt(payload) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json.content?.find((b: { type: string }) => b.type === "text")?.text;
  if (!text) throw new Error("Empty AI response");

  const parsed = parseJsonFromText(text);
  if (!parsed.disclaimer) {
    parsed.disclaimer = "AI INFERENCE — advisory only. Leaders make all final decisions.";
  }
  // figures are ground truth — never trust the model's copy of them
  parsed.revenueImpact = {
    ...parsed.revenueImpact,
    tasksOnRevenuePillar: payload.revenuePillarTasks.completed,
    verifiedRevenueImpact: payload.verifiedRevenueImpact,
  };
  parsed.retentionRisks = { ...parsed.retentionRisks, count: payload.retentionCandidates.length };
  return parsed;
}

// ════════════════ PERSIST (service role + audit) ════════════════
export async function persistReport(
  payload: ReportPayload,
  report: LeadershipReport,
  generatedBy: string,
): Promise<{ reportId: string; flags: number }> {
  const admin = getSupabaseAdmin();

  const { data: reportRow, error: reportErr } = await admin
    .from("ai_inference_reports")
    .insert({
      org_id: payload.orgId,
      scope: payload.scope,
      subject_id: payload.subjectId,
      period_type: payload.periodType,
      period_start: payload.periodStart,
      period_end: payload.periodEnd,
      report: { ...report, metricsSummary: {
        headcount: payload.headcount,
        pillarCompletion: payload.pillarCompletion,
        moodVsCompletion: payload.moodVsCompletion,
      } },
      confidence: Math.min(1, Math.max(0, report.confidence ?? 0.6)),
      model: "claude-sonnet-4-20250514",
      generated_by: generatedBy,
    })
    .select("id")
    .single();
  if (reportErr) throw reportErr;

  // Refresh retention flags for the candidates (delete+insert, like persist.ts).
  let flags = 0;
  const candidateIds = payload.retentionCandidates.map((c) => c.employeeId);
  if (candidateIds.length) {
    await admin.from("ai_retention_flags").delete().in("employee_id", candidateIds);
    for (const c of payload.retentionCandidates) {
      const { error } = await admin.from("ai_retention_flags").insert({
        employee_id: c.employeeId,
        org_id: payload.orgId,
        severity: c.severity,
        signal: c.signal,
        evidence: { recentAvg: c.recentAvg, priorAvg: c.priorAvg, entries: c.entries, periodEnd: payload.periodEnd },
        confidence: 0.7,
      });
      if (error) throw error;
      flags += 1;
    }
  }

  await admin.from("audit_log").insert({
    actor_id: generatedBy,
    action: "ai_report_generated",
    target_table: "ai_inference_reports",
    target_id: reportRow.id,
    changes: {
      scope: payload.scope, period: payload.periodType, headcount: payload.headcount,
      retention_flags: flags, disclaimer: report.disclaimer,
    },
  });

  return { reportId: reportRow.id as string, flags };
}
