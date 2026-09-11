# Status Page Widget Visual Audit — 2026-04-01

## Scope
- Editor/widget preview quality pass for status page widgets
- Cross-page visual sanity run (desktop/tablet/mobile × light/dark)

## Method
1. Ran visual regression suite via Docker against reverse proxy:
   - `npm run test:visual:docker -- --base-url=https://oc-dev-test.no749ah.com`
   - Result: **90/90 screenshots passed**
2. Ran widget coverage audit:
   - `npm run widget:audit`
   - Result: **82/82 widget types covered** across palette, renderer, and resolver
3. Performed targeted editor preview code inspection for typography/spacing/color fidelity.

## Findings
- ✅ Overall layout and typography are consistent across audited routes and breakpoints.
- ✅ No missing widget coverage gaps in palette/renderer/resolver.
- ⚠️ Found a preview rendering defect in `version-timeline` widget:
  - Dot color class used dynamic Tailwind interpolation (`bg-${...}`), which is unreliable for generated utility classes.
  - Could produce incorrect or missing status dots in widget previews.

## Action Taken
- Fixed `version-timeline` preview to use explicit static Tailwind class names (`bg-success`, `bg-warning`, `bg-text-muted`) via `dotClassName` mapping.
- This restores predictable dot rendering and keeps editor previews visually aligned with expected status semantics.

## Artifacts
- Visual screenshots: `scripts/screenshots/`
- Widget audit report: `artifacts/widget-audit/latest.json`
