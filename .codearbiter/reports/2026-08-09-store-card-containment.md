# Store card containment sprint receipt

Date: 2026-08-09
Task: reliability.store.0001

## SMARTS decisions

### D1 - Repair the purchase label at its semantic source

Options scored 1-5 for suitability, maintainability, assurance, reversibility,
testability, and scope discipline:

| Option | S | M | A | R | T | S | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Show canonical `+bundleSize` in accessory purchase controls | 5 | 5 | 5 | 5 | 5 | 5 | 30 |
| Constrain and wrap the duplicated effect copy inside the button | 3 | 3 | 3 | 4 | 4 | 3 | 20 |
| Redesign the catalog grid/card hierarchy | 2 | 2 | 3 | 2 | 3 | 1 | 13 |

Decision: use the canonical bundle quantity. The effect remains in the adjacent
summary, so the action becomes concise and consistent with weapon purchases
without changing economy or behavior.

## Diagnosis

`createStoreAccessoryCard` places `ACCESSORIES[key].blurb` inside a
`flex: 0 0 auto` purchase button. The same effect is already rendered in the
card summary. Parachute's long blurb gives the button a max-content width larger
than the card, leaving the flexible information column to collapse and allowing
the button to cross the border. Existing browser guardrails only checked that
visible buy controls stayed inside the overall Store panel, so sibling-card and
within-card collisions escaped.

## Test-first log

RED 1: `npm -w @singedterra/client test -- src/ui/HUD.store.test.ts` failed
only the new assertion: expected Parachute's bundle label `+1`, received
`Reduces one dangerous fall to 25% damage`.

RED 2: `npx playwright test e2e/hud-layout.spec.ts --grep "Store cards contain"`
failed only `desktop-fine`. The measured Parachute card was 229.03px wide, its
purchase control was 255.44px wide and ended 44.88px beyond the card, and the
information column collapsed to 0px. Pixel-touch and small-window passed, pinning
the defect to the nested desktop catalog geometry and max-content action copy.

GREEN focused: all 6 Store DOM tests passed. The real-browser geometry test
passed on desktop-fine, pixel-touch, and small-window; every card now contains
its information and purchase control without overlap.

Full-client discovery: the first 1,031-test coverage run found one stale Fuel
Tank presentation assertion that required effect copy inside the button. The
test was corrected to preserve its original economy guarantee in the card
summary and to assert the canonical ten-unit bundle in the purchase control.

## Verification

- Focused Store and mobility tests: 16 passed.
- Client coverage: 137 files / 1,032 tests passed; 92.61% statements, 82.81%
  branches, 85.51% functions, and 94.64% lines.
- Deterministic/typecheck harness: passed.
- Supabase Edge suite: 255 passed.
- Production build: passed.
- Dependency audit: 0 vulnerabilities.
- Playwright production-bundle matrix: 200 passed / 28 intentional skips.
- Direct visual inspection at a 3440x1271 desktop viewport measured the
  Parachute card at 422.25px, its information column at 230.25px, and its
  purchase control at 140px; both children were contained and separated. The
  rendered card clearly shows the effect summary beside `$4,000` and `+1`.

No Supabase, migration, auth, dependency, engine, or economy file changed.

## Adversarial review remediation

The first final-diff review returned three Medium merge blockers:

1. Purchase buttons lacked item-specific accessible names. RED: the new causal
   role/name test reported `Missile purchase control: expected null to be type
   of string`. The minimal fix gives every weapon and accessory action a stable
   `Buy <item> for <price>, bundle of <quantity>` label.
2. The geometry oracle allowed a zero-width information column and did not
   require the declared card gap. It now requires at least 48 logical pixels,
   contained info content, and the rendered equivalent of the computed 8px gap.
   The original browser RED's measured 0px Parachute info width is a causal
   mutation that this strengthened oracle rejects.
3. The canonical sprint log is invalid UTF-8 at byte 461641. A scoped,
   non-security `$ca-override` is appended to `.codearbiter/overrides.log`,
   authorizing this UTF-8 receipt for `reliability.store.0001` only while
   preserving the historical file byte-for-byte.

Post-remediation verification repeated the complete matrix: 1,032 client tests
with the same coverage thresholds, deterministic/typecheck, 255 Edge tests,
production build, zero-vulnerability audit, and Playwright 200 passed / 28
intentional skips. Focused remediation evidence is 16 DOM tests and all three
geometry projects green.

The exact remediated package received adversarial CLEAR: all three original
Medium blockers are resolved, no new findings were raised, and final counts are
Critical 0, High 0, Medium 0, Low 0, merge blockers 0.

## Delivery

PR #348 exact final head `b5017282e51849e9cbcd5c94f1f1e712d54ad30d`
received exact-head adversarial CLEAR with zero findings and cleared CI run
`31295479507`, CodeQL run `31295479510` plus its success status, and CodeRabbit
before squash merge to `main` as `817a068b1254fcd686b40a550bc85a9e93f441d1`.

Post-merge CI `31295628374`, CodeQL `31295628370`, and Pages `31295628375`
passed on that exact main SHA. The production page, deployment metadata, and
current JavaScript asset return HTTP 200; metadata reports the exact main SHA
and Pages run, and the live asset contains the Store quantity, Parachute, and
card markers. The deployed geometry guard passed desktop-fine, pixel-touch, and
small-window directly against GitHub Pages. No Supabase file changed, so no
backend deployment was required. Task `reliability.store.0001` is done;
`mvp2.progression.0006` remains queued as the next persistent-player priority.
