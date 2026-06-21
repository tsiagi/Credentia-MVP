import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import type { CompanyMetricRow, PlatformMetrics } from "@/lib/admin/superadmin-metrics";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

async function requireSuperadmin(token: string) {
  const client = getSupabaseAsUser(token);
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: me } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (me?.role !== "superadmin") {
    return { error: NextResponse.json({ error: "Superadmin required" }, { status: 403 }) };
  }
  return { actorId: auth.user.id };
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const auth = await requireSuperadmin(token);
  if ("error" in auth) return auth.error;

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  // Organizations (subscription state)
  const { data: orgs, error: orgErr } = await admin
    .from("organizations")
    .select("id, name, plan, status, billing_status, seats, monthly_price")
    .order("name");
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

  // Profiles → per-org user counts
  const { data: profiles } = await admin.from("profiles").select("org_id, account_status");
  const usersByOrg = new Map<string, number>();
  const activeByOrg = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (!p.org_id) continue;
    usersByOrg.set(p.org_id, (usersByOrg.get(p.org_id) ?? 0) + 1);
    if (p.account_status === "active_sso" || p.account_status === "active") {
      activeByOrg.set(p.org_id, (activeByOrg.get(p.org_id) ?? 0) + 1);
    }
  }

  // AI-insight usage = count of AI artifacts (ai_inference_tasks/reports) per org.
  // These carry org_id and are platform-observable usage signals. We deliberately
  // do NOT aggregate the sensitive per-employee inference tables (comp recs,
  // value scores, promotion readiness) here — per rls-policies.sql note #5 those
  // stay org-scoped and require an audited RPC, never a blanket service-role sweep.
  const aiByOrg = new Map<string, number>();
  const [tasks, reports] = await Promise.all([
    admin.from("ai_inference_tasks").select("org_id"),
    admin.from("ai_inference_reports").select("org_id"),
  ]);
  for (const r of [...(tasks.data ?? []), ...(reports.data ?? [])]) {
    if (r.org_id) aiByOrg.set(r.org_id, (aiByOrg.get(r.org_id) ?? 0) + 1);
  }

  const companies: CompanyMetricRow[] = (orgs ?? []).map((o) => ({
    orgId: o.id,
    name: o.name,
    plan: o.plan ?? null,
    status: o.status,
    billingStatus: o.billing_status,
    seats: o.seats ?? null,
    monthlyPrice: o.monthly_price ?? null,
    userCount: usersByOrg.get(o.id) ?? 0,
    activeUserCount: activeByOrg.get(o.id) ?? 0,
    aiInsightCount: aiByOrg.get(o.id) ?? 0,
  }));

  const totals: PlatformMetrics["totals"] = {
    companies: companies.length,
    activeCompanies: companies.filter((c) => c.status === "active").length,
    users: companies.reduce((s, c) => s + c.userCount, 0),
    activeUsers: companies.reduce((s, c) => s + c.activeUserCount, 0),
    aiInsights: companies.reduce((s, c) => s + c.aiInsightCount, 0),
    mrr: companies
      .filter((c) => c.billingStatus === "active")
      .reduce((s, c) => s + (c.monthlyPrice ?? 0), 0),
  };

  return NextResponse.json({ totals, companies } satisfies PlatformMetrics);
}
