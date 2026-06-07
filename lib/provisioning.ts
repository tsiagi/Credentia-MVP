/**
 * Provisioning — SSO/SCIM as default; manual email invite as fallback.
 */

export type OrgProvisioningConfig = {
  id: string;
  name: string;
  sso_enabled: boolean;
  scim_enabled: boolean;
  sso_provider: "okta" | "azure" | "google" | null;
  auto_trial_on_departure: boolean;
  default_trial_days: number;
};

export type OrgInvite = {
  id: string;
  org_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
};

/** Claims from Okta SAML/OIDC or SCIM sync — IdP is source of truth. */
export type IdpUserClaims = {
  userId: string;
  orgId: string;
  email: string;
  fullName?: string | null;
  title?: string | null;
  role?: string;
  managerExternalId?: string | null;
  externalId: string;
  source?: "sso" | "scim";
};

export type ScimUserPayload = {
  externalId: string;
  email: string;
  fullName?: string;
  title?: string;
  active: boolean;
  managerExternalId?: string;
  role?: string;
};

function bearerHeaders(accessToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function sendOrgInvite(
  accessToken: string,
  input: { email: string; role?: string },
): Promise<{ inviteId: string; token: string }> {
  const res = await fetch("/api/provision/invite", {
    method: "POST",
    headers: bearerHeaders(accessToken),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Invite failed (${res.status})`);
  return data;
}

export async function acceptOrgInvite(
  accessToken: string,
  token: string,
): Promise<{ orgId: string }> {
  const res = await fetch("/api/provision/invite/accept", {
    method: "POST",
    headers: bearerHeaders(accessToken),
    body: JSON.stringify({ token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Accept failed (${res.status})`);
  return data;
}

export async function fetchOrgProvisioningConfig(accessToken: string): Promise<OrgProvisioningConfig | null> {
  const res = await fetch("/api/provision/config", {
    headers: bearerHeaders(accessToken),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Config failed (${res.status})`);
  return data.config ?? null;
}

export async function updateOrgBillingSettings(
  accessToken: string,
  settings: { auto_trial_on_departure?: boolean; default_trial_days?: number },
): Promise<void> {
  const res = await fetch("/api/provision/config", {
    method: "PATCH",
    headers: bearerHeaders(accessToken),
    body: JSON.stringify(settings),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Update failed (${res.status})`);
}

export async function fetchPendingInvites(accessToken: string): Promise<OrgInvite[]> {
  const res = await fetch("/api/provision/invite", {
    headers: bearerHeaders(accessToken),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `List invites failed (${res.status})`);
  return data.invites ?? [];
}
