# SOC 2 kickoff

Practical plan to get Core-Roborate from "architecturally sound" to a SOC 2 report. Scope assumption: **Security (Common Criteria)** first; add Confidentiality and Availability if customers require them.

## The fastest path (80/20)
1. **Pick a compliance-automation platform** — Vanta, Drata, or Secureframe. They provide policy templates and auto-collect evidence from GitHub, Vercel, Supabase, Google Workspace, and (most) your subprocessors. This converts SOC 2 from a project into a checklist and is the single biggest accelerator.
2. **Connect integrations** — GitHub (change mgmt, branch protection), Vercel (deploys), Supabase (DB), identity provider / Google Workspace (MFA, access), Upstash/Anthropic where supported.
3. **Adopt the policy set** from the platform templates (see gaps in [`controls-evidence-map.md`](controls-evidence-map.md)); have the team acknowledge them.
4. **Close the technical gaps** (MFA everywhere, access reviews, incident-response runbook, dependency scanning) — most are config + process, not code.
5. **Collect subprocessor DPAs + SOC 2 reports** ([`subprocessors.md`](subprocessors.md)); enable Anthropic zero-retention.
6. **Type I** (point-in-time readiness assessment) with an auditor/CPA firm.
7. **Start the Type II observation window** (commonly ~3 months minimum) — this is the long pole, so begin collecting evidence early; the automation platform does this continuously.

## Who does what
- **Engineering:** technical controls (most already done — see evidence map), dependency scanning, secret rotation runbook, backup/restore test.
- **Ops/Founders:** tool procurement, MFA enforcement, access reviews, training, incident-response ownership, auditor selection.
- **Compliance owner:** policies, vendor management/DPAs, evidence review.

## What's already in your favor
The independent security audit (per-finding remediation, all verified) plus the implemented controls in [`controls-evidence-map.md`](controls-evidence-map.md) cover a large share of the CC6/CC7/CC8 technical criteria. Supabase and Vercel are themselves SOC 2 — you inherit their infrastructure controls as subservice organizations (collect their reports).

## Artifacts in this folder
- [`subprocessors.md`](subprocessors.md) — subprocessor list + DPA action items (also needed for the customer DPA).
- [`controls-evidence-map.md`](controls-evidence-map.md) — TSC → control → evidence, with the remaining gaps.
- [`/SECURITY.md`](../SECURITY.md) — public security posture + vulnerability reporting.

> These are starting templates grounded in the current implementation — not a substitute for an auditor. Validate scope and control language with your chosen CPA firm / platform.
