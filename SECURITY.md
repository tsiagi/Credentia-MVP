# Security at Core-Roborate

Core-Roborate is a multi-tenant workforce-verification platform. This document summarizes our security posture and how to report issues. It also serves as evidence for security reviews and the SOC 2 program (see [`compliance/`](compliance/)).

## Reporting a vulnerability
Email **security@core-roborate.example** (replace with the real alias) with details and reproduction steps. Please do not open public issues for security reports. We aim to acknowledge within 2 business days.

## Architecture controls (implemented)
- **Multi-tenant isolation** — Postgres Row Level Security on every table, scoped by `org_id`; cross-tenant reads/writes are denied by policy, not by application code alone.
- **Verified vs. AI-inferred separation** — human-attested facts (`verified_*`) and model output (`ai_inference_*`) live in separate tables and are never co-mingled; promotion to verified happens only through an audited, server-side attestation boundary.
- **AuthZ at the data layer** — role/manager/leader scoping via RLS helper functions; sensitive columns (role, org, lifecycle, billing) are additionally guarded by triggers. Privileged role grants (`superadmin`) are not self-assignable.
- **Server-only secrets** — Supabase service-role key and the Anthropic key are used only in server route handlers; never exposed via `NEXT_PUBLIC_` or shipped to the browser.
- **Field-level encryption at rest** — sensitive secrets (e.g. per-tenant SCIM tokens) are stored AES-256-GCM encrypted with a key held only in the server environment (never in the database).
- **Append-only audit trail** — significant actions write to `audit_log`; inserts are constrained to the acting user; clients cannot update or delete log rows.
- **Per-user rate limiting** — expensive/abusable endpoints (AI generation, exports) are rate-limited per user (Upstash sliding window).
- **Data lifecycle** — opt-in retention windows with an automated purge of re-derivable AI data; right-to-be-forgotten via subject anonymization that preserves immutable attestations in de-identified form.
- **Encryption in transit / at rest** — TLS everywhere; database encrypted at rest by the platform provider (AES-256).

## Change management
- All changes land via pull request on GitHub; `master` is the production branch and is protected.
- Production deploys are built by Vercel from `master`.
- Database changes are applied as idempotent, source-controlled SQL migrations under `supabase/`, each with a rolled-back verification script under `supabase/tests/`.

## Subprocessors
See [`compliance/subprocessors.md`](compliance/subprocessors.md).
