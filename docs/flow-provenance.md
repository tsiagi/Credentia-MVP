# Flow — Provenance-Native Work Tracking

A project-management module that is architecturally distinct from Asana / Monday.
Instead of a status dropdown, **every work-item state carries an explicit trust
tier** — the same verified-vs-inferred boundary that defines the parent product.

> Preview route: **`/dev/flow`** (signed in). Reads/writes your real, RLS-scoped org data.

---

## The three tiers (structural, not a label)

| Tier | Meaning | Where it lives |
|------|---------|----------------|
| **ATTESTED** | Backed by a linked evidence artifact (merged PR, deploy id, file, signed approval, webhook). **Cannot be set without an artifact reference.** | `flow_transition_events` (ledger), `artifact_id` not null |
| **ASSERTED** | Self-reported by the owner. Fast, but explicitly flagged unverified. The default for any manual status change. | `flow_transition_events` (ledger) |
| **INFERRED** | AI-generated (predicted slip, risk flag, dependency bottleneck, status suggestion). **Never auto-promoted.** | `flow_inferences` (a **separate quarantine store**) |

The separation is **physical**. The canonical ledger only ever holds
`ATTESTED | ASSERTED`. AI output lives in its own table and crosses into the
record only when a human explicitly **promotes** it (→ ASSERTED, tagged with the
originating inference id).

---

## Data model (`supabase/flow-provenance.sql`)

```
flow_boards ──┬── flow_columns        configurable states; required_tier gates entry
              ├── flow_items          identity only — NO status column
              ├── flow_evidence_artifacts   what makes a transition ATTESTABLE
              ├── flow_transition_events    ← APPEND-ONLY LEDGER (the source of truth)
              └── flow_inferences           ← QUARANTINE (the only home of INFERRED)

flow_item_state (view)   current state = projection over the ledger (security_invoker)
```

### Why there's no `status` column on `flow_items`
Current state is a **projection** over the append-only ledger (the
`flow_item_state` view picks the latest `create`/`status` event per item). Scope
churn becomes a first-class audit trail instead of lost history.

---

## The guarantees, and where they're enforced

| Guarantee | Enforcement (server-side, not UI) |
|-----------|-----------------------------------|
| Can't mark ATTESTED without an artifact | `CHECK (provenance_tier <> 'ATTESTED' OR artifact_id IS NOT NULL)` **and** the `flow_record_transition` RPC |
| Evidence-gated columns | RPC rejects entering a `required_tier='ATTESTED'` column without an artifact |
| Ledger is append-only | `BEFORE UPDATE OR DELETE` trigger raises; no client `UPDATE`/`DELETE` policy |
| Clients can't forge ledger rows | **No** client `INSERT` policy on `flow_transition_events` — the only writer is the `SECURITY DEFINER` RPC |
| AI never lands in the record | `flow_inferences` is written by the **service-role server route only**; promotion is the one bridge, and it writes ASSERTED tagged with `source_inference_id` |
| Tenant isolation | every table is `org_id`-scoped via RLS; the projection view uses `security_invoker` so it inherits the caller's RLS |

All of these are verified against the live DB — e.g. an `INSERT` of an ATTESTED
event with a null artifact is rejected by the `CHECK`, and an `UPDATE` of any
ledger row is rejected by the trigger.

---

## Signature feature — Confidence-Weighted Burndown

`GET /api/flow/burndown?board_id=…` returns two series computed from the ledger:

- **Attested progress** (solid line) — only ATTESTED completions reduce remaining work.
- **Asserted progress** (dashed line) — ASSERTED + ATTESTED completions.

The gap between the lines is the risk signal, labelled in the UI:
**"X points of unverified progress."**

The seed produces a deliberate gap:

```
committed            40 pts
attested done        16 pts   (artifact-backed → "Shipped · Verified")
asserted-only done    8 pts   (self-reported   → "Done · Self-reported", no evidence)
⇒ gap                 8 pts   of unverified progress
```

---

## API surface

| Endpoint | Purpose |
|----------|---------|
| `flow_record_transition` (RPC) | the only canonical write path; gates evidence server-side |
| `flow_promote_inference` (RPC) | promote a quarantined inference → ASSERTED, traceable to source |
| `GET /api/flow/burndown` | both burndown series + the gap |
| `POST /api/flow/inferences/generate` | service-role writer into the quarantine (never the ledger) |

Client data layer: `lib/flow.ts`. UI: `components/flow/*` — note the inference
quarantine (`InferenceSidebar`) is a **separate component tree** from the board.

---

## Rebuilding from source

The schema + seed are already applied to the live Credentia project. To
reproduce on another database:

```bash
# applies supabase/flow-provenance.sql then supabase/flow-seed.sql
npm run db:migrate:flow
```

(Requires `SUPABASE_DB_URL` or `SUPABASE_DB_PASSWORD` in `.env.local`, same as
the other `db:*` scripts.)
