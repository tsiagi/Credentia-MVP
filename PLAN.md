# Credentia — Enterprise Readiness Plan

_Owner: enterprise-planner. Re-audited each time a batch closes._
_Last updated: 2026-06-19 (Batch 1 closed; messaging initiative shipped M1/M2/M3/M5/M6)._

## Authoritative decisions

- **Design system:** Cairn (`styles/cairn/`) is the source of truth for shell, accent (terracotta), surfaces, and type. The indigo/violet brief in `CLAUDE.md` is superseded for shell/accent.
- **Trust language (non-negotiable):** verified = **blue** (`--verified-*`) + `ShieldCheck`; AI = **amber** (`--inferred-*`) + `Sparkles`. Controlled centrally in `styles/cairn/tokens/colors.css`. Never hardcode in a component.

## Enterprise-readiness scorecard

| Dimension | State | Notes |
|---|---|---|
| Visual cohesion | 🟡 Partial | Cairn tokens used widely via inline `style`, but no shared shell layer yet → drift risk (Batch 3). |
| Trust language | 🟢 Strong | Tokenized + iconed across ~40 files; now blue/amber. |
| Component reuse | 🟢 Improving | Batch 1 shipped the `components/ui/` primitive layer (Button, Card, Badge + trust presets, StatusPill, PageHeader, DataTable, Modal, Toast, Skeleton, EmptyState). Pages must now adopt them (Batches 3–9). |
| States (load/empty/error) | 🟡 Unknown | Present ad hoc (e.g. workspace skeleton, messaging now full-coverage). Audit per page. |
| Accessibility | 🟡 Unknown | Focus ring token exists; icon-button labels/contrast unverified outside messaging. |
| Performance | 🟡 Risk | `CredentiaSite.tsx` is ~2,992 lines, `"use client"` monolith holding marketing + app. |
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

### Batch 1 — Shared UI primitives (foundation) ✅ DONE (2026-06-19)  → `coder`
- **Goal:** Build the missing `components/ui/` primitives on Cairn tokens so pages stop hand-rolling markup.
- **Done:** Shipped `components/ui/`: `cn.ts`, `Button.tsx` (4 variants × 3 sizes, loading spinner, `active:scale-[0.98]`), `Card.tsx` (+ Header/Title/Description/Body, `interactive` lift), `Badge.tsx` (+ `VerifiedBadge`/`AIEstimateBadge` presets), `StatusPill.tsx`, `PageHeader.tsx`, `DataTable.tsx` (sticky header, click-to-sort, skeleton rows, empty-with-CTA), `Modal.tsx` (portal, backdrop blur, scale-in, ESC, scroll-lock), `Toast.tsx` (`ToastProvider` + `useToast`, top-right slide-in, 4s auto-dismiss), `Skeleton.tsx`, `EmptyState.tsx`, `index.ts` barrel. Supporting CSS (button variants/hover, skeleton pulse, toast slide-in) added to `styles/cairn/tokens/base.css`, all reduced-motion gated.
- **Trust checks:** trust color appears ONLY via `--verified-*`/`--inferred-*` tokens; `VerifiedBadge` = blue + `ShieldCheck`, `AIEstimateBadge` = amber + `Sparkles`. No raw hex.
- **Verification:** `tsc --noEmit` exit 0; ESLint clean on all 12 Batch 1 files. (Pre-existing `set-state-in-effect` errors in `motion.tsx` remain — unrelated tech debt, file unchanged.)

### Batch 2 — Decompose & map `CredentiaSite.tsx`  → `coder` (mapping) + `enterprise-planner` (re-plan)
- **Goal:** Identify which sections are marketing (off-limits) vs authenticated app, so later batches edit safely.
- **Output:** a section map (route/state → component → marketing|app) appended here. No visual edits yet — extraction only where it clarifies the boundary.
- **Boundary:** do not restyle marketing. Flag any shared component used by both.

