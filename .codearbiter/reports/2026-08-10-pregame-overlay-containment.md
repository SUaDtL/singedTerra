# Pregame overlay containment delivery receipt

Date: 2026-08-10

Task: `ux.pregame.0002`

## Delivered outcome

Player Account and Operations Settings now open as opaque, stage-owned command
surfaces. The mounted deployment card is suppressed without reflow while either
tool is active, then restored on close. Account keeps a focused desktop width;
Operations uses a wider aligned field console and a compact, scroll-owned stack.

## Delivery identity

- Pull request: `#382`
- Reviewed PR head: `f4a2b61672ef3dba4e75f2ae5f5b80f7a4b827fd`
- Squash merge on `main`: `23b89491886989f8ca437c7a6aca266426d52d0d`
- Exact-head CI run: `31391190857`
- CodeQL run: `31391191048`
- Pages deployment run: `31391620194`

## Verification

- Deterministic harnesses and strict typecheck passed.
- Client suite passed 148 files and 1,145 tests.
- Edge suite passed 267 tests with no failures.
- Dependency audit reported zero vulnerabilities.
- Focused production-browser acceptance passed 6 tests across desktop, touch,
  and compact-window profiles.
- The corrected two-spec browser matrix passed 33 tests with 3 intentional
  desktop-only fixture skips.
- Canonical security and migration passes found zero sensitive lines and zero
  migration files.
- Exact cumulative adversarial review and PR coverage audit both returned CLEAR
  with no Critical, High, or other merge-blocking findings.

## Mutation evidence

The tests rejected deliberate regressions that re-exposed the base card,
overlapped Operations rows, translated settings above the scroll viewport,
oversized the first desktop control, and swapped the Account and Operations
surface widths. Every mutation was reverted before final review.

## Production proof

The Pages workflow verified current `main`, deployed the exact merge, verified
deployment provenance, and passed its post-deploy live render smoke. Independent
public checks returned HTTP 200, found the app mount, and read
`deploy-meta.json` with SHA `23b89491886989f8ca437c7a6aca266426d52d0d` and
run ID `31391620194`.

No Supabase function, configuration, migration, or dependency deployment was
required.
