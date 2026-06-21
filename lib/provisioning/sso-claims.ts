// lib/provisioning/sso-claims.ts
// ─────────────────────────────────────────────────────────────
// Pure trust-boundary decision for the post-SSO profile sync
// (app/api/provision/sso). Kept dependency-free so it is unit
// testable without standing up Supabase / Next.
//
// SECURITY (audit finding #1): only a request authenticated by the
// shared PROVISION_WEBHOOK_SECRET ("trusted IdP") may assert role /
// org / reporting line from the request body. A self-service caller
// (their own browser session) must NEVER set those — otherwise any
// employee could POST {role:'admin', orgId:'<any org>'} with their
// own token and become admin of an arbitrary tenant, because the
// upsert RPC overwrites profiles.role / org_id unconditionally.
// ─────────────────────────────────────────────────────────────

export type SsoClaimsBody = {
  role?: string;
  orgId?: string;
  managerExternalId?: string | null;
  externalId?: string;
};

export type ExistingProfile = {
  org_id: string | null;
  role: string | null;
} | null;

export type SsoClaimsInput = {
  /** True only when the shared provisioning secret matched. */
  isTrustedIdp: boolean;
  /** The caller's verified identity (token-derived for self-service). */
  userId: string;
  /** Org resolved from the verified email domain, or null. */
  resolvedDomainOrgId: string | null;
  /** The caller's current profile row (self-service only), or null. */
  existingProfile: ExistingProfile;
  /** Raw request body (untrusted for self-service). */
  body: SsoClaimsBody;
};

export type ResolvedSsoClaims = {
  orgId: string | null;
  role: string | undefined;
  managerExternalId: string | null | undefined;
  externalId: string;
};

/**
 * Decide which org / role / reporting line a sync request may apply.
 *
 * Trusted IdP  → body claims are authoritative (the secret vouches for them).
 * Self-service → org comes ONLY from the verified email domain; role is
 *                preserved from the existing profile (default 'employee' on
 *                first login); reporting line and external id are never
 *                client-settable.
 */
export function resolveSsoClaims(input: SsoClaimsInput): ResolvedSsoClaims {
  if (input.isTrustedIdp) {
    return {
      orgId: input.body.orgId ?? input.resolvedDomainOrgId,
      role: input.body.role,
      managerExternalId: input.body.managerExternalId,
      externalId: input.body.externalId ?? input.userId,
    };
  }

  return {
    orgId: input.existingProfile?.org_id ?? input.resolvedDomainOrgId,
    role: input.existingProfile?.role ?? "employee",
    managerExternalId: undefined,
    externalId: input.userId,
  };
}
