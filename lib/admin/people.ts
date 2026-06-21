/**
 * Superadmin people provisioning — client fetcher for the manual-integration
 * flow. Creates real auth users + profiles in a company via the service-role
 * endpoint (browser clients cannot create auth users).
 */

export type PersonInput = { name: string; email: string; role: string; title?: string };

export type AddPeopleResult = {
  created: number;
  people: { id: string; name: string; email: string; role: string }[];
  errors: { email: string; message: string }[];
};

export async function addPeople(
  accessToken: string,
  orgId: string,
  people: PersonInput[],
): Promise<AddPeopleResult> {
  const res = await fetch("/api/superadmin/people", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, people }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not add people");
  return res.json();
}
