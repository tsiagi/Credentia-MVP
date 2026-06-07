import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import { upsertFromIdp, resolveOrgFromSsoDomain } from "@/lib/provisioning/server";

export const runtime = "nodejs";

type SsoSyncBody = {
  userId?: string;
  email?: string;
  fullName?: string;
  title?: string;
  role?: string;
  managerExternalId?: string;
  externalId?: string;
  orgId?: string;
};

/**
 * Post-SSO hook: sync profile from IdP claims after Supabase Auth SAML/OIDC login.
 * orgId resolved from email domain in organizations.idp_metadata if omitted.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-provision-secret");
  const expected = process.env.PROVISION_WEBHOOK_SECRET;
  const authHeader = req.headers.get("authorization");

  let body: SsoSyncBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let userId: string;
  let email: string;

  if (secret && expected && secret === expected) {
    if (!body.userId || !body.email) {
      return NextResponse.json({ error: "userId and email required" }, { status: 400 });
    }
    userId = body.userId;
    email = body.email;
  } else if (authHeader?.startsWith("Bearer ")) {
    const client = getSupabaseAsUser(authHeader.slice(7));
    const { data: auth, error } = await client.auth.getUser();
    if (error || !auth.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = auth.user.id;
    email = auth.user.email;
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const domain = email.split("@")[1]?.toLowerCase();
  const orgId = body.orgId ?? (domain ? await resolveOrgFromSsoDomain(domain) : null);
  if (!orgId) {
    return NextResponse.json({ error: "No org mapped for this SSO domain" }, { status: 400 });
  }

  try {
    getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfigured" }, { status: 503 });
  }

  const profile = await upsertFromIdp({
    userId,
    orgId,
    email,
    fullName: body.fullName,
    title: body.title,
    role: body.role,
    managerExternalId: body.managerExternalId,
    externalId: body.externalId ?? userId,
    source: "sso",
  });

  return NextResponse.json({ profileId: profile?.id, orgId, provisioning: "sso" });
}
