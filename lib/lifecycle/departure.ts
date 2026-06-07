/**
 * Employee departure handoff — server-side only (service role).
 *
 * ## What happens on departure
 * 1. `employment_ended_at` is set to now().
 * 2. All verified rows (achievements, kpis, projects, verified_facts, process_improvements)
 *    get `frozen_at = now()` — immutable, never deleted.
 * 3. If `organizations.auto_trial_enabled`: `account_status = 'former_trial'`,
 *    `trial_ends_at = now() + trial_days`. Else: `former_free`.
 * 4. `org_id` and `manager_id` cleared — the person is no longer in the company org.
 * 5. `passport_published` set false (personal paid passport is separate from employment).
 * 6. `audit_log` row with action `employee_departed`.
 *
 * ## Auth handoff (Supabase) — beginner explanation
 *
 * While employed, the user often signs in with **company SSO** (Okta). Supabase stores one
 * `auth.users` row per person (same `profiles.id` = `auth.users.id`).
 *
 * On departure we do **NOT** delete the auth user or the profile. We only:
 * - Remove org membership from `profiles` (org_id → null).
 * - Freeze verified data on that profile.
 *
 * The **same login** now sees a personal account:
 *
 * | Step | What you do |
 * |------|-------------|
 * | 1 | User opens Credentia and clicks "Continue with email" or "Set personal password". |
 * | 2 | Call `supabase.auth.updateUser({ email: personalEmail, password })` **or** link a magic link to a personal email they control. |
 * | 3 | In Supabase Dashboard → Auth → disable SSO-only for that user if your org enforced IdP-only sign-in. |
 * | 4 | Optional: send `auth.admin.generateLink({ type: 'recovery', email })` so they set a password without Okta. |
 *
 * **Why this works:** `profiles.id` stays tied to `auth.users.id`. Verified facts stay on that
 * profile. They log in with personal credentials instead of Okta and still see their frozen record.
 *
 * **SSO unlink:** If the user's `auth.identities` still has an Okta provider, they can have both
 * SSO (dead) and email/password. Production apps often call Admin API to remove the SAML identity
 * after departure so only personal login remains.
 *
 * See: https://supabase.com/docs/guides/auth/auth-identity-linking
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DepartureResult = {
  profileId: string;
  accountStatus: string;
  employmentEndedAt: string;
  trialEndsAt: string | null;
  authHandoff: {
    summary: string;
    nextSteps: string[];
  };
};

export const AUTH_HANDOFF_STEPS = [
  "User keeps the same Supabase auth account (same user id as profiles.id).",
  "Org fields cleared on profiles — they are no longer an employee in Workforce Verify.",
  "Prompt user to add a personal email/password via supabase.auth.updateUser() or a recovery link.",
  "Optionally remove Okta identity via Supabase Admin API so only personal login works.",
  "Free tier: they can always view and export verified record. Paid tier unlocks shareable passport.",
] as const;

export async function runEmployeeDeparture(
  admin: SupabaseClient,
  profileId: string,
  actorId: string | null,
): Promise<DepartureResult> {
  const { data, error } = await admin.rpc("process_employee_departure", {
    p_profile_id: profileId,
    p_actor_id: actorId,
  });

  if (error) throw new Error(error.message);

  const row = data as {
    id: string;
    account_status: string;
    employment_ended_at: string;
    trial_ends_at: string | null;
  };

  return {
    profileId: row.id,
    accountStatus: row.account_status,
    employmentEndedAt: row.employment_ended_at,
    trialEndsAt: row.trial_ends_at,
    authHandoff: {
      summary:
        "Same auth.users id — org link removed. User should set personal email/password to sign in without company SSO.",
      nextSteps: [...AUTH_HANDOFF_STEPS],
    },
  };
}

export async function initiatePersonalAuthHandoff(
  admin: SupabaseClient,
  userId: string,
  personalEmail: string,
): Promise<{ recoveryLink?: string }> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: personalEmail,
  });

  if (error) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      email: personalEmail,
      email_confirm: true,
    });
    if (updateErr) throw updateErr;
    return {};
  }

  return { recoveryLink: data.properties?.action_link };
}