### Batch 3 — App shell (top-nav + content frame) ✅ DONE (2026-06-19)  → `coder`
- **Decision:** kept the existing **horizontal top-nav + mobile drawer** topology (restyle-in-place); a true left `w-64` rail is deferred to a post-Batch-9 layout batch (converting now would rewrite every view's width contract). Detailed spec in "Batch 3 — app shell (detailed plan)" section below.
- **Done (all in `AppShell` + `screen === "app"` arm of `CredentiaSite.tsx`):** width → `max-w-7xl mx-auto px-6 py-8` for standard pages, `isCommandCenter` (exec/HR) stays full-width; desktop nav active/hover + `aria-current`; user menu → ghost `Button`s + neutral role `Badge`; mobile drawer active left-bar + focus rings; content frame → `PageHeader` (title from nav label) + `space-y-6` + per-tab `cairn-reveal` fade-in; first load → `Skeleton`. Added `--accent-ink` token. Marketing/`nav[]` data/role map/`supabase.*` untouched.
- **Verification:** tester PASS (tsc + `npm run build` green; 7 eslint errors, all pre-existing; all six roles' nav/dashboard wiring intact; marketing unchanged; no new fetches).
- **ux-review → HOLD→fixed→SHIP:** two P1s fixed before close — (1) active top-nav pill failed WCAG AA in both themes → switched to the drawer's soft-fill `--accent-soft` + `--accent-text` idiom (AA-legible, now one consistent active style); (2) nav vanished 768–1024px (`md:hidden` toggle vs `lg:flex` nav) → toggle aligned to `lg:hidden`. tsc clean, error count unchanged.
- **Follow-ups (P2/P3, non-blocking → planner):** user-menu trigger needs `aria-haspopup`/`aria-expanded`/`aria-label` + the dropdown should be a keyboard `role="menu"` with Escape-to-close; accent hue (periwinkle) sits visually near verified-blue — keep distinct; **`CLAUDE.md` still calls the accent "terracotta" but the live token is periwinkle — stale, fix**; `PageHeader` title falls back to empty for future menu-only tabs; shorten the 0.55s tab fade.

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

## Feature initiative — Seamless (Slack-like) messaging + online profiles

**Request (2026-06-19):** make `components/messaging/ChatInterface.tsx` feel as seamless as Slack, and add **online profiles** (presence + profile cards).

**Hard constraints (carried into every batch):** multi-tenant isolation (all reads/writes `org_id`-scoped; every Realtime channel namespaced `org:${orgId}:…`, never global); trust boundary intact (preserve `save_to_agent_memory` "Off the Record"/Learning affordance on `--inferred-*` + `Sparkles`/`EyeOff`; presence/identity is NEITHER verified nor AI-inferred → neutral tokens only, never trust tokens/icons); audit significant actions; service-role key server-side; reuse Batch 1 primitives; any model-input/`ai_inference_*` work routes through `context-architect` first.

### Sequenced batches
| Batch | Goal | Risk | Status |
|---|---|---|---|
| **M1** | Rebuild ChatInterface on Batch 1 primitives; message grouping + day dividers; load/empty/error states | presentation-only | ✅ shipped |
| **M2** | Live delivery via Realtime `postgres_changes` (per-org-per-conversation channel) | client channel, no schema | ✅ shipped |
| **M3** | Presence/online status via ephemeral Realtime Presence (per-org channel) | ephemeral, no schema | ✅ shipped |
| **M4** | Unread counts + read state | **migration required** | ✅ shipped (migration applied to live DB 2026-06-19) |
| **M5** | Online profile cards (hover/click identity + presence) | presentation-only | ✅ shipped |
| **M6** | Typing indicators via Realtime broadcast | presentation, no schema | ✅ shipped |
| **M7** | Polish, a11y, perf, channel-leak regression guard + P1 UX fixes | presentation-only | ✅ shipped (tester PASS, ux SHIP) |

### Shipped (M1/M2/M3/M5/M6) — 2026-06-19
- **New files:** `lib/messaging-format.ts` (pure grouping/relative-time), `lib/presence.ts` (`joinOrgPresence` on `org:${orgId}:presence`), `components/messaging/{PresenceDot,ProfileCard,ConversationListItem,MessageGroup,MessageComposer}.tsx`.
- **Changed:** `lib/messaging.ts` (`subscribeToMessages`, `subscribeToTyping`, `conversationChannelName`), `components/messaging/ChatInterface.tsx` (full rebuild on primitives, live subscription with optimistic-echo dedupe, presence, typing, near-bottom-only auto-scroll, reconnecting `StatusPill`), `components/CredentiaSite.tsx` (wrapped `AppShell` in `<ToastProvider>`), `styles/cairn/tokens/base.css` (typing-dot animation).
- **tester:** PASS — tsc/eslint clean; 10/10 grouping unit tests; all 3 `.channel()` sites org-namespaced; postgres_changes filter `conversation_id=eq.${id}`; `profiles` select still `org_id`-scoped + `neq(self)`; presence/identity uses neutral tokens (no trust token/icon); channel teardown on switch/unmount; optimistic dedupe by id; no schema/RLS/`ai_inference_*`.
- **ux-reviewer:** SHIP (no P0). Trust boundary discipline called out as excellent; per-message memory indicator survives grouping; auto-scroll respects the reader; reduced-motion handled.

### ✅ Live DB changes applied (2026-06-19, project `plepkdgxhrgptczzpbkp`)
- **Realtime on `messages`:** `messages` added to the `supabase_realtime` publication (M2 live delivery active). RLS still scopes delivered rows to participants. Mirrored in `supabase/messaging-read-state.sql`.
- **M4 read-state:** `conversation_participants.last_read_at timestamptz` + own-row UPDATE policy `"cpart: self mark read"` (`profile_id = auth.uid()` in both `using` and `with check`). Verified live; security advisor surfaced only pre-existing warnings (none from this migration).

### Outstanding messaging work
- **M5b (deferred):** `department` on profile card needs a `profiles.department` column or security-definer view — planner first.
- **The four prior P1s are RESOLVED in M7** (id-based presence, reconnect-toast debounce, searchable PeoplePicker, cold-start CTA → picker).
- **Residual P3 polish — ✅ DONE (2026-06-19):** (1) dark-mode "Online" contrast → added theme-aware `--presence-online`/`--presence-offline` tokens in `colors.css` (light olive-600 / dark olive-300); `PresenceDot` + PeoplePicker "Online" text consume them. (2) PeoplePicker active row now uses `--accent-soft` + inset `--accent-line` ring (was faint `--surface-2`). (3) Picker selection now shows a per-row spinner and stays open until `startConversation` settles (`onSelect` may return a promise). tsc + eslint clean.

---

## Sequencing

```
Batch 0 ✅ → Batch 1 ✅ → Batch 2 (map monolith) → Batch 3 (shell)
          → Batches 4–9 page-by-page → re-audit
Messaging initiative: M1–M7 ✅ COMPLETE (realtime + read-state live; a11y/perf polished; P3 polish done).
Agent harness track runs in parallel, gated by context-architect.
```

## Next action
Batch 1 ✅; messaging **M1–M7 ✅ COMPLETE**; **Batch 2 ✅** (section map below); **Batch 3 ✅ DONE (2026-06-19)** — app shell restyled (tester PASS; ux SHIP after two P1 fixes). Open:
1. **Batch 4** (employee dashboard) — next redesign step, unblocked; rebuild on Batch 1 primitives within the now-restyled shell.
2. **Batch 3 P2/P3 follow-ups** — user-menu aria/keyboard menu, accent-vs-verified-blue distinctness, stale "terracotta" naming in `CLAUDE.md`, PageHeader title fallback, tab-fade duration (batch with a later polish pass).
3. **M5b** (`department` on profile card) — needs schema/view decision via planner, when wanted.

---

## Batch 2 — CredentiaSite.tsx section map (coder, 2026-06-19)

**File:** `components/CredentiaSite.tsx` (2,998 lines, single `"use client"` default export `CredentiaSite`). `app/page.tsx` renders `<CredentiaSite />` and nothing else — the marketing/app boundary lives entirely *inside* this one file, gated by a 3-value `screen` state.

### The boundary (where marketing ends and the app begins)

Root router `CredentiaSite()` (L2916) holds `const [screen, setScreen] = useState<"public" | "auth" | "app">("public")`. The final `return` (L2986–2996) is the switch:

| screen value | renders | classification |
|---|---|---|
| `"public"` | `<PublicSite onEnter={() => setScreen("auth")} />` (L2988) | **MARKETING — OFF-LIMITS** |
| `"auth"` | `<AuthScreen onBack=… onLogin={enterApp} />` (L2989) | **shared / gate** (sign-in only, no public signup) |
| `"app"` | `<ToastProvider><AppShell … /></ToastProvider>` (L2990–2993) | **APP** |

Transitions: `onEnter` (marketing → auth), `enterApp(role)` sets `screen="app"` (L2928–2931), session restore + `onAuthStateChange` flip straight to app on an existing session (L2933–2971), `handleSignOut` returns to `"public"` (L2973–2976).

**The single hard line for redesign work:** everything reachable only when `screen === "app"` (i.e. the entire `AppShell` subtree, L2640–2913, and every role view/panel it mounts) is editable. Everything reachable when `screen === "public"` (the `PublicSite` subtree, L446–1593 + the marketing-only helpers) is OFF-LIMITS. `AuthScreen` (L1597–1693) is the in-between gate.

### Section map

| Lines | In-file symbol | Class | Note |
|---|---|---|---|
| 1–63 | imports | shared | App component imports + Lucide icons. |
| 71–115 | types, `MOTIVATIONAL_MESSAGES`, `ROLE_LABELS`, theme consts | shared | App-domain types/constants (Role, settings, accent swatches). |
| 117–137 | `ProfileAvatar`, `ReportIdentity` | app | Avatar/identity chips; used by app views only. |
| 139–168 | `DashboardWelcome` | app | App dashboard greeting card (queries `profiles`). |
| 171–182 | `useThemeVars` | shared | Accent-override CSS vars; consumed by root router for both screens. |
| 185–216 | `VerifiedFactTag`, `SupportingMetricTag`, `TransparencyNote` | app | Trust/explainer chips for app data views. |
| 218–231 | **`Card`** (in-file) | **SHARED ⚠** | Generic card; used in app + auth screen (see flags). |
| 233–244 | `BackButton` | app | "Back to Dashboard" in AppShell. |
| 246–258 | `MobileNavToggle` | app | AppShell mobile sidebar toggle. |
| 260–444 | `Stat`, `Spark`, `TrendArrow`, `RiskPill`, `SectionHeader`, `ConfidenceBar`, `ValueScoreBar`, `EmployeeValueScoreCard`, `PromotionReadinessPanel`, `KIND_ICON` | app | App dashboard data primitives (value scores, promo readiness, sparklines). |
| **446** | `/* PUBLIC MARKETING SITE */` banner | — | **Marketing block starts here.** |
| 448–510 | `MktRoute`, `MKT_ROUTES`, `MAX_W`, `parseMktHash`, `mktScrollWhenReady`, marketing style helpers | marketing | Marketing hash-router plumbing. |
| 512–546 | `Reveal`, `CountUp` | marketing | Marketing scroll-reveal + count-up animations. ⚠ name-collision risk (see flags). |
| 548–553 | `MktCard` | marketing | Marketing-only card (distinct from in-file `Card`). |
| 555–659 | `PassportMock`, `FeedbackMock`, `AnalyticsMock`, `ValidationMock`, `RecruitMock` | marketing | Hero/feature mock visuals. |
| 661–692 | `MKT_FEATURES`, `MKT_STEPS`, `MKT_NAV`, `INDUSTRIES`, `MktLogo` | marketing | Marketing content data + logo. |
| 694–847 | `PageHero`, `MktHeader`, `MktFooter` | marketing | Marketing chrome (top nav + footer). |
| 848–1034 | `MktHero`, `MktFeatureShowcase`, `MktStatsBand`, `MktPillars`, `MktHomeCta` | marketing | Home page sections. |
| 1035–1119 | `MktPlatformPage` | marketing | /platform route. |
| 1121–1241 | `MktWhyPage` | marketing | /why route. |
| 1242–1325 | `MktDifferentPage` | marketing | /different route. |
| 1326–1429 | `MktEmployersPage` | marketing | /employers route. |
| 1430–1509 | `MktTransparencyPage` | marketing | /transparency route. |
| 1510–1535 | `VideoModal` | marketing | Marketing demo-video lightbox. |
| **1537–1593** | `PublicSite` | **marketing (root)** | Marketing route host (hash router → all `Mkt*` pages). **Entire marketing subtree roots here.** |
| 1595–1693 | `AuthScreen` | **shared / gate** | Sign-in screen; uses in-file `Card`. Not marketing, not app — the login gate. |
| 1694–1737 | `DEFAULT_SETTINGS`, `FEEDBACK_PROMPTS` | app | App settings/feedback constants. |
| **1738** | `/* APP VIEWS (role dashboards) */` banner | — | **App block starts here.** |
| 1740–1817 | `FeedbackCycleCard` | app | Employee/manager feedback cycle card. |
| 1818–1951 | `EmployeeView` | app | Employee dashboard (Batch 4 target). |
| 1952–2230 | `ManagerView` | app | Manager dashboard incl. AI insights (Batch 5 target). |
| 2231–2234 | `AdminView` | app | Admin dashboard wrapper → `AdminOrgControls` etc. (Batch 7). |
| 2235–2430 | `AttestationOutreachPanel` | app | Verification outreach (Batch 8). |
| 2431–2444 | `CompetencyMappingPanel` | app | Competency map panel. |
| 2445–2627 | `SettingsView` | app | Settings & privacy (Batch 9). |
| 2628–2639 | `NoOrgNotice` | app | Empty-state when user has no `org_id`. |
| **2640–2913** | **`AppShell`** | **app (root)** | **Authenticated shell**: header, role-based `nav[]`, mobile sidebar, tab router, role→dashboard map, `FloatingAssistant`. **Batch 3 primary target.** |
| 2915–2998 | `CredentiaSite` (default export) | **shared (router)** | Root: `screen` state, session restore/auth listener, theme, renders one of the three screens. |

**Counts:** marketing sections ≈ **23** (L446–1593 subtree); app sections ≈ **18** (helpers L117–444 + L1694–2913); shared/router/gate ≈ **6** (imports, types/consts, `useThemeVars`, in-file `Card`, `AuthScreen`, root `CredentiaSite`).

### Shared components used by BOTH sides (risk items — restyle with care)

1. **`Card` (in-file, L218–231) — the one true cross-cutting primitive.** Used **27×**. App side: DashboardWelcome (L158), app data primitives (L261, 331, 346, 394), all role views (L1792–2630), AppShell hero (L2716, 2831). Gate side: `AuthScreen` (L1640). **NOT used by any `Mkt*` marketing page** — marketing uses `MktCard` (L548) instead. So restyling in-file `Card` affects the **app + the sign-in screen**, never the marketing pages. Still: when Batch 3+ migrate to `components/ui/Card`, do it view-by-view; do not delete the in-file `Card` until every app + AuthScreen consumer is migrated, or the build breaks.

2. **`useThemeVars` (L171–182).** Consumed once by the root `CredentiaSite` wrapper `<div>` (L2926, 2980, 2987) that wraps *all three* screens. It only emits CSS custom props for a non-default accent — touching it would recolor marketing too. Treat as off-limits for Batch 3 (it is not shell-layout anyway).

3. **Name-collision trap (not a true shared component, but a footgun):** `Reveal` exists **twice** — the marketing-only in-file `function Reveal` (L512) and the app-side `import { Reveal as RiseIn }` from `@/components/ui/motion` (L27). They are different components; the app uses `<RiseIn>`, marketing uses `<Reveal>`. Do not "unify" them — restyling the in-file `Reveal` is a marketing edit and is OFF-LIMITS.

4. **Root `CredentiaSite` + `AuthScreen`** straddle the boundary by definition. The router is shared; `AuthScreen` is the gate. Both may receive light shell polish, but `AuthScreen` is not on a redesign batch yet — leave it unless a batch names it.

No app-side data primitive (`Stat`, `SectionHeader`, `ProfileAvatar`, `ConfidenceBar`, `TransparencyNote`, etc.) is used by marketing, and no `Mkt*` helper is used by the app. The boundary is clean apart from `Card`.

### Safe-extraction opportunities (DO NOT execute this batch — noted for planner)

- The **entire marketing subtree is already self-contained** under `PublicSite` (L1537) + its `Mkt*`/`Reveal`/`CountUp`/`MktCard`/`VideoModal` helpers (L446–1535). It has **zero inbound dependencies from the app** except sharing the file. It could be lifted wholesale into `components/marketing/PublicSite.tsx` (+ a small `marketing/` folder) with only the in-file `Card` needing a decision (marketing doesn't use it, so no shared dependency travels with it). This would shrink the redesign-editable file by ~1,150 lines and make "off-limits" enforceable by directory, not by line range.
- Similarly `AuthScreen` (L1597–1693) could move to `components/AuthScreen.tsx`.
- After extraction, `CredentiaSite.tsx` would reduce to the app shell + role views + router (~the part every redesign batch actually edits). **Extraction is a separate, planner-approved batch — not Batch 2 and not part of any visual batch.**

### Recommendation for Batch 3 (app shell)

- **Edit only inside `AppShell` (L2640–2913) and the root render's `screen === "app"` arm.** Everything at/after the `/* APP VIEWS */` banner (L1738) plus the app helpers above L446 is fair game; nothing in L446–1593 is.
- The shell to rebuild is the `<header>` + `nav[]` + mobile sidebar + tab content frame inside `AppShell`. Adopt Batch 1 primitives: `PageHeader` for the per-tab title bar (currently ad-hoc), `Button`/`Badge` for nav/user-menu affordances, role badge near the user menu (L2782–2809). Keep `max-w-6xl`/command-center width logic unless the brief changes it (note: CLAUDE.md says `max-w-7xl` — confirm with planner before widening, since `isCommandCenter` already goes full-width).
- **Do not touch in-file `Card` yet** — migrate role views to `components/ui/Card` in their own batches (4–9). For Batch 3, leave `Card` consumers as-is so AuthScreen + every view keep rendering.
- **Do not touch `useThemeVars`, the root router's three-way switch, the session/auth effect, or any `supabase.*` call** — those are data/routing, not presentation.
- Confirm the shell renders for all six roles via the `nav[]` builder (L2695–2706) and the `dashboard` role map (L2709–2724); superadmin/admin/exec/hr nav differs, so test each.

---

## Batch 3 — app shell (detailed plan, enterprise-planner, 2026-06-19)

Scope: restyle the authenticated shell ONLY — the `AppShell` function (`components/CredentiaSite.tsx` L2640–2913) and the `screen === "app"` render arm (L2990–2993). Presentation-only: the `nav[]` data builder (L2695–2706), the `dashboard` role map (L2709–2724), the load `useEffect` (L2655–2686), and every `supabase.*` / `fetch*` call stay byte-for-byte. We re-skin the chrome around them. Per-page dashboard internals (the role views, panels, ExecutiveDashboard, etc.) are Batches 4–9 and are NOT touched here beyond the shared in-file `Card` rule below.

### Reality check vs the brief (read first)
The Batch 3 goal line says "Cairn **sidebar** (collapsible on mobile)." The shell as built is NOT a left sidebar — it is a **centered horizontal top-nav** inside a sticky `<header>` (L2779–2781, `<nav className="hidden lg:flex … justify-center">`) plus a **mobile left drawer** (L2814–2820). Rebuilding it into a `w-64` fixed left rail is a layout rewrite that would ripple into every role view's width assumptions and the `isCommandCenter` full-width path. **Recommendation: keep the top-nav + mobile-drawer topology; do not convert to a left rail in Batch 3.** "Sidebar" in the goal is satisfied by the existing collapsible mobile drawer (which IS a left sidebar on small screens). A left-rail conversion, if still wanted, is its own planner-approved layout batch after the page batches land — flagged in "Deferred" below. This keeps Batch 3 tightly scoped and low-risk.

### (a) Width decision + rationale — RESOLVED
- **Standard pages → `max-w-7xl mx-auto px-6 py-8`.** Adopt the CLAUDE.md width. It applies to the header inner wrapper (L2767) and the content frame (L2822) on every non-command-center tab.
- **Command-center / executive path → stays full-width.** The `isCommandCenter` branch (`(role === "executive" || role === "hr") && tab === "dashboard"`, L2728) keeps `w-full` for the org tree / comp-intelligence canvas, which is designed edge-to-edge. Do not box it into `max-w-7xl`.
- **Header must match content.** Today the header uses `max-w-6xl` (L2767) and the content uses `max-w-6xl` (L2822); both move to `max-w-7xl` together so the logo/nav rail lines up with the content column. The header keeps its own horizontal padding (`px-4 sm:px-5` is fine to bump to `px-6` for alignment with content `px-6`).
- **Rationale:** `max-w-7xl` (1280px) is the brief's enterprise default and gives the data-dense dashboards more room than `6xl` (1152px) without going full-bleed; the executive command center genuinely needs full-bleed, so it is the one documented exception. One consistent inner width = the "one product" feel ux-reviewer checks for. Net change is two literals (`max-w-6xl` → `max-w-7xl`) plus a padding bump — minimal blast radius.

### (b) Concrete change list (tied to AppShell line areas)

**B3.1 — Header rail + width (L2766–2778)**
- L2767: `${isCommandCenter ? "w-full" : "max-w-6xl"} mx-auto px-4 sm:px-5` → `${isCommandCenter ? "w-full" : "max-w-7xl"} mx-auto px-6`. Keep `backdrop-blur` + `color-mix` bg (already Cairn-token-driven, L2766) — do not introduce raw hex.
- Logo block (L2769–2778): leave the `orgLogoUrl` / fallback `/cairn-logo-mark.svg` logic and the `MobileNavToggle` placement intact. Cosmetic only: ensure the wordmark uses `--ink` via existing class, no new colors.

**B3.2 — Desktop nav active/hover state (NavButton, L2732–2750)**
- Active state already fills with `var(--accent)` + `#fff` text (L2743–2745) — keep the active fill but make it spec-correct: replace the hardcoded `#fff` with `var(--accent-ink)` (the Cairn on-accent token) so dark-mode contrast is token-controlled, not hardcoded. (If `--accent-ink` does not exist, coder adds it to `colors.css` rather than hardcoding — flag to planner; do NOT inline a hex.)
- Add a **resting hover** for inactive items (currently none): on hover, inactive nav buttons get `background: var(--surface-2)` via a className hover rule, with `transition-colors duration-150`. Keep `var(--ink-2)` resting text.
- Add `aria-current="page"` when `active` (accessibility — currently missing). Keep `transition` → make it explicit `transition-colors duration-150`.
- The brief's "active item has left border accent" is a left-rail idiom; for the horizontal top-nav the **filled-pill active state is the correct equivalent** — keep the pill, do not bolt on a left border. The mobile drawer (vertical) MAY use a left-accent bar (see B3.4).

**B3.3 — User menu + role badge (L2782–2809)**
- The role label currently shows as plain `text-[11px]` text in the dropdown (L2796) and the trigger falls back to `roleLabel` only when `userName` is null (L2787). Add a **persistent role `Badge`** (Batch 1 `Badge`, neutral tone — role is identity, NEITHER verified NOR AI-inferred, so NEVER use trust tokens/icons) next to the user name in the dropdown header (L2794–2797), e.g. `<Badge tone="neutral">{roleLabel}</Badge>`. Keep the dropdown's `var(--surface)`/`var(--line)` tokens.
- Convert the two dropdown actions (Settings L2798–2801, Sign out L2802–2805) to Batch 1 `Button variant="ghost" size="sm" fullWidth` with `leadingIcon`. Sign out keeps subtle accent text via `variant="ghost"`; do NOT use `destructive` (sign-out is not destructive). Preserve the exact `onClick` handlers (`goToTab("settings")`, `onSignOut()`).
- Keep the click-away overlay (L2792) and `ChevronDown` rotation (L2788) as-is.

**B3.4 — Mobile drawer (L2814–2820)**
- Keep topology (left drawer, `top-14 sm:top-16`, `w-72`, click-scrim). Tokens already Cairn (`--surface`/`--line`).
- In the vertical `NavList` (L2752–2762), give the active item a 2px left-accent bar (token-driven `border-l-2` with `var(--accent)`) to satisfy the brief's "left border accent" idiom in the one place it belongs (the vertical list). Inactive items get the same `--surface-2` hover as desktop.
- Add focus rings: every nav button must show the Cairn focus ring on `:focus-visible` (token exists from Batch 1). `MobileNavToggle` already has `aria-expanded`/`aria-label` (L252–253) — leave it.

**B3.5 — Content frame: PageHeader adoption + spacing + fade-in (L2822–2899)**
- L2822 content wrapper: `max-w-6xl mx-auto px-5 py-6` → `max-w-7xl mx-auto px-6 py-8` (command-center branch unchanged at `w-full`).
- **Replace the hand-rolled `BackButton` + ad-hoc per-tab titling with `PageHeader`** for non-dashboard tabs. Currently L2824–2826 renders only a `BackButton`; individual tabs have no consistent title bar. For each non-dashboard, non-command-center tab, render `<PageHeader title={…} actions={<Button variant="ghost" leadingIcon={<ArrowLeft/>} onClick={() => setTab("dashboard")}>Back to Dashboard</Button>} />` at the top of the content column. Title strings are static labels derived from the existing `nav[]` entry for `tab` (reuse `nav.find(n => n.id === tab)?.label`) — presentation only, no new data. The dashboard tab keeps its existing "How decisions are made" intro `Card` (L2831–2839) and `DashboardWelcome` (L2840) — do NOT replace those in Batch 3 (they are content the page-batches own).
- Wrap each tab's content column in the page **fade-in**: apply `animate-in fade-in duration-200` (or the already-imported `RiseIn`, L27) to the `<main>` inner content keyed by `tab` so a tab switch re-triggers the entry. Reduced-motion already gated in Batch 1 CSS. Do not animate the sticky header.
- Section spacing: tabs that already use `space-y-6` (vault L2847, settings L2881) are correct — leave them. Ensure any tab lacking consistent vertical rhythm gets `space-y-6` on its wrapper. Do not restructure the conditional tab routing (the `{tab === "…" && …}` ladder L2827–2898) — only wrap/space it.

**B3.6 — First-load skeleton (L2724, dashboard area)**
- The role-map fallback when `!userId` is a bare `<div className="opacity-60 text-sm">Loading…</div>` (L2724) and the dashboard tab shows nothing until data resolves. Replace the bare "Loading…" with a **Batch 1 `Skeleton`/`SkeletonText` shell layout** (a couple of `Skeleton` blocks approximating the header + a card grid) so first paint is never a blank/spinner. This is the only "state" change in Batch 3 and it is presentation-only (driven by the existing `userId === null` gate). Do NOT add new fetches or loading flags — reuse the `userId`/`dashboard` ternary that already exists.

### (c) Batch 1 primitives → which hand-rolled markup they replace
| Current hand-rolled markup (line) | Replace with (Batch 1) |
|---|---|
| Dropdown Settings/Sign-out `<button>`s (L2798–2805) | `Button variant="ghost" size="sm" fullWidth` + `leadingIcon` |
| Plain role-label text in dropdown (L2796) | `Badge tone="neutral"` (identity → neutral, never trust tokens) |
| Bare `Loading…` div (L2724) + blank first paint | `Skeleton` / `SkeletonText` shell |
| Ad-hoc per-tab title absence + lone `BackButton` (L2824–2826) | `PageHeader` (title from `nav[]` label) with a `Button` ghost back-action |
| Inline `className` string-template branching for nav (L2739–2745) | `cn(...)` helper from `@/components/ui` for the conditional classes (keeps logic, removes string templating) |

Keep using: the in-file `Card` for the dashboard intro card (L2831) and superadmin card (L2716) **as-is** — do NOT migrate those to `components/ui/Card` in Batch 3 (Card migration is per-page, Batches 4–9; in-file `Card` must keep rendering for AuthScreen + all views until every consumer moves).

### (d) Explicit DO NOT TOUCH
- `app/page.tsx`, and anything in `CredentiaSite.tsx` L446–1593 (the `PublicSite` marketing subtree) — off-limits.
- The marketing-only in-file `Reveal` (L512); do NOT unify it with the app's `Reveal as RiseIn` (L27).
- `useThemeVars` (L171) and the three-way `screen` switch / session-restore effect / `onAuthStateChange` in root `CredentiaSite` (L2916+).
- The `nav[]` builder (L2695–2706) and `dashboard` role map (L2709–2724) **logic** — restyle the buttons they produce, never the role-gating conditions or which view mounts.
- Any `supabase.*`, `fetchOrgSettingsForUser`, `ensureUserSettings`, `getUserId` call, or the load `useEffect` (L2655–2686).
- The in-file `Card` (L218) — leave it and all consumers intact this batch.
- `FloatingAssistant` mount + its gating (L2902–2910) — not shell chrome we are reskinning; no behavior change.
- Trust language anywhere — the shell introduces no verified/AI badging; the role `Badge` is neutral by construction.

### (e) Handoff checks
**tester (must verify):**
- Build green: `tsc --noEmit` exit 0; ESLint clean on `CredentiaSite.tsx` (no new errors vs baseline; pre-existing `motion.tsx` errors are out of scope).
- Renders for **all six role contexts**: `superadmin`, `admin`, `manager`, `employee`, `former_employee` (i.e. `accountStatus.startsWith("former_")` → `plan` tab present), and the **executive view** (`executive`/`hr` → command-center full-width path). Confirm each role's `nav[]` produces the expected tabs and the active-pill renders.
- **No cross-org / data-layer change:** diff shows zero edits inside the load `useEffect`, `nav[]` builder, `dashboard` map conditions, or any `supabase.*` call. Nav data still derived purely from `role`/`accountStatus` — no new query, no `org_id` widening.
- Width: standard tabs render at `max-w-7xl`; executive dashboard tab is full-width (no `max-w-7xl` box around the org tree).
- States: first paint (userId null) shows `Skeleton`, never blank/spinner; tab switch shows fade-in (and respects reduced-motion).
- a11y: nav buttons expose `aria-current` when active and show a focus ring; icon-only `MobileNavToggle` keeps its `aria-label`; user-menu trigger is keyboard-operable and closes on Escape/click-away.
- Light + dark: active nav contrast comes from a token (`--accent-ink`), not hardcoded `#fff`; verify both modes.

**ux-reviewer (must simulate):**
- Walk each role's shell: does header + nav + content column read as one consistent product across roles and light/dark?
- Marketing **visually unchanged**: load `screen === "public"` and confirm the marketing site is pixel-identical (Batch 3 must not leak into `PublicSite`).
- The role appears as a neutral identity badge — confirm it does NOT read as a trust/verified signal (no shield, no blue, no sparkle).
- PageHeader back-action is discoverable and the per-tab title matches the nav label the user clicked.
- Command-center (executive dashboard) still uses the full canvas; no regression to the org-tree layout.

### Recommended order of operations (coder)
1. **B3.1 width literals** (header + content) — smallest, establishes the frame; verify both modes before proceeding.
2. **B3.2 desktop nav** active/hover/`aria-current` + `cn()` cleanup (add `--accent-ink` token first if missing — planner sign-off, no hex).
3. **B3.4 mobile drawer** active left-bar + hover + focus rings (mirrors B3.2 in the vertical list).
4. **B3.3 user menu** → `Button` ghost actions + neutral role `Badge`.
5. **B3.5 content frame** → `PageHeader` adoption + `space-y-6` audit + per-tab fade-in.
6. **B3.6 first-load skeleton** last (depends on the content frame being in place).
7. Run tester checklist; hand to ux-reviewer; planner re-audits + updates the scorecard (expect Visual cohesion 🟡→🟢 once the shell lands).

**Deferred (NOT Batch 3):** full left-rail (`w-64`) sidebar conversion — separate planner-approved layout batch after Batches 4–9, since it changes every view's width contract. Migrating in-file `Card` → `components/ui/Card` — happens per page in Batches 4–9.


---

## Verification pipeline — sequenced build (enterprise-planner, 2026-06-19)

> Source design: `docs/verification-architecture.md`. Anchored on `supabase/task-knowledge-agent.sql`, `supabase/task-verification-bridge.sql`, `supabase/passport-public.sql`, `lib/tasks.ts`, `lib/audit.ts`, `lib/passport.ts`, `lib/ai/persist.ts`.
>
> **SCOPE (product decision, 2026-06-19, REVISED — `promote_candidate()` is KEPT): the full architecture per `docs/verification-architecture.md` §4 is in scope.** `promote_candidate()` is the single, server-side, `SECURITY DEFINER` promotion boundary — the ONLY writer that sets a candidate to `attested` and the ONLY pipeline writer into `verified_*`. Two paths: (a) **human attest** (manager/leader/admin-hr with authority over the subject); (b) **active Overseer rule** (service-role, only when `lifecycle='active'`, re-checked under a row lock at call time — race-free kill-switch). Clients can `reject` candidates (RLS) but NEVER write `attested`. Existing manual paths (`guard_doc_verification`, `lib/tasks.ts`, `task-verification-bridge.sql`) keep running in parallel.
>
> **Overseer lifecycle `draft → shadow → active → (paused | retired)`.** Shadow proves context against human outcomes; promotion to `active` (auto-attest) requires BOTH the Q4 agreement gate AND explicit human enablement. Every auto-promotion is audited with rule version + proof-of-context. The kill-switch (pause) stops auto-promotion instantly. **Q5 auto-promotion ceiling is ENFORCED inside `promote_candidate()`** — active rules may auto-attest only low-stakes `target_kind in ('verified_task','achievement')` ≤ L2 backed by a `verified_task`; comp/promotion/rating/title kinds are permanently human-only via a denylist in the function.

### Settled policy inputs (do not re-litigate)
- **Q1** Org-policy evidence ingestion ON by default; work-context channels only (exclude personal 1:1 `conversations.kind='direct'` UNLESS task-linked). Per-conversation content-suppression always available; per-message suppression under org-level `privacy_mode` (`standard | strict`). Always-on means **ingestion only**, never always-on verification.
- **Q2** Evidence rows and un-promoted candidates are fully erasable (client delete under RLS for owner/manager+); frozen `verified_*` rows are anonymized not deleted via existing freeze paths.
- **Q3** Enable rule shadow→active = executive/admin; kill-switch (pause) = manager+ over own scope, admin/exec org-wide; rule-version approval = admin/exec.
- **Q4** Shadow→active gate: agreement ≥0.95 over ≥50 human-decided shadow decisions, ≥2 distinct attestors, ≥14 days (platform floor 0.90/30; org-configurable stricter). A live rule below 0.90 or with a dispute spike auto-pauses. These now **gate** promotion to `active`.
- **Q5** Hard auto-promotion ceiling ENFORCED in `promote_candidate()`: active rules may auto-attest only `target_kind in ('verified_task','achievement')` ≤ L2 backed by ≥1 `verified_task` evidence link; comp/promotion-readiness/rating/title kinds are permanently human-only (denylist in the function).
- **Q6** Reviewers see coarse **Low / Med / High** confidence band; employees see candidate **existence + evidence**, never a numeric score. **Never render a numeric probability anywhere in trust UI.**
- **Q7** Portable-credential provenance: `attest_method` (human vs overseer_rule) travels with an exported credential; default surface both, clearly labeled; never strip provenance.

### Cross-cutting invariants (apply to EVERY batch — restate in each handoff)
1. **`org_id` RLS** on every new table, reusing `current_org()`, `current_role_name()`, `is_manager_of()`, `is_org_leader_of()`, `is_company_user()`.
2. **Service-role key is server-side ONLY and is the only writer** to staging / inference (`ingestion_events`, `verification_candidates`, `candidate_evidence`, `overseer_*` proposals, shadow decisions). No `NEXT_PUBLIC_` service key. Pattern: `lib/ai/persist.ts` (admin client + `audit_log` insert).
3. **No client write of `state='attested'`** on `verification_candidates`. Client UPDATE policy permits only `pending|shadow_approved → rejected` (with `rejected_by`/`rejected_reason`). `attested` is reached ONLY through `promote_candidate()` (SECURITY DEFINER) — human-attest or active-rule path — which is also the only pipeline writer into `verified_*`.
4. **Audit every significant action**: `evidence_ingested`, `verification_candidate_staged`, `candidate_rejected`, `candidate_attested`, `candidate_auto_promoted`, `overseer_rule_proposed`, `overseer_shadow_decision`, `overseer_rule_enabled`, `overseer_rule_paused`.
5. **Provenance preserved**: candidate ↔ `candidate_evidence` ↔ `ingestion_events` ↔ source row, end to end.
6. **verified_* (blue) vs candidates/inference (amber) never merged or relabeled.** Tokens `--verified-fg/-bg` (blue, `ShieldCheck`) vs `--inferred-fg/-bg` (amber, `Sparkles`) from `styles/cairn/tokens/colors.css`. Never hardcode trust colors.
7. **Any model-input construction or `ai_inference_*`/candidate-payload shaping routes through `context-architect`** (harness boundary, output schema, provenance tagging, validation).
8. **Reuse Batch 1 UI primitives + Cairn tokens** for all review/oversight/Passport UI. No bespoke markup; check `components/ui/` first.
9. **Public RPC blindness:** `get_public_passport` must NEVER select from `verification_candidates`. Verify in the Passport batch.

---

### Batch sequence (dependency- and risk-ordered)

| # | Batch | Migration? | context-architect? | Risk | Depends on |
|---|-------|:---------:|:-------------------:|------|-----------|
| VP-1 | Additive staging schema + `ai_ingest_state` doc gate column + ingestion plumbing + read-only review surface | **YES** | No | **Lowest** | — |
| VP-2 | Task-as-verifier signal (deterministic staging from completed tasks) | No | No | Low | VP-1 |
| VP-3 | Passive message ingestion + `privacy_mode` + content-suppression | Yes (small) | No | Medium | VP-1 |
| VP-4 | Knowledge-doc gate enforcement in context assembly + agent-memory ingestion | Yes (trigger) | **YES** | Medium-High | VP-1 |
| VP-5 | Promotion boundary: `promote_candidate()` (human attest → writes `verified_*`) + reject lifecycle | **YES** | No | Medium-High | VP-1, VP-2 |
| VP-6 | Overseer shadow→active runner + proof-of-context + rules/versions CRUD + auto-promote (Q5 ceiling) + kill-switch | Yes | **YES** | High | VP-1, VP-5 |
| VP-7 | Passport in-app amber "in review" section | No | No | Low | VP-1, VP-5 |

---

### VP-1 — RECOMMENDED FIRST BATCH (lowest risk) ✅ DONE (2026-06-19)
**Status:** shipped. Migration `supabase/verification-pipeline.sql` applied to live project `plepkdgxhrgptczzpbkp` (6 tables + `ai_ingest_state` column + RLS; 11 policies; 0 client INSERT; 1 reject-only UPDATE; security advisor clean of new findings). App: `lib/verification/{ingest,staging}.ts`, 9 audit labels, `components/verification/VerificationCandidatesPanel.tsx` (amber read-only), one manager+leader nav entry in `CredentiaSite.tsx`. **tester PASS 8/8** (no `verified_*` writes, no client `attested` path, RLS isolation, service-role containment, amber-only, band-not-number). **ux-review SHIP** — trust framing called "exemplary"; one P1 fixed inline (the `verified_fact` target-kind label said "Verified fact" on an amber card → relabeled "Proposed fact" so the word "Verified" never touches an unverified candidate). One RLS tightening applied vs the design: subject may reject ONLY self-generated candidates (`generated_by = auth.uid()`), not manager/system-staged ones.
**Fast-follows (P2/P3 → planner, non-blocking):** true Tab focus-trap in `Modal` (currently Escape + initial-focus only); show the candidate's subject (name/avatar) on each card (only `subject_id` is surfaced now); Undo/softer copy on the reject toast; clickable evidence-source links (raw truncated UUID today); audit blank reject reason as null not the synthetic "No reason given".

**Goal.** Stand up the additive staging/evidence/oversight tables, the `documentation.ai_ingest_state` gate **column only** (no enforcement yet), the server-side ingestion entry point, and a **read-only** review surface. No `verified_*` writes. No model calls. No context-assembly changes.

**Migration — `supabase/verification-pipeline.sql`** (run AFTER `task-knowledge-agent.sql` and `task-verification-bridge.sql`):
- Create `ingestion_events`, `verification_candidates`, `candidate_evidence`, `overseer_rules`, `overseer_rule_versions`, `overseer_shadow_decisions` exactly per §2 of the design **with these scope edits:**
  - `verification_candidates.state` CHECK `pending | shadow_approved | attested | rejected | superseded`; `attest_method` CHECK `('human','overseer_rule')` per §4. `attested` is reachable ONLY via `promote_candidate()` (built in VP-5), never by a client.
  - `overseer_rules.lifecycle` CHECK `('draft','shadow','active','paused','retired')` per the design; `enabled_by`/`enabled_at` = the human (executive/admin, Q3) who flipped shadow→active and holds the kill-switch.
  - **Do NOT create `promote_candidate()` in VP-1** — it lands in VP-5 with the `verified_*` write branches. VP-1 is schema only.
  - Late FKs from §2.7: keep BOTH `overseer_rules_active_version_fk` and `vc_attest_rule_version_fk` (the latter records which rule version auto-attested a candidate).
- `alter table documentation add column if not exists ai_ingest_state text not null default 'blocked' check (... 'blocked','staged','cleared','quarantined')` + comment. **Column only this batch** — the trigger/enforcement is VP-4.
- RLS per §2.8 with the scope edits: `verification_candidates` client UPDATE policy allows ONLY transition to `rejected` (manager+ over subject, or subject for own self-claims). No client path to `attested`. `overseer_rules`/`versions`/`shadow_decisions` SELECT for manager+/leader in `org_id`; all INSERT/UPDATE service-role (proposals) + admin/exec (version approval) per Q3 — but since nothing runs yet, these are dormant.
- **Migration safety:** all `if not exists` / `drop policy if exists`; idempotent; no data backfill.

**App code:**
- `lib/verification/staging.ts` — browser+RLS reads: `listCandidatesForSubject`, `listCandidatesForReviewer` (manager/leader scope), `getCandidateEvidence` (joins `candidate_evidence`→`ingestion_events`), and `rejectCandidate` (client UPDATE → `rejected`, writes audit `candidate_rejected`). **No staging writer here** (that is server-only, VP-2/VP-3).
- A minimal **server ingestion helper** `lib/verification/ingest.ts` (admin client) exposing `recordIngestionEvent(...)` + `stageCandidate(...)` (idempotent on `org_id,source_type,source_id`), writing `evidence_ingested` / `verification_candidate_staged` audits. Not yet called by any producer — VP-2/VP-3 wire producers in.
- `lib/audit.ts` — add `formatAuditAction` labels: `evidence_ingested`, `verification_candidate_staged`, `candidate_rejected`, `candidate_attested`, `candidate_auto_promoted`, `overseer_rule_proposed`, `overseer_shadow_decision`, `overseer_rule_enabled`, `overseer_rule_paused`.

**Read-only review surface (UI):**
- A "Verification candidates (in review)" panel reachable by manager+ (and a subject-scoped view). **All amber** — `Sparkles` + `--inferred-fg/-bg`, header copy "In review — not yet verified." Reuse `components/ui/` Card, Badge/StatusPill, DataTable, Skeleton (loading), empty state (icon + message + CTA). Confidence shown as **Low/Med/High band only** (Q6) — never numeric. Evidence drawer lists provenance (source type + link). Reject action only (no attest control in VP-1).

**States required:** loading (skeleton rows), empty ("No candidates in review"), error.
**Trust-language checks:** every candidate row/badge is amber + `Sparkles`; nothing in this surface renders blue; no numeric probability rendered anywhere.
**Handoff — coder:** migration + `lib/verification/*` + read-only panel. **tester:** RLS isolation (subject sees only own; manager sees reports; cross-org returns nothing); reject transition works, attest transition is rejected by RLS; idempotent ingestion. **ux-reviewer:** amber-only surface, confidence band copy, empty/loading/error states, token usage.
**Exit criteria:** tables + column exist with RLS; review panel renders amber candidates read-only with reject; no `verified_*` touched; audit labels present.

---

### VP-2 — Task-as-verifier signal ✅ DONE (2026-06-19)
**Status:** shipped. Implemented as a `SECURITY DEFINER` trigger (not a server route — task completion is client-side under RLS, so a trigger is the deterministic hook; this makes VP-2 a small additive migration `supabase/verification-vp2-task-signal.sql`). **Retargeted to `verified_tasks`** (decision 2026-06-19): the live project has `verified_tasks` (the table the design doc's Mechanic 4 named), NOT the daily-pulse `tasks` table (undeployed here). Hook: AFTER INSERT/UPDATE on `verified_tasks` WHEN status→`'done'` and `assignee_id` not null → stages one amber `achievement` candidate (`subject_id=assignee_id`) + ingestion_event + evidence + 2 audit rows. Deterministic confidence ∈[0.40,1.00]: base 0.40 + delegated 0.30 (`created_by<>assignee_id`) + on-time 0.15 (`completed_at<=due_date`) + project-linked 0.15 (`project_id` set). Idempotent via `ingestion_events` unique `(org_id,source_type,source_id)`. `EXECUTE` revoked from anon/authenticated/public (trigger fns aren't RPC-callable). **Live-verified by me:** applied to `plepkdgxhrgptczzpbkp`; smoke test (a `done` task → exactly 1 candidate, conf 0.55, state `pending`, kind `achievement`, subject=assignee, 1 ingestion, 1 evidence, 2 audits); idempotency (two completions → still 1 candidate); security advisor clean of new findings after the revoke; **all test data removed, zero residue.** No `verified_*`/`achievements` writes, no model call, no app code changed (candidates surface in the existing VP-1 panel via RLS). Complements — does not touch — the manual verified_task→achievement bridge.
**Files:** server route/helper invoking `lib/verification/ingest.ts` on task-done; touches the server path adjacent to `lib/tasks.ts`'s promotion (do NOT alter the existing `promoteTaskToAchievement` human path — this **complements** it). No `verified_*` writes.
**Depends on:** VP-1. **Migration:** none. **context-architect:** no (deterministic).
**Handoff — tester:** a completed task produces exactly one idempotent candidate + evidence link; existing manager task-promotion still works unchanged; both can coexist (candidate stays `pending` until a manager attests it via VP-5's `promote_candidate`, or it's superseded by the existing manual L2 achievement).
**Exit:** task completion stages an amber candidate visible in the VP-1 review panel with its task as evidence.

---

### VP-3 — Passive message ingestion + privacy_mode ✅ DONE (2026-06-19)
**Status:** shipped. Migration `supabase/verification-vp3-message-evidence.sql` applied to `plepkdgxhrgptczzpbkp`. Implemented as a `SECURITY DEFINER` AFTER-INSERT trigger on `messages` (same client-side-RLS rationale as VP-2). **Evidence is a POINTER, not content** — one `ingestion_events` row (`source_type='message'`, `source_id`, `subject_id=sender_id`, `consent_basis='org_policy'`, `redacted`); message body never copied. Scope (Q1): work-context only — ingest unless `kind='direct' AND task_id is null`. Added `organizations.privacy_mode` (`standard|strict`), `conversations.evidence_suppressed`, `messages.evidence_suppressed`. Redaction = `conv.evidence_suppressed OR (privacy_mode='strict' AND msg.evidence_suppressed)`. No candidate staged (message→claim deferred to VP-6), **no per-message audit** (the ingestion row is the record), `save_to_agent_memory`/`agent_memory` untouched, `EXECUTE` revoked. App: `lib/verification/evidence.ts` (`setConversationEvidenceSuppressed`) + a distinct "Exclude from evidence" toggle in the thread header (neutral tokens, separate from the memory toggle).
**Review decision (mine, before apply):** the coder's draft added a broad `msg: sender update` RLS policy to allow per-message suppression — but RLS can't column-restrict, so it would also let senders **edit already-sent (possibly already-ingested) message bodies**, an evidence-integrity hole. **Dropped it; messages stay immutable.** Per-message strict-mode suppression has no client write path in VP-3 — deferred to a column-scoped `SECURITY DEFINER` RPC when strict per-message UI ships. `setMessageEvidenceSuppressed` removed from the lib accordingly.
**Live-verified by me:** task-thread message → 1 evidence pointer (`redacted=false`); plain direct 1:1 → 0; suppressed conversation → 1 pointer (`redacted=true`); 0 candidates; advisor clean of new findings; tsc/eslint clean; all test data removed (zero residue).

**Goal.** Always-on **evidence** ingestion from work-context messages (NOT verification). Pipeline (b) only — `agent_memory` / `save_to_agent_memory` semantics are UNTOUCHED.
**Migration (small):** add `organizations.privacy_mode text default 'standard' check ('standard','strict')`; ensure `ingestion_events.redacted` honored. Channel scope: exclude `conversations.kind='direct'` unless `task_id is not null` (task-linked).
**Logic:** server ingestion on message create for in-scope channels → `ingestion_events(consent_basis='org_policy')`; `standard` = per-conversation content-suppression available; `strict` = per-message suppression. Suppressed = metadata only, `redacted=true`, raw text never enters a candidate payload. May stage a candidate but **no model call here** — if a candidate's claim text requires model summarization, that staging path moves to VP-6/`context-architect`; VP-3 stages only deterministic/metadata candidates. Subject can see and reject all candidates about them (VP-1 RLS already grants this).
**Depends on:** VP-1. **context-architect:** no for deterministic ingestion; YES if any message→claim summarization uses a model (defer that to VP-6).
**Handoff — tester:** off-the-record (`save_to_agent_memory=false`) message is still ingestible as evidence but content-suppressible; personal 1:1 excluded unless task-linked; subject sees + can reject; `privacy_mode='strict'` enforces per-message suppression. **ux-reviewer:** employee transparency view shows existence + evidence, never a score.
**Exit:** in-scope messages produce audited `ingestion_events`; suppression keeps raw text out of payloads; pipeline (a) unchanged.

---

### VP-4 — Doc gate enforcement in context assembly ✅ DONE (2026-06-19)
**Status:** shipped (context-architect-gated batch). Migration `supabase/verification-vp4-doc-gate.sql` applied to `plepkdgxhrgptczzpbkp`: extended `guard_doc_verification()` (faithful — preserves the existing manager+/HR verify gate, stamp, and de-verify reset verbatim; ADDS: `ai_ingest_state='cleared'` requires `status='verified'` + the same privileged actor; leaving verified forces `ai_ingest_state→blocked`; `quarantined` is terminal-exclusionary, never auto-cleared, lift requires manager+/HR). Single trigger `trg_doc_verification` (BEFORE INS/UPD) confirmed; `EXECUTE` revoked (closed a pre-existing advisor finding); zero new advisor findings; **zero doc rows live → no behavior change to existing data.**
**Key finding (context-architect):** exactly ONE doc→model-input path exists today — `app/api/ai/agent/ingest/route.ts` (Digital-Twin trainer), which previously filtered only `status='verified'` (the bypass). Now gated. `lib/ai/*` never read `documentation`. **App gate:** new `lib/verification/doc-eligibility.ts` (`CLEARED_DOC_FILTER` single source of truth, `eligibleDocsQuery` applies verified+cleared on top of RLS, `assertDocCleared` hard-throws) wired into the ingest route (still uses the user/RLS client). New `lib/verification/context-assembly.ts` encodes the §6 contract — `verified[]`/`inferred[]` as separate arrays (no flattened field), `assertContextWallIntact` throws on misclassification, cleared docs only ever tagged `source:'verified'` (uncleared ones absent, never downgraded to inferred).
**tester PASS 7/7** + 15/15 pure-logic unit tests; tsc/eslint clean; no `verified_*`/candidate writes; service-role containment; no other ungated doc→model-input path.
**Verification caveat (honest):** the trigger's role-gated branches can't be exercised under the service role (`auth.uid() is null` bypass) — verified by faithful-extension inspection + clean compile; live role behavior is app-level QA with real JWTs.
**Policy follow-ups (→ planner):** who/what sets `ai_ingest_state='staged'`→`'cleared'` (recommend a separate explicit reviewer action, distinct from verify) — until defined, all docs stay `blocked` and the agent learns zero docs (the gate working safely); a `quarantined` producer (PII/secrets/disputed) is a later batch.
**Migration (trigger):** extend `guard_doc_verification()` per §3 mechanic 2 — a doc may become `ai_ingest_state='cleared'` ONLY in the same statement that sets `status='verified'` with the existing manager+/HR role check; leaving `verified` resets `ai_ingest_state` to `blocked`. `staged` may create a `target_kind='documentation'` candidate (still unusable). `quarantined` permanently excluded.
**App code:** every agent-memory ingestion server path and every context-assembly query adds `ai_ingest_state='cleared'` filter (alongside existing visibility/role checks).
**Depends on:** VP-1 (column exists). **context-architect:** YES — this changes what is eligible as model input; the context-assembly contract (§6, provenance-tagged `RetrievedContextItem`, separate verified vs inferred arrays) is its boundary.
**Handoff — tester:** a `verified`-but-not-`cleared` doc is excluded from every prompt and from `agent_memory`; un-verifying resets to `blocked`; quarantined never returns. **context-architect:** confirm separate-arrays retrieval contract; no flattening that erases provenance.
**Exit:** mechanical proof that only `cleared` docs reach model context; verified-vs-inferred arrays stay separate.

---

### VP-5 — Promotion boundary (`promote_candidate`, human path) + reject lifecycle ✅ DONE (2026-06-19)
**Status:** shipped. Migration `supabase/verification-vp5-promote.sql` applied to `plepkdgxhrgptczzpbkp`. `promote_candidate(p_candidate_id, p_method, p_rule_version)` `SECURITY DEFINER` is the SINGLE pipeline writer into `verified_*` (achievements) and the ONLY path to `state='attested'`. Human path: authority gate (`is_manager_of`/`is_org_leader_of`/admin-hr) on `auth.uid()`; mints the achievement from `c.payload`; stamps the candidate (`attested_by/at`, `attest_method`, `promoted_table/_id`); audits `candidate_attested`. `overseer_rule` method + non-achievement kinds raise (dormant); Q5 denylist documented for VP-6. Grants: revoked anon/public, granted `authenticated` (RPC runs on the USER's RLS client so `auth.uid()`=attester; authority enforced in-function).
**Live schema catch (mine, before apply):** the live `achievements` table has **no `submitted_by` column** (repo/live drift, same as the `tasks` divergence) — the coder's insert included it and would have failed. Fixed the insert to the real live columns; attestor identity is captured on `attested_by` + audit. (Implies the repo's manual `promoteTaskToAchievement` is also broken vs this DB.)
**Live-verified by me (via JWT-simulated attester):** manager attests an achievement candidate → 1 `achievements` row (level 2, correct subject/org), candidate flips `attested` with `promoted_id`, 1 `candidate_attested` audit; double-attest → "already attested"; non-manager → "not authorized to attest for this subject"; all test data removed (zero residue). `promote_candidate` is intentionally `authenticated`-executable (authority in-function) — expected advisor note, not a defect.
**App:** `lib/verification/promote.ts` (`attestCandidate` on the browser/RLS client). UI: Attest action + mint-confirmation Modal in the VP-1 panel (manager+/reviewer only; pending candidates stay amber, only action/outcome blue).
**tester PASS 7/7** (incl. full `npm run build`); boundary integrity confirmed (no other attested/verified write path).
**ux-review → HOLD→fixed→SHIP:** one P1 fixed — the Attest button rendered terracotta (generic accent); recolored to the **`--verified-fg`** token so the amber→blue mint reads correctly. tsc/eslint clean. P2/P3 (action separation, Modal focus-to-Cancel + true focus-trap, "undone here" copy) → planner follow-ups.

**Goal.** Build the single promotion boundary per design §4 and wire the human-attest path. Two terminal paths:
- **Reject** — client UPDATE → `rejected` (already in VP-1).
- **Attest (promote)** — a SECURITY DEFINER `promote_candidate(p_candidate_id, p_method, p_rule_version)` RPC. VP-5 exercises only `p_method='human'`: it locks the candidate (`FOR UPDATE`), checks the caller has attest authority over the subject (`is_manager_of`/`is_org_leader_of`/admin/hr), **writes the blue `verified_*` row from the candidate `payload`** (one branch per `target_kind`), stamps `state='attested'` + `attested_by`/`attested_at`/`attest_method='human'`/`promoted_table`/`promoted_id`, and audits `candidate_attested`. It is the ONLY pipeline writer into `verified_*`. The `'overseer_rule'` branch exists in the function but is unreachable until VP-6 enables an `active` rule. Enforce the **Q5 denylist** in the function from day one.
**Files:** the `promote_candidate` migration (with `verified_*` insert branches per `target_kind`); `lib/verification/promote.ts` (server, calls the RPC); wire an "Attest" affordance into the VP-1 review panel (manager+ only). Complements — does not replace — the existing manual promotions, which still run.
**Depends on:** VP-1, VP-2. **Migration:** yes (the function). **context-architect:** no (human path is deterministic SQL; no model input).
**Handoff — tester:** human attest writes exactly one `verified_*` row + stamps the candidate; non-authorized caller rejected; double-attest raises; RLS still forbids any client setting `attested` directly; Q5 denylist blocks `overseer_rule` method on high-stakes kinds. **ux-reviewer:** attested candidate's verified record renders blue with provenance ("attested by X"); the amber candidate is not relabeled — it links to its blue row.
**Exit:** a manager can attest a candidate; the pipeline mints its `verified_*` row via the single boundary; verified/inferred wall intact.

---

### VP-6 — Overseer shadow→active runner + rules CRUD + auto-promote ✅ DONE (2026-06-19)
**Status:** shipped (context-architect-gated). Migration `supabase/verification-vp6-overseer.sql` applied to `plepkdgxhrgptczzpbkp`: replaced `promote_candidate`'s `overseer_rule` raise-stub with real logic (human path preserved byte-for-byte incl. the no-`submitted_by` achievements insert); added the `overseer_version_agreement` view (security_invoker) + overseer_* write RLS (rule/version INSERT + version-approve = admin/exec; enable = exec/admin; pause = manager-own-scope/admin-exec; shadow rows service-role only). App: `lib/overseer/*` — deterministic predicate `evaluate.ts` (NO model call; `logic` is structured inspectable JSON, `rationale` advisory-only), `runShadow.ts` (shadow records; auto-promote ONLY when `active` + approve + Q5), `enable.ts` (Q4 gate + pause + auto-pause), `rules.ts`, outcome backfill wired into attest/reject; API routes (role-gated); `OverseerOversightPanel.tsx`.
**Live-verified by me (service-role overseer path):** active rule auto-mints an achievement, stamps `attest_method='overseer_rule'` (no human attester) + rule version, audits `candidate_auto_promoted`; **Q5 ceiling** refuses level-3; **race-free kill-switch** (paused rule) refuses via in-txn lifecycle re-check; zero residue. Human path unchanged.
**tester PASS 8/8** + 11/11 evaluator unit tests + `npm run build`; shadow never enacts; no model import; service-role containment; barrel doesn't leak admin client to client bundle.
**ux-review → HOLD→fixed→SHIP:** two P0 authority/routing contradictions on the safety surface, both fixed — (1) the **kill-switch was hidden from managers** who hold it → split `canAct` into `canEnable` (exec/admin) + `canPause` (exec/admin/manager) so managers see Pause on live rules; (2) **admin couldn't reach the panel** their Enable authority targets → `canReviewQueue` now includes admin. Plus P1s: hr gets an explicit "View only" state, pause scope hints, Enable button no longer pre-emptively verified-blue. tsc/eslint clean.
**Q4 gate hardened ✅ (VP-6b, 2026-06-19):** `supabase/verification-vp6b-q4-gate-trigger.sql` applied — a `BEFORE INSERT/UPDATE` trigger `guard_overseer_activation()` on `overseer_rules` enforces the Q4 gate (≥0.95 agreement over ≥50 human-decided shadow decisions, ≥2 distinct attestors, ≥14 days) on ANY transition INTO `lifecycle='active'`, with **no `auth.uid()` bypass** — so a direct API/SQL UPDATE can no longer activate an unproven rule. `enableRule` still checks Q4 in-app (defense-in-depth); no app change needed. **Live-verified by me:** unproven activation blocked ("need ≥50 … have 0"); a proven rule (50 decisions/100% agreement/2 attestors/15d) activates cleanly (no false-block); zero residue. (Constants match the app `Q4_GATE` 0.95/50; relax toward the 0.90/30 floor if org-configurable looser gates are ever added.)
**Remaining P2/P3 polish (→ planner, non-blocking):** age chip in the agreement summary, pause-undo/copy, predicate aria-labels, toast phrasing.

**Goal.** The Overseer observes shadow decisions vs human outcomes, proposes versioned structured-predicate rules, records proof-of-context, and — once a rule passes the Q4 gate AND a human enables it — auto-attests matching candidates through `promote_candidate(method='overseer_rule')`. Lifecycle `draft → shadow → active → (paused | retired)`.
**Migration:** shadow-runner support objects; the `active` state is already allowed by VP-1's CHECK.
**App code — `lib/overseer/*`:**
- Rule/version CRUD: propose (service-role, Overseer) + version approval (admin/exec, Q3); `proposed_by`/`approved_by`.
- Shadow runner: for each matching candidate, write `overseer_shadow_decisions` with `proposed_action` + `proof_of_context` JSON (`evidence_ids`, matched predicates, reasoning, band — never a rendered numeric to UI). When a human later rejects/attests, fill `human_action` + `agreed`. While shadow, `was_enacted=false`.
- **Shadow→active enablement:** allowed ONLY when the version's recorded agreement ≥ Q4 threshold over the min sample (≥2 attestors, ≥14d) AND an executive/admin explicitly enables (`enabled_by`/`enabled_at`). The system never self-promotes a rule; audits `overseer_rule_enabled`.
- **Auto-promote (active):** the runner calls `promote_candidate(method='overseer_rule', rule_version)` for matching candidates; the function re-checks `lifecycle='active'` under lock (kill-switch) and enforces the **Q5 ceiling** (low-stakes kinds only). Each auto-promotion writes `candidate_auto_promoted` audit with rule version + proof-of-context, and a shadow_decision row with `was_enacted=true`.
- **Kill-switch:** manager+ pause own scope, admin/exec org-wide (Q3) → `lifecycle='paused'`; in-flight auto-promotions are blocked by the in-transaction re-check; audits `overseer_rule_paused`. Live agreement <0.90 or a dispute spike auto-pauses (Q4).
**Depends on:** VP-1, VP-5 (needs the promotion boundary + human outcomes to measure agreement). **Migration:** yes. **context-architect:** YES — rule proposal and shadow scoring construct model input / shape inference; `logic` must be structured inspectable predicates, `rationale` advisory-only prose, never executed.
**Handoff — tester:** shadow never enacts; enablement blocked below the Q4 gate and without a human enable; an active rule auto-attests ONLY low-stakes kinds (Q5 denylist blocks the rest); pause halts in-flight auto-promotion; every auto-promotion is audited with rule version + proof. **context-architect:** rule `logic` structured JSON not prose; proof-of-context captures inputs+reasoning; no numeric probability leaks to trust UI. **ux-reviewer:** oversight surface manager+/leader, amber, band-only confidence; auto-attested verified records show "auto-attested by rule vN" provenance.
**Exit:** Overseer learns, proves context in shadow, and — only after the Q4 gate + human enable — auto-attests low-stakes candidates via the single boundary, fully audited, with a race-free kill-switch.

---

### VP-7 — Passport in-app amber section ✅ DONE (2026-06-20)
**Status:** shipped (presentation-only, no migration). New `components/verification/PassportInReviewSection.tsx` — an amber "In review — not yet verified" section on the in-app Passport (`EmployeeView`), reading `listCandidatesForSubject(userId, {states:['pending','shadow_approved']})` (existing VP-1 RLS). `Sparkles` + `--inferred-*`, Low/Med/High band only (numeric stripped at lib layer), `verified_fact`→"Proposed fact". Gated `{!external && …}` so it's hidden in the in-app "Preview public passport" toggle AND never mounted on the public slug. Candidates are NOT merged into `vault`/`timeline`/`maxLevel`/verified counts. Public `get_public_passport`/`VerifiedResumePage`/`app/p/*` untouched + candidate-blind. Provenance affordance deferred (would need a widening query). **tester PASS 7/7**; **ux-review SHIP** (trust wall intact; only P2/P3 polish: band-chip wording "AI confidence: High", a preview-toggle note). tsc/eslint clean.

**🎉 Verification pipeline COMPLETE: VP-1 → VP-7 + VP-6b all live.** Continuous staging (docs/messages/tasks) → human-attest + Overseer shadow→active auto-promotion through the single `promote_candidate` boundary, gated by Q4 (DB-enforced) + Q5 ceiling + race-free kill-switch, surfaced amber-in-review on the Passport. Verified(blue)/inferred(amber) wall preserved end-to-end.
**Files:** in-app passport component; reuse Card/Badge primitives. Amber `Sparkles` + `--inferred-fg/-bg`; never counted toward `titleLevel`; never on public slug. Provenance affordance for attested-to-blue records ("attested by X" / "auto-attested by rule vN") drawn from `attested_by`/`attest_method`/`promoted_id` + `candidate_evidence`.
**Depends on:** VP-1, VP-5. **Migration:** none. **context-architect:** no.
**Handoff — tester:** public passport (`fetchPublicPassport`/RPC) returns zero candidates; in-app amber section appears only under RLS; amber never raises `titleLevel`. **ux-reviewer:** blue vs amber visually unmistakable, copy "In review — not yet verified," no numeric score.
**Exit:** in-app Passport shows amber candidates distinctly; public RPC proven candidate-blind.

---

### How `promote_candidate` is incorporated (summary)
- **`promote_candidate()` (design §4) is the single promotion boundary** — built in VP-5, the only writer that sets `state='attested'` and the only pipeline writer into `verified_*`. Human-attest path in VP-5; `overseer_rule` path activated in VP-6.
- **Existing manual promotions still run in parallel** (`guard_doc_verification`, `lib/tasks.ts`, `task-verification-bridge.sql`); the pipeline complements them.
- **Overseer lifecycle `draft → shadow → active → (paused | retired)`** — shadow proves context; `active` (auto-attest) requires the Q4 gate AND explicit human enablement; every auto-promotion is audited with rule version + proof-of-context.
- **Q4 thresholds gate shadow→active; Q5 ceiling is enforced inside `promote_candidate()`** (auto-attest limited to low-stakes kinds; comp/promotion/rating/title permanently human-only).
- **Kill-switch (pause) stops auto-promotion instantly** via the in-transaction `lifecycle='active'` re-check under row lock (race-free).
