# Subprocessor list

Core-Roborate uses the following subprocessors to deliver the service. This list backs our customer DPA; notify customers before adding or replacing a subprocessor per the DPA's change-notification terms.

> Replace bracketed items with verified details before publishing. Confirm each provider's current DPA, region options, and compliance reports during the SOC 2 kickoff.

| Subprocessor | Purpose | Data processed | Region | DPA / compliance |
|---|---|---|---|---|
| **Supabase** | Primary database (Postgres + RLS), auth, storage | All tenant application data, PII (names/emails), auth identities | `us-east-2` (current single region) | Supabase DPA; SOC 2 Type II available — collect report |
| **Vercel** | Application hosting, serverless/edge functions, CDN | Request data, server-side processing; no primary datastore | `iad1` (functions) | Vercel DPA; SOC 2 Type II available — collect report |
| **Anthropic** | AI inference (Claude) for advisory/inference outputs | Verified employee data sent server-side to generate inferences | [confirm region/handling] | Anthropic DPA; **request zero-retention / no-training** for API traffic |
| **Upstash** | Redis (REST) for per-user API rate limiting | Rate-limit counters keyed by user id (no PII content) | [confirm region — match data residency] | Upstash DPA — collect |

## Action items (kickoff)
- [ ] Sign/obtain a DPA from each subprocessor above.
- [ ] **Anthropic:** enable zero-retention / no-training for API data and record it here (strong DPA line + sales point).
- [ ] Verify each subprocessor's hosting region aligns with stated data residency (currently US).
- [ ] Add any future providers (transcription, email/notifications, error monitoring, analytics) before they touch customer data.
- [ ] Publish the customer-facing version (public page or DPA exhibit) and wire change-notification.
