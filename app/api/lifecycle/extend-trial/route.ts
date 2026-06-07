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

  const { data: target } = await client
    .from("profiles")
    .select("former_org_id, account_status")
    .eq("id", body.profileId)
    .single();

  if (target?.former_org_id !== me.org_id && !["former_trial", "former_free", "former_paid"].includes(target?.account_status ?? "")) {
    const { data: active } = await client.from("profiles").select("org_id").eq("id", body.profileId).single();
    if (active?.org_id !== me.org_id) {
      return NextResponse.json({ error: "Employee not associated with your org" }, { status: 403 });
    }
  }

  try {
    getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const { data, error } = await getSupabaseAdmin().rpc("extend_employee_trial", {
    p_profile_id: body.profileId,
    p_extra_days: body.extraDays,
    p_actor_id: auth.user.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, trialEndsAt: data?.trial_ends_at });
}
