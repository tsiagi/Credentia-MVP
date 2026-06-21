import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import {
  loadReportPayload, callAnthropicReport, persistReport,
  type ReportScope, type PeriodType,
} from "@/lib/ai/reports";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

type ReportBody = {
  scope?: ReportScope;        // "team" (default) | "department" | "org"
  periodType?: PeriodType;    // "weekly" (default) | "monthly"
  subjectId?: string;         // manager / dept lead; defaults to caller for team/department
  periodStart?: string;       // optional explicit YYYY-MM-DD window
  periodEnd?: string;
};

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function periodRange(periodType: PeriodType, start?: string, end?: string) {
  if (start && end) return { periodStart: start, periodEnd: end };
  const e = new Date();
  const s = new Date();
  s.setDate(s.getDate() - (periodType === "weekly" ? 7 : 30));
  return { periodStart: fmt(s), periodEnd: fmt(e) };
}

/** Collect every descendant of `rootId` in the manager_id tree (Director/VP subtree). */
function subtreeIds(rootId: string, rows: { id: string; manager_id: string | null }[]): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.manager_id) continue;
    const arr = childrenOf.get(r.manager_id) ?? [];
    arr.push(r.id);
    childrenOf.set(r.manager_id, arr);
  }
  const out: string[] = [];
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.includes(id)) continue;
    out.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Authorization: Bearer <access_token> required" }, { status: 401 });
  }

  const userClient = getSupabaseAsUser(token);
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }
  const callerId = authData.user.id;

  // #5 — per-user rate limit (report generation fans out across a team/org).
  const rl = await checkRateLimit("ai-batch", callerId);
  if (!rl.success) return tooManyRequests(rl);

  let body: ReportBody = {};
  try { body = await req.json(); } catch { /* defaults */ }

  const { data: caller } = await userClient.from("profiles").select("role, org_id").eq("id", callerId).single();
  const role = caller?.role;
  const orgId = caller?.org_id;
  if (!role || !["manager", "executive", "admin", "hr"].includes(role)) {
    return NextResponse.json({ error: "Only managers, executives, or admins can generate reports" }, { status: 403 });
  }
  if (!orgId) {
    return NextResponse.json({ error: "Set profiles.org_id on your profile to generate reports." }, { status: 400 });
  }

  const scope: ReportScope = body.scope ?? "team";
  const periodType: PeriodType = body.periodType ?? "weekly";
  const isLeader = role === "executive" || role === "admin" || role === "hr";

  // Managers may only report on their own team.
  if ((scope === "org" || scope === "department") && !isLeader) {
    return NextResponse.json({ error: "Department and org reports require executive or admin role" }, { status: 403 });
  }
  const subjectId = scope === "org" ? null : (body.subjectId ?? callerId);
  if (scope === "team" && role === "manager" && subjectId !== callerId) {
    return NextResponse.json({ error: "Managers can only report on their own direct reports" }, { status: 403 });
  }

  const { periodStart, periodEnd } = periodRange(periodType, body.periodStart, body.periodEnd);

  // ── resolve the employee set for the scope ──
  let employeeIds: string[] = [];
  if (scope === "team") {
    const { data, error } = await userClient.from("profiles").select("id").eq("manager_id", subjectId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    employeeIds = (data ?? []).map((r) => r.id);
  } else {
    // department + org both need the org tree; service role reads org membership.
    const admin = getSupabaseAdmin();
    const { data: orgProfiles, error } = await admin
      .from("profiles").select("id, manager_id, role").eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (orgProfiles ?? []) as { id: string; manager_id: string | null; role: string }[];
    if (scope === "org") {
      employeeIds = rows.filter((r) => ["employee", "manager"].includes(r.role)).map((r) => r.id);
    } else {
      // department = the reporting subtree under subjectId (handles Director/VP depth)
      if (!subjectId) return NextResponse.json({ error: "subjectId is required for department scope" }, { status: 400 });
      const subjectInOrg = rows.some((r) => r.id === subjectId);
      if (!subjectInOrg) return NextResponse.json({ error: "subjectId is not in your org" }, { status: 403 });
      employeeIds = subtreeIds(subjectId, rows);
    }
  }

  if (!employeeIds.length) {
    return NextResponse.json({ error: "No employees found for this scope/period." }, { status: 400 });
  }

  try {
    getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  try {
    const payload = await loadReportPayload({
      orgId, employeeIds, scope, subjectId, periodType, periodStart, periodEnd,
    });
    const report = await callAnthropicReport(payload);
    const { reportId, flags } = await persistReport(payload, report, callerId);

    return NextResponse.json({
      disclaimer: report.disclaimer,
      reportId,
      scope,
      periodType,
      periodStart,
      periodEnd,
      headcount: payload.headcount,
      retentionFlags: flags,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Report generation failed" },
      { status: 500 },
    );
  }
}
