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
  return { client, userId: auth.user.id, orgId: profile.org_id, role: profile.role };
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const ctx = await requireAdminOrHr(token);
  if ("error" in ctx && ctx.error) return ctx.error;

  const { data, error } = await ctx.client
    .from("organizations")
    .select("id, name, sso_enabled, scim_enabled, sso_provider, auto_trial_on_departure, default_trial_days")
    .eq("id", ctx.orgId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}

export async function PATCH(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: "Bearer token required" }, { status: 401 });

  const ctx = await requireAdminOrHr(token);
  if ("error" in ctx && ctx.error) return ctx.error;

  let body: { auto_trial_on_departure?: boolean; default_trial_days?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.auto_trial_on_departure === "boolean") patch.auto_trial_on_departure = body.auto_trial_on_departure;
  if (typeof body.default_trial_days === "number") patch.default_trial_days = body.default_trial_days;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No billing fields to update" }, { status: 400 });
  }

  const { error } = await ctx.client.from("organizations").update(patch).eq("id", ctx.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  getSupabaseAdmin().from("audit_log").insert({
    actor_id: ctx.userId,
    action: "billing_settings_updated",
    target_table: "organizations",
    target_id: ctx.orgId,
    changes: patch,
  });

  return NextResponse.json({ ok: true });
}
