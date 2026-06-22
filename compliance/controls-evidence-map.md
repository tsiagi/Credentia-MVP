# SOC 2 controls → evidence map

Maps SOC 2 Trust Services Criteria (Security/Common Criteria, the default scope) to the Credentia control that satisfies it and where the auditor's evidence lives. "Status" reflects engineering reality today; "gap" items are the work to close before a Type II window.

> Use this as the seed for your compliance platform (Vanta/Drata/Secureframe). Most CC items below are partially auto-collected from GitHub/Vercel/Supabase/Workspace once connected.

## Implemented (evidence exists in-repo / in-platform)

| TSC area | Control | Evidence | Status |
|---|---|---|---|
| CC6.1 Logical access | Multi-tenant RLS scoped by `org_id` on every table | `supabase/rls-policies.sql`, `supabase/*.sql`; live `pg_policies` | ✅ |
| CC6.1 | Role/column authZ; `superadmin` not self-assignable | `guard_profiles_sensitive_columns()` (`security-fix-3`) | ✅ |
| CC6.1 | Verified vs. AI-inferred separation + single attestation writer | `docs/verification-architecture.md`, `promote_candidate()` | ✅ |
| CC6.3 | Least-privilege secrets; service keys server-only | `lib/supabase-admin.ts`; audit finding #3/#4 fixes | ✅ |
| CC6.6 | Encryption in transit (TLS) + at rest (provider AES-256) | Supabase/Vercel platform docs | ✅ |
| CC6.6 | Field-level encryption of sensitive secrets | `lib/crypto.ts`; `organizations.scim_secret` (encrypted) | ✅ |
| CC6.7 | Per-org SCIM secret, timing-safe compare | `app/api/provision/scim/route.ts`; `security-fix-10` | ✅ |
| CC7.2 Monitoring | Append-only audit trail of significant actions | `audit_log` table; `lib/audit.ts`; `security-fix-6` | ✅ |
| CC7.2 | Per-user rate limiting on costly endpoints | `lib/rate-limit.ts` | ✅ (needs prod env key) |
| CC8.1 Change mgmt | PR-based change flow; protected `master`; migrations + verification scripts | GitHub PRs; `supabase/`, `supabase/tests/` | ✅ |
| CC C1 (Confidentiality) | Data retention + right-to-be-forgotten | `data-lifecycle-1`; `forget_subject()`, `/api/dsr/erase` | ✅ |
| CC4.1 | Independent security review w/ tracked remediation | The frontend→DB audit + per-finding fix commits | ✅ |

## Gaps to close before / during the Type II window

| TSC area | Control needed | Owner | Status |
|---|---|---|---|
| CC6.1 | Enforce MFA on GitHub, Vercel, Supabase, Google Workspace, Upstash, Anthropic | Ops | ☐ |
| CC6.2/6.3 | Quarterly access reviews (who has prod/admin access) + offboarding checklist | Ops | ☐ |
| CC1.x | Org policies: InfoSec, Acceptable Use, Access Control, Incident Response, Vendor Mgmt, BCP/DR, SDLC, Data Retention | Compliance platform templates | ☐ |
| CC7.3/7.4 | Documented incident-response runbook + on-call + breach notification | Ops | ☐ |
| CC7.1 | Vulnerability management: dependency scanning (Dependabot), periodic pen test cadence | Eng | ☐ (audit was a start) |
| CC9.2 | Vendor management: DPAs + SOC 2 reports collected for all subprocessors | Compliance | ☐ (see `subprocessors.md`) |
| CC2.x | Security awareness training (annual) + acknowledgement | Ops | ☐ |
| CC6.6 | Secret rotation runbook + (optional) dedicated secrets manager | Eng | ☐ |
| A1.x (if Availability in scope) | Backups + restore test, uptime monitoring | Eng | ☐ |
