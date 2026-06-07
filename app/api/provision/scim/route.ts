import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { upsertFromIdp } from "@/lib/provisioning/server";
import type { ScimUserPayload } from "@/lib/provisioning";

export const runtime = "nodejs";

/**
 * SCIM 2.0-style user sync webhook (Okta SCIM app → this endpoint).
 * IdP is source of truth — creates/updates profiles; deactivations trigger departure.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const orgId = req.headers.get("x-org-id");
  const scimSecret = process.env.SCIM_WEBHOOK_SECRET;

  if (!scimSecret || token !== scimSecret) {
    return NextResponse.json({ error: "Invalid SCIM token" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json({ error: "x-org-id header required" }, { status: 400 });
  }

  let body: ScimUserPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.externalId || !body.email) {
    return NextResponse.json({ error: "externalId and email required" }, { status: 400 });
  }

  try {
    getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const admin = getSupabaseAdmin();

  const { data: authUsers } = await admin.auth.admin.listUsers();
  const existing = authUsers?.users?.find((u) => u.email?.toLowerCase() === body.email.toLowerCase());

  if (!body.active) {
    if (existing) {
      const { data: profile } = await admin.from("profiles").select("id, account_status").eq("id", existing.id).single();
      if (profile && ["active_sso", "active_invited"].includes(profile.account_status)) {
        await admin.rpc("process_employee_departure", { p_profile_id: profile.id, p_actor_id: null });
      }
    }
    return NextResponse.json({ ok: true, action: "deactivated" });
  }

  let userId = existing?.id;
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: body.email,
      email_confirm: true,
      user_metadata: { full_name: body.fullName, scim_external_id: body.externalId },
    });
    if (error || !created.user) {
      return NextResponse.json({ error: error?.message ?? "Could not create auth user" }, { status: 500 });
    }
    userId = created.user.id;
  }

  await upsertFromIdp({
    userId,
    orgId,
    email: body.email,
    fullName: body.fullName,
    title: body.title,
    role: body.role,
    managerExternalId: body.managerExternalId,
    externalId: body.externalId,
    source: "scim",
  });

  return NextResponse.json({ ok: true, userId, action: existing ? "updated" : "created" });
}
