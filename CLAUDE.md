# Credentia — Claude Code Context

## What This Product Is

Credentia is an enterprise workforce verification and talent intelligence platform. Companies use it to verify employee credentials, track performance, and surface workforce insights. It is multi-tenant SaaS — each company is an isolated org.

The platform's **single most important architectural principle** is the strict separation of:
- **Verified facts** — attested by real humans, stored in `verified_*` tables, displayed with a shield icon and blue color
- **AI inferences** — model-generated estimates, stored in `ai_inference_*` tables, displayed with a sparkle icon and amber color

These two data types must **never** be mixed in the database or presented identically in the UI. This distinction is the core product differentiator and must be preserved in every change you make.

---

## Stack

- **Framework:** Next.js 16 (App Router) with TypeScript
- **Database:** Supabase (Postgres + Row Level Security)
- **Styling:** Tailwind CSS v4
- **Icons:** Lucide React
- **Auth:** Supabase SSR auth
- **Deployment:** Vercel

---

## Role Hierarchy

```
superadmin (platform operator — above all orgs)
  └── admin (company-level admin)
        └── manager (assigned by admin only, never self-assignable)
              └── employee
                    └── former_employee (four lifecycle states)
```

Each role has its own dashboard. All data access is scoped by `org_id` via RLS.

---

## Non-Negotiables (Never Violate These)

1. **Data separation** — verified and AI-inferred data stay in separate tables and are always labeled differently in the UI
2. **AI framing** — AI recommendations are always presented as estimates or suggestions, never as facts
3. **Server-side keys** — the Supabase service role key is never exposed via `NEXT_PUBLIC_`. All AI inference writes happen server-side only
4. **Audit logging** — every significant action writes to the audit log
5. **Multi-tenant isolation** — every query must respect `org_id` RLS. Never query across orgs
6. **No self-signup** — access is granted at the company level by an admin only
7. **Manager assignment** — managers are assigned by admins only, never self-assignable

---

## What Already Exists (Do Not Recreate)

The following features are already built. Before writing any new component, table, or logic — check if it already exists:

- Full database schema with RLS policies and Supabase client setup
- Role-based dashboards: employee, manager, executive, admin, superadmin
- Verification flows, settings, and privacy controls
- Personnel provisioning with SSO / SCIM / Okta integration
- Account lifecycle management for former employees
- Billing and trial management layer (mocked)
- Demo company seed data
- Executive dashboard with interactive d3-hierarchy org tree
- Compensation intelligence, employee value scores, promotion readiness
- Internal verified resume network
- Real-time verification request workflow with SLA tracking
- Public read-only shareable profile pages
- Tamper-evident hash-chained audit trail dashboard
- CSV bulk employee importer with dry-run validation
- Org structure editor and configurable verification templates
- Manager verification integrity monitor (admin-only)
- Regulator-ready PDF compliance export
- Cross-company portable verified credential network

---

## Current Mission: UI/UX Redesign of All Authenticated App Pages

The marketing page (`app/page.tsx` and any `/marketing` or public-facing pages) is **off-limits** — do not touch it.

Every authenticated app page (dashboards, settings, profiles, admin panels, verification flows, etc.) needs a cohesive visual redesign. The components and functionality exist — the goal is to make the experience feel like a polished, credible enterprise SaaS product.

### Design Direction

> **DECISION (2026-06-19): "Blend" — Cairn is the authoritative design system; trust colors are blue/amber.**
> The implemented system is **Cairn** (`styles/cairn/`, imported via `app/globals.css`): a warm palette (sand/clay/terracotta/coral/plum/ochre/olive) with `--accent` = terracotta. Keep it as the source of truth for shell, accent, surfaces, and typography. The indigo/violet "Rippling/Linear" direction below is **superseded** for shell/accent — do not retokenize the app to indigo.
> The ONE override: the **trust language** must be blue (verified) + amber (AI), per the non-negotiable. This is implemented centrally in `styles/cairn/tokens/colors.css` via `--verified-fg`/`--verified-bg` (blue) and `--inferred-fg`/`--inferred-bg` (amber). All ~40 components already consume these tokens, so trust color is controlled in that one file — never hardcode trust colors in a component.

**Visual style:** Warm enterprise (Cairn) — terracotta accent on a sand/clay neutral base, light + dark themes. (The original indigo/violet brief is retained below for historical context only.)

**Verified vs AI-inferred visual language:**
- Verified facts → `ShieldCheck` icon (Lucide) + blue (`--verified-fg` / `--verified-bg`)
- AI inferences → `Sparkles` icon (Lucide) + amber (`--inferred-fg` / `--inferred-bg`)
- Both must appear together (icon + color-coded badge) wherever these data types are displayed
- Always reference the tokens — never the raw hex — so the boundary stays controlled in one place

