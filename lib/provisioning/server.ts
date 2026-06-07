import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { IdpUserClaims } from "@/lib/provisioning";

const VALID_ROLES = new Set(["employee", "manager", "executive", "admin", "hr"]);

export async function upsertFromIdp(claims: IdpUserClaims) {
  const admin = getSupabaseAdmin();
  const role = claims.role && VALID_ROLES.has(claims.role) ? claims.role : "employee";
  const source = claims.source ?? "sso";

  let managerId: string | null = null;
  if (claims.managerExternalId) {
    const { data: mgr } = await admin
      .from("profiles")
      .select("id")
      .eq("org_id", claims.orgId)
      .eq("idp_external_id", claims.managerExternalId)
      .maybeSingle();
    managerId = mgr?.id ?? null;
  }

  const { data, error } = await admin.rpc("upsert_profile_from_idp", {
    p_user_id: claims.userId,
    p_org_id: claims.orgId,
    p_full_name: claims.fullName ?? null,
    p_title: claims.title ?? null,
    p_role: role,
    p_manager_id: managerId,
    p_idp_external_id: claims.externalId,
    p_source: source,
  });

  if (error) throw error;
  return data;
}

export async function resolveOrgFromSsoDomain(domain: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("organizations")
    .select("id, idp_metadata")
    .eq("sso_enabled", true);

  for (const org of data ?? []) {
    const meta = org.idp_metadata as { email_domains?: string[] };
    if (meta?.email_domains?.includes(domain.toLowerCase())) return org.id;
  }
  return null;
}
