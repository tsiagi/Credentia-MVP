import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAsUser } from "@/lib/supabase-admin";
import { canExportOwnVerifiedRecord, EXPORT_DISCLAIMER } from "@/lib/lifecycle";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

/** Free-tier data right: former (and active) employees always export their verified record. */
export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = auth.user.id;

  // #5 — per-user rate limit (guard against bulk export scraping).
  const rl = await checkRateLimit("export", userId);
  if (!rl.success) return tooManyRequests(rl);

  const { data: profile, error: profErr } = await client
    .from("profiles")
    .select("full_name, title, account_status, former_org_id, records_frozen_at")
    .eq("id", userId)
    .single();

  if (profErr || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  if (!canExportOwnVerifiedRecord(profile.account_status as Parameters<typeof canExportOwnVerifiedRecord>[0])) {
    return NextResponse.json({ error: "Export not available for this account status" }, { status: 403 });
  }

  const [achievements, kpis, projects, facts] = await Promise.all([
    client.from("achievements").select("*").eq("profile_id", userId),
    client.from("kpis").select("*").eq("employee_id", userId),
    client.from("projects").select("*").eq("profile_id", userId),
    client.from("verified_facts").select("*").eq("profile_id", userId),
  ]);

  const bundle = {
    exportedAt: new Date().toISOString(),
    disclaimer: EXPORT_DISCLAIMER,
    profile: {
      fullName: profile.full_name,
      title: profile.title,
      formerOrgId: profile.former_org_id,
      recordsFrozenAt: profile.records_frozen_at,
    },
    achievements: achievements.data ?? [],
    kpis: kpis.data ?? [],
    projects: projects.data ?? [],
    verifiedFacts: facts.data ?? [],
  };

  const filename = `core-roborate-verified-record-${userId.slice(0, 8)}.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
