/**
 * Org chart — managers propose via org_membership_requests; admin approves.
 */

export type OrgMembershipRequest = {
  id: string;
  org_id: string;
  subject_profile_id: string;
  proposed_manager_id: string;
  requested_by: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  subject_name?: string;
  manager_name?: string;
  requester_name?: string;
};

/** @deprecated use OrgMembershipRequest */
export type ManagerAssignmentRequest = OrgMembershipRequest & {
  employee_id?: string;
  employee_name?: string;
};

function bearerHeaders(accessToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function proposeManagerAssignment(
  accessToken: string,
  input: { subjectProfileId: string; proposedManagerId: string },
): Promise<{ requestId: string }> {
  const res = await fetch("/api/org-chart/request", {
    method: "POST",
    headers: bearerHeaders(accessToken),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Proposal failed (${res.status})`);
  return data;
}

export async function fetchManagerAssignmentRequests(
  accessToken: string,
): Promise<OrgMembershipRequest[]> {
  const res = await fetch("/api/org-chart/request", {
    headers: bearerHeaders(accessToken),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `List failed (${res.status})`);
  return data.requests ?? [];
}

export async function reviewManagerAssignment(
  accessToken: string,
  input: { requestId: string; action: "approve" | "reject"; notes?: string },
): Promise<void> {
  const res = await fetch("/api/org-chart/approve", {
    method: "POST",
    headers: bearerHeaders(accessToken),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Review failed (${res.status})`);
}

export async function departEmployee(
  accessToken: string,
  profileId: string,
): Promise<void> {
  const res = await fetch("/api/lifecycle/depart", {
    method: "POST",
    headers: bearerHeaders(accessToken),
    body: JSON.stringify({ profileId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Departure failed (${res.status})`);
}

export async function extendEmployeeTrial(
  accessToken: string,
  input: { profileId: string; extraDays: number },
): Promise<void> {
  const res = await fetch("/api/lifecycle/extend-trial", {
    method: "POST",
    headers: bearerHeaders(accessToken),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Extend trial failed (${res.status})`);
}

export async function exportVerifiedRecord(accessToken: string): Promise<Blob> {
  const res = await fetch("/api/export/verified-record", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Export failed (${res.status})`);
  }
  return res.blob();
}
