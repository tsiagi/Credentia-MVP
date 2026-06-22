/**
 * Superadmin SCIM-secret client fetchers. The plaintext secret is decrypted
 * server-side (key never reaches the browser) and returned only to a
 * superadmin, on demand. Every reveal/rotate is audit-logged server-side.
 */
export type ScimSecret = {
  orgId: string;
  secret: string;
  headerName: string;   // 'x-org-id'
  endpointPath: string; // '/api/provision/scim'
};

export async function revealScimSecret(accessToken: string, orgId: string): Promise<ScimSecret> {
  const res = await fetch(`/api/superadmin/scim-secret?orgId=${encodeURIComponent(orgId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not reveal SCIM secret");
  return res.json();
}

export async function rotateScimSecret(accessToken: string, orgId: string): Promise<ScimSecret> {
  const res = await fetch("/api/superadmin/scim-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ orgId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not rotate SCIM secret");
  return res.json();
}
