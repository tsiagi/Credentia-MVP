# Credentia — Enterprise Readiness Plan

_Owner: enterprise-planner. Re-audited each time a batch closes._
_Last updated: 2026-06-19._

## Authoritative decisions

- **Design system:** Cairn (`styles/cairn/`) is the source of truth for shell, accent (terracotta), surfaces, and type. The indigo/violet brief in `CLAUDE.md` is superseded for shell/accent.
- **Trust language (non-negotiable):** verified = **blue** (`--verified-*`) + `ShieldCheck`; AI = **amber** (`--inferred-*`) + `Sparkles`. Controlled centrally in `styles/cairn/tokens/colors.css`. Never hardcode in a component.

## Enterprise-readiness scorecard

| Dimension | State | Notes |
|---|---|---|
| Visual cohesion | 🟡 Partial | Cairn tokens used widely via inline `style`, but no shared shell/primitive layer → drift risk. |
| Trust language | 🟢 Strong | Tokenized + iconed across ~40 files; now blue/amber. |
| Component reuse | 🔴 Weak | `components/ui/` has only `motion.tsx`. No Button/Card/Badge/etc. |
| States (load/empty/error) | 🟡 Unknown | Present ad hoc (e.g. workspace skeleton). Audit per page. |
| Accessibility | 🟡 Unknown | Focus ring token exists; icon-button labels/contrast unverified. |
| Performance | 🟡 Risk | `CredentiaSite.tsx` is 2,992 lines, `"use client"` monolith holding marketing + app. |
| Consistency | 🟡 Partial | Type/spacing tokens exist; enforcement is manual. |

## Hard boundaries (encoded in every batch)

- `app/page.tsx` and marketing sections of `CredentiaSite.tsx` are **off-limits**. The marketing/app boundary runs *through* `CredentiaSite.tsx` — Batch 2 maps it before anyone edits it.
- No changes to data-fetching, Supabase queries, or RLS for redesign work. Presentation only.
- Never merge or relabel verified vs AI-inferred data.
- Check `components/` before creating anything new.

---

## Batches

### Batch 0 — Trust-color tokens → blue/amber ✅ DONE (2026-06-19)
- **Goal:** Make trust language spec-compliant in one place.
- **Done:** `--verified-fg/bg` → blue, `--inferred-fg/bg` → amber (light + dark) in `colors.css`; decision recorded in `CLAUDE.md`. All ~40 consuming components inherit it.
- **tester:** confirm build passes; spot-check a verified badge renders blue + shield and an AI badge renders amber + sparkle, visually distinct, in both themes.

### Batch 1 — Shared UI primitives (foundation)  → `coder`
- **Goal:** Build the missing `components/ui/` primitives on Cairn tokens so pages stop hand-rolling markup.
- **Files (new):** `components/ui/Button.tsx`, `Card.tsx`, `Badge.tsx` (incl. `VerifiedBadge`/`AIEstimateBadge` presets), `StatusPill.tsx`, `PageHeader.tsx`, `DataTable.tsx`, `Modal.tsx`, `Toast.tsx` (+ provider), `Skeleton.tsx`, `EmptyState.tsx`. Reuse existing `ui/motion.tsx`.
- **Primitives used:** n/a (this batch builds them).
- **States required:** Button loading spinner + `active:scale-[0.98]`; DataTable skeleton + empty-with-CTA; Modal scale-in + backdrop blur; Toast top-right slide-in, 4s auto-dismiss (replaces any `alert()`).
- **Trust checks:** `VerifiedBadge` uses `--verified-*` + `ShieldCheck`; `AIEstimateBadge` uses `--inferred-*` + `Sparkles`. No raw hex.
- **Handoff:** tester unit-tests primitives (render, variants, a11y: focus ring, aria on icon-only buttons). ux-reviewer defers until Batch 3.

### Batch 2 — Decompose & map `CredentiaSite.tsx`  → `coder` (mapping) + `enterprise-planner` (re-plan)
- **Goal:** Identify which sections are marketing (off-limits) vs authenticated app, so later batches edit safely.
- **Output:** a section map (route/state → component → marketing|app) appended here. No visual edits yet — extraction only where it clarifies the boundary.
- **Boundary:** do not restyle marketing. Flag any shared component used by both.

### Batch 3 — App shell (sidebar + content frame)  → `coder`
- **Goal:** One consistent authenticated shell across roles: Cairn sidebar (collapsible on mobile), role badge + user, `PageHeader`, `max-w-7xl mx-auto px-6 py-8`, `space-y-6`, page fade-in.
- **Primitives:** PageHeader, Button, Badge.
- **States:** nav active state, skeleton on first load.
- **Handoff:** tester (renders per role, no cross-org leakage in nav data); ux-reviewer walks "does every page feel like one product."

### Batch 4 — Employee dashboard  → `coder`
### Batch 5 — Manager dashboard (incl. attestation/verification queue)  → `coder`
### Batch 6 — Executive dashboard (`components/executive/*`, 19 files; org tree, comp intelligence)  → `coder`
### Batch 7 — Admin panels (provisioning, lifecycle, templates, integrity monitor, compliance export)  → `coder`
### Batch 8 — Verification flows + public profile (`app/p/*`)  → `coder`
### Batch 9 — Settings & privacy controls  → `coder`

_For each of Batches 4–9 (defined in detail when reached):_
- Rebuild presentation on Batch 1 primitives + Cairn tokens; remove bespoke inline markup where a primitive fits.
- Required states: skeleton loading, empty-with-CTA, error.
- Trust checks: verified blue+shield / AI amber+sparkle wherever both appear; AI strings framed as estimate/suggestion.
- No data-fetching / RLS changes.
- Handoff: tester (build, states, trust grep, org-scope) → ux-reviewer (role journey) → planner re-audit.

### Parallel track — Per-user agent harness  → `context-architect` then `coder`
- Provenance-preserving context assembly, `ai_inference_*`-only write path, server-side keys, audit + `org_id` RLS. Designed before any code that constructs model input. Independent of the redesign batches.

---

## Sequencing

```
Batch 0 ✅ → Batch 1 (primitives) → Batch 2 (map monolith) → Batch 3 (shell)
          → Batches 4–9 page-by-page → re-audit
Agent harness track runs in parallel, gated by context-architect.
```

## Next action
Batch 1 (build `components/ui/` primitives) is unblocked and is the highest-leverage foundation. Hand to `coder`.
