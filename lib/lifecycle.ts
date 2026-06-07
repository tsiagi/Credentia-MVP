/**
 * Account lifecycle, tier rights, and data-access guardrails.
 *
 * FREE (former_free / former_trial): always VIEW + EXPORT own verified record.
 * PAID (former_paid): shareable recruiter-facing passport (value-add).
 * Employed (active_*): org-controlled; passport publish per org policy (default off until paid personal tier on departure).
 */

export type AccountStatus =
  | "active_sso"
  | "invited"
  | "former_trial"
  | "former_free"
  | "former_paid";

export type ProvisioningSource = "sso" | "scim" | "invite" | "csv" | "self";

export type ProfileLifecycle = {
  account_status: AccountStatus;
  provisioned_via: ProvisioningSource;
  org_id: string | null;
  employment_ended_at: string | null;
  trial_ends_at: string | null;
  passport_published: boolean;
};

export function isEmployed(status: AccountStatus): boolean {
  return status === "active_sso" || status === "invited";
}

export function isFormer(status: AccountStatus): boolean {
  return status.startsWith("former_");
}

/** Free tier: view own verified data — always allowed for former employees. */
export function canViewOwnVerifiedRecord(status: AccountStatus): boolean {
  return isEmployed(status) || isFormer(status);
}

/** Free tier: export own verified record — always allowed. */
export function canExportOwnVerifiedRecord(status: AccountStatus): boolean {
  return canViewOwnVerifiedRecord(status);
}

/** Paid tier: publish/share recruiter-facing passport. Not required to access raw record. */
export function canPublishPassport(status: AccountStatus): boolean {
  if (isEmployed(status)) return false; // org era — personal passport is post-employment product
  return status === "former_paid" || status === "former_trial"; // trial includes passport preview
}

export function accountStatusLabel(status: AccountStatus): string {
  const labels: Record<AccountStatus, string> = {
    active_sso: "Active (SSO)",
    invited: "Invited",
    former_trial: "Former — trial passport",
    former_free: "Former — free record access",
    former_paid: "Former — paid passport",
  };
  return labels[status];
}

export function trialDaysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (86400000)));
}

/** Transition former_trial → former_free when trial expires (cron or login hook). */
export function shouldExpireTrial(profile: ProfileLifecycle): boolean {
  if (profile.account_status !== "former_trial" || !profile.trial_ends_at) return false;
  return new Date(profile.trial_ends_at) <= new Date();
}

export type VerifiedExportBundle = {
  exportedAt: string;
  disclaimer: string;
  profile: { fullName: string | null; title: string | null; formerOrgId: string | null };
  achievements: unknown[];
  kpis: unknown[];
  projects: unknown[];
  verifiedFacts: unknown[];
};

export const EXPORT_DISCLAIMER =
  "Verified employment record export. Attested facts are frozen from your employment period; AI inference is excluded.";

export const PASSPORT_PAYWALL_MESSAGE =
  "Shareable passport requires a paid subscription. Your verified record is always free to view and export.";
