import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

async function requireAdminOrHr(token: string) {
  const client = getSupabaseAsUser(token);
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await client.from("profiles").select("role, org_id").eq("id", auth.user.id).single();
  if (!profile?.org_id || !["admin", "hr"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Admin or HR role required" }, { status: 403 }) };
  }
  return { client, userId: auth.user.id, orgId: profile.org_id };
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const ctx = await requireAdminOrHr(token);
  if ("error" in ctx && ctx.error) return ctx.error;

  const { data, error } = await ctx.client
    .from("org_invites")
    .select("id, org_id, email, role, status, expires_at, created_at")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const ctx = await requireAdminOrHr(token);
  if ("error" in ctx && ctx.error) return ctx.error;

  let body: { email?: string; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const role = body.role ?? "employee";
  if (!["employee", "manager", "executive", "hr"].includes(role)) {
    return NextResponse.json({ error: "Invalid role for invite" }, { status: 400 });
  }

  const { data: org } = await ctx.client
    .from("organizations")
    .select("sso_enabled, scim_enabled")
    .eq("id", ctx.orgId)
    .single();

  const { data, error } = await ctx.client
    .from("org_invites")
    .insert({
      org_id: ctx.orgId,
      email,
      role,
      invited_by: ctx.userId,
      status: "pending",
    })
    .select("id, token")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  getSupabaseAdmin().from("audit_log").insert({
    actor_id: ctx.userId,
    action: "org_invite_sent",
    target_table: "org_invites",
    target_id: data.id,
    changes: { email, role, fallback: !(org?.sso_enabled || org?.scim_enabled) },
  });

  return NextResponse.json({
    inviteId: data.id,
    token: data.token,
    message: org?.sso_enabled
      ? "Invite created (fallback path — SSO is the default for this org)."
      : "Invite created — share the accept link with the employee.",
  });
}
