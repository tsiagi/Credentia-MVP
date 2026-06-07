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
  if (authErr || !auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: invite, error: invErr } = await admin
    .from("org_invites")
    .select("*")
    .eq("token", body.token)
    .eq("status", "pending")
    .maybeSingle();

  if (invErr || !invite) {
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await admin.from("org_invites").update({ status: "expired" }).eq("id", invite.id);
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  const userEmail = auth.user.email?.toLowerCase();
  if (userEmail !== invite.email.toLowerCase()) {
    return NextResponse.json({ error: "Invite email does not match signed-in account" }, { status: 403 });
  }

  const { error: upsertErr } = await admin.rpc("upsert_profile_from_idp", {
    p_user_id: auth.user.id,
    p_org_id: invite.org_id,
    p_full_name: auth.user.user_metadata?.full_name ?? null,
    p_title: null,
    p_role: invite.role,
    p_manager_id: null,
    p_idp_external_id: `invite:${invite.id}`,
    p_source: "invite",
  });

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  await admin.from("org_invites").update({
    status: "accepted",
    accepted_at: new Date().toISOString(),
  }).eq("id", invite.id);

  await admin.from("audit_log").insert({
    actor_id: auth.user.id,
    action: "org_invite_accepted",
    target_table: "org_invites",
    target_id: invite.id,
    changes: { org_id: invite.org_id },
  });

  return NextResponse.json({ orgId: invite.org_id });
}
