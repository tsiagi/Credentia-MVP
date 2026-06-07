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
  if (!me?.org_id || me.role !== "admin") {
    return NextResponse.json({ error: "Org admin must approve membership changes" }, { status: 403 });
  }

  let body: { requestId?: string; action?: string; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.requestId || !body.action) {
    return NextResponse.json({ error: "requestId and action required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  if (body.action === "approve") {
    const { error } = await admin.rpc("approve_org_membership_request", {
      p_request_id: body.requestId,
      p_reviewer_id: auth.user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "approved" });
  }

  if (body.action === "reject") {
    const { error } = await admin
      .from("org_membership_requests")
      .update({ status: "rejected" })
      .eq("id", body.requestId)
      .eq("status", "pending");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from("audit_log").insert({
      actor_id: auth.user.id,
      action: "org_membership_rejected",
      target_table: "org_membership_requests",
      target_id: body.requestId,
      changes: { notes: body.notes ?? null },
    });

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
}
