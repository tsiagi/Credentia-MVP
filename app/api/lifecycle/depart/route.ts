import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import { runEmployeeDeparture } from "@/lib/lifecycle/departure";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

/**
 * POST /api/lifecycle/depart
 * Admin processes employee departure — see lib/lifecycle/departure.ts for auth handoff docs.
 */
export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const client = getSupabaseAsUser(token);
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await client.from("profiles").select("role, org_id").eq("id", auth.user.id).single();
  if (!me?.org_id || me.role !== "admin") {
    return NextResponse.json({ error: "Org admin required to process departures" }, { status: 403 });
  }

  let body: { profileId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const { data: target } = await client.from("profiles").select("org_id").eq("id", body.profileId).single();
  if (target?.org_id !== me.org_id) {
    return NextResponse.json({ error: "Employee not in your org" }, { status: 403 });
  }

  try {
    getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  try {
    const result = await runEmployeeDeparture(getSupabaseAdmin(), body.profileId, auth.user.id);
    return NextResponse.json({
      ok: true,
      ...result,
      message: "Verified records frozen; account transferred to personal login.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Departure failed" }, { status: 500 });
  }
}
