import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, getSupabaseAsUser } from "@/lib/supabase-admin";
import { upsertFromIdp, resolveOrgFromSsoDomain } from "@/lib/provisioning/server";
import { resolveSsoClaims } from "@/lib/provisioning/sso-claims";

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

  // A request is a TRUSTED IdP webhook ONLY when it presents the shared secret.
  // Anything else is a self-service browser sync (the caller's own Supabase
  // session). Self-service callers must never be trusted to assert their own
  // role, org, or reporting line — those fields in the body are attacker
  // controlled and the underlying RPC overwrites profiles.role/org_id
  // unconditionally. See security audit finding #1.
  const isTrustedIdp = Boolean(secret && expected && secret === expected);

  let userId: string;
  let email: string;
  let userClient: SupabaseClient | null = null;

  if (isTrustedIdp) {
    if (!body.userId || !body.email) {
      return NextResponse.json({ error: "userId and email required" }, { status: 400 });
    }
    userId = body.userId;
    email = body.email;
  } else if (authHeader?.startsWith("Bearer ")) {
    userClient = getSupabaseAsUser(authHeader.slice(7));
    const { data: auth, error } = await userClient.auth.getUser();
    if (error || !auth.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = auth.user.id;
    email = auth.user.email;
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const domain = email.split("@")[1]?.toLowerCase();
  const resolvedDomainOrgId = domain ? await resolveOrgFromSsoDomain(domain) : null;

  // Self-service callers can read only their own profile (RLS), which is exactly
  // what we need to preserve their current role/org rather than trust the body.
  const { data: existingProfile } = isTrustedIdp
    ? { data: null }
    : await userClient!.from("profiles").select("org_id, role").eq("id", userId).maybeSingle();

  // Trust boundary lives in resolveSsoClaims: the body's role/org/manager are
  // honoured ONLY for a secret-authenticated IdP webhook (see audit #1).
  const { orgId, role, managerExternalId, externalId } = resolveSsoClaims({
    isTrustedIdp,
    userId,
    resolvedDomainOrgId,
    existingProfile: (existingProfile as { org_id: string | null; role: string | null } | null) ?? null,
    body,
  });

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
    role,
    managerExternalId,
    externalId,
    source: "sso",
  });

  return NextResponse.json({ profileId: profile?.id, orgId, provisioning: "sso" });
}
