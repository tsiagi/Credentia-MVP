# Core-Roborate UI Primitives — design-sync notes

Synced from the Core-Roborate Next.js app (NOT a packaged component library). Target
project: "Core-Roborate UI Primitives" (separate from the hand-built "Core-Roborate · Core-Roborate
Design System" / "Core-Roborate Design System" — do not overwrite those).

## How the build works (package shape, synth-entry)
- No component `dist/`. The bundle is built from source via the barrel:
  `--entry ./components/ui/index.ts` (this makes PKG_DIR resolve to the repo root
  by walking up to package.json, AND provides the esbuild entry). Do NOT drop
  `--entry` (without it PKG_DIR = node_modules/core-roborate, which doesn't exist).
- `--entry` disables the content-scan, so components are listed explicitly in
  `cfg.componentSrcMap` (12 entries). Add/remove there to change scope.
- Build cmd:
  `node .ds-sync/package-build.mjs --config design-sync.config.json --node-modules ./node_modules --entry ./components/ui/index.ts --out ./ds-bundle`

## cssEntry is GENERATED — regenerate every sync (critical)
The components use BOTH Tailwind v4 utilities (flex/gap/h-/w-/space-y-…) AND the
Core-Roborate token/`.core-roborate-*` layer. `cfg.cssEntry` points at a generated flat file
`.design-sync/.cache/core-roborate-flat.css` (gitignored). REGENERATE it before each build:
```
npx --yes @tailwindcss/cli -i .design-sync/.cache/core-roborate-input.css -o .design-sync/.cache/core-roborate-flat.css
```
where `.design-sync/.cache/core-roborate-input.css` is (also gitignored — recreate if missing):
```
@import "tailwindcss";
@source "../../components/ui";
@import "../../styles/core-roborate/core-roborate.css";
```
If you skip this and only flatten `styles/core-roborate/*`, the Tailwind utilities are
missing and component-internal layouts (CardHeader action, Modal close, Skeleton
sizing, DataTable skeleton rows) render broken.

## Overlays
Modal and ToastProvider are portal/overlay components → `cfg.overrides` sets
`cardMode:"single"` + a viewport so the open state renders inside the card.
ToastProvider's preview fires toasts on mount so they're visible in the static capture.

## Re-sync risks (what can silently go stale)
- `.design-sync/.cache/core-roborate-flat.css` + `core-roborate-input.css` are gitignored/generated —
  a fresh clone has neither; recreate `core-roborate-input.css` and re-run the Tailwind CLI,
  else cssEntry is missing → `[CSS_IMPORT_MISSING]`.
- Fonts (Hanken Grotesk, Newsreader, IBM Plex Mono) are loaded by the host via
  next/font at runtime; nothing is shipped. `cfg.runtimeFontPrefixes` suppresses
  `[FONT_MISSING]`, but designs render in fallback fonts unless claude.ai/design's
  host serves those families. To ship real brand fonts, add @font-face CSS via
  `cfg.extraFonts`.
- Components import only relative `./cn`, lucide-react, react/react-dom — no `@/`
  alias inside components/ui, so esbuild resolves without tsconfig paths (tsconfig
  is set anyway for safety).
- New components/ui exports won't appear unless added to `cfg.componentSrcMap`.