### Design Token System

Establish a single source of truth in `app/globals.css`. All components must use these tokens — no one-off hardcoded colors or spacing:

```css
:root {
  /* Sidebar */
  --sidebar-bg: #0F1117;
  --sidebar-text: #94A3B8;
  --sidebar-text-active: #FFFFFF;
  --sidebar-accent: #6366F1; /* indigo-500 */
  --sidebar-hover: #1E2433;

  /* Content area */
  --content-bg: #F8FAFC;
  --card-bg: #FFFFFF;
  --card-border: #E2E8F0;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);

  /* Typography */
  --text-primary: #0F172A;
  --text-secondary: #64748B;
  --text-muted: #94A3B8;

  /* Accent */
  --accent: #6366F1;
  --accent-hover: #4F46E5;
  --accent-light: #EEF2FF;

  /* Verified / AI semantic colors */
  --verified-color: #3B82F6;
  --verified-bg: #EFF6FF;
  --ai-color: #F59E0B;
  --ai-bg: #FFFBEB;

  /* Status */
  --success: #10B981;
  --warning: #F59E0B;
  --error: #EF4444;
  --neutral: #64748B;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;

  /* Transitions */
  --transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Component Standards to Apply Everywhere

**Sidebar:**
- Fixed left, `--sidebar-bg` background, `w-64`
- Logo at top, nav items with icon + label, active item has left border accent + `--accent` color
- Smooth hover transitions, role badge at bottom near user avatar
- Collapsed state on mobile

**Page layout:**
- `PageHeader` component: page title (xl, semibold), optional subtitle, action buttons top-right
- Max content width `max-w-7xl mx-auto px-6 py-8`
- Section spacing consistent: `space-y-6`

**Cards:**
- `rounded-[--radius-md]` border `border-[--card-border]` shadow `shadow-[--card-shadow]` bg white
- Card header with title + optional action, divider, card body with consistent padding `p-6`
- Hover state for clickable cards: `hover:shadow-md hover:border-indigo-200 transition`

**Buttons:**
- Primary: indigo filled, `hover:bg-[--accent-hover]`, `rounded-[--radius-sm]`, `transition`
- Secondary: white with border, hover fills lightly
- Destructive: red variant
- All buttons have loading state with spinner

**Badges / Pills:**
- Verified: shield icon + "Verified" label, blue bg `--verified-bg`, blue text `--verified-color`
- AI Inferred: sparkle icon + "AI Estimate" label, amber bg `--ai-bg`, amber text `--ai-color`
- Status badges for pending/active/inactive/flagged using semantic colors

**Data tables:**
- Sticky header, alternating row hover, sortable columns indicated with chevron
- Empty state: centered icon + message + CTA button, never a blank space
- Loading state: skeleton rows, not a spinner

**Forms:**
- Label above input, consistent `gap-y-5` between fields
- Focus ring uses `--accent` color
- Inline validation errors below the field in red
- Submit button shows loading spinner on submit

**Toasts / Feedback:**
- Success, error, and info toasts — top-right, slide in, auto-dismiss at 4s
- Never use browser `alert()`

**Modals:**
- Backdrop blur, centered card, close button top-right
- Smooth scale-in animation on open

### Micro-interactions

- Sidebar nav transitions: `transition-colors duration-150`
- Card hover: `transition-shadow duration-150`
- Button hover/active: scale slightly on active `active:scale-[0.98]`
- Skeleton loaders on all data-fetching components — never show a blank state while loading
- Page entry: subtle fade-in `animate-in fade-in duration-200`

### Typography

- Font: Inter (already available via Next.js font optimization) or Geist (already bootstrapped)
- Page titles: `text-2xl font-semibold text-[--text-primary]`
- Section headers: `text-base font-semibold text-[--text-primary]`
- Body: `text-sm text-[--text-secondary]`
- Captions/meta: `text-xs text-[--text-muted]`
- Data values (numbers, scores): `font-mono text-sm`

---

## How to Approach the Redesign

1. **Start with the design token system** — update `app/globals.css` first
2. **Build shared primitives** in `components/ui/` — Button, Card, Badge, StatusPill, PageHeader, DataTable, Modal, Toast, Skeleton — before touching any page
3. **Apply to the app shell** — sidebar and top nav layout next
4. **Then go page by page** — employee dashboard → manager dashboard → executive dashboard → admin panels → verification flows → settings → profile pages
5. **Do not change any data-fetching logic, Supabase queries, or RLS policies** — only touch presentation layer (JSX, className, layout, components)
6. **Do not touch** `app/page.tsx` or any marketing/public-facing pages

---

## Key Reminder

Before creating any new component or file, check `components/` to see if it already exists. The goal is to refine and replace styling — not rebuild functionality.
