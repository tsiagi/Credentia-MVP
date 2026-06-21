import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await client.from("profiles").select("role, org_id").eq("id", auth.user.id).single();
  if (!me?.org_id || !["admin", "hr"].includes(me.role)) {
    return NextResponse.json({ error: "Admin or HR required" }, { status: 403 });
  }

  let body: { profileId?: string; extraDays?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.profileId || !body.extraDays) {
    return NextResponse.json({ error: "profileId and extraDays required" }, { status: 400 });
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  // Authorize against the target's ACTUAL org linkage. Former employees have
  // org_id cleared on departure, so the caller's RLS client can't see them —
  // read with the service role, then explicitly require that the target belongs
  // to the caller's org as a current OR former member. The extend_employee_trial
  // RPC is SECURITY DEFINER and performs no org check, so this is the only
  // tenant boundary (replaces a buggy AND-condition that let an admin act on a
  // former employee of a different org).
  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("org_id, former_org_id")
    .eq("id", body.profileId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const belongsToOrg = target.org_id === me.org_id || target.former_org_id === me.org_id;
  if (!belongsToOrg) {
    return NextResponse.json({ error: "Employee not associated with your org" }, { status: 403 });
  }

  const { data, error } = await admin.rpc("extend_employee_trial", {
    p_profile_id: body.profileId,
    p_extra_days: body.extraDays,
    p_actor_id: auth.user.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, trialEndsAt: data?.trial_ends_at });
}
