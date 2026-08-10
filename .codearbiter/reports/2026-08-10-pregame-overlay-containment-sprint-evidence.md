# Pregame overlay containment sprint evidence

Date: 2026-08-10
Task: `ux.pregame.0002`

This UTF-8 report is the scoped sprint decision/test record under the existing
sanctioned malformed historical `.codearbiter/sprint-log.md` exception. The
historical sprint log was not read or modified.

## SMARTS decisions

1. **Stage-owned overlay selected (high confidence).** A stronger translucent
   floating card was rejected because it preserves the visually orphaned
   composition. Full navigation routes were rejected as unnecessary state and
   navigation scope. The selected overlay keeps base state mounted/inert while
   removing it from the visual composition.
2. **Opaque base suppression selected (high confidence).** Blurring or dimming
   would still expose the high-contrast Vehicle Bay, terrain art, and borders
   that caused the reported ghosting. The active modal therefore visually owns
   the stage and the base card has computed opacity zero.
3. **Variant-specific surface width selected (high confidence).** Account uses
   a focused record/auth console; Operations uses a wider aligned console.
   Sharing lifecycle code does not require forcing unlike content into one
   width.
4. **Compact one-column operations form selected (high confidence).** The
   whole-stage zoom makes viewport media queries insufficient for Pixel and
   small-window profiles, so the existing `#app.is-compact` signal owns the
   collapse.

## Test-first evidence

- `LobbyOverlayView.test.ts` RED: 2 of 3 failed because neither the
  `operations`/`account` variant class nor the `stage-modal` data contract
  existed. The minimal typed primitive/call-site change made the focused overlay,
  account, and advanced suites GREEN at 14 of 14.
- First browser attempt was discarded: the isolated preview listened only on
  IPv6 localhost while the run targeted `127.0.0.1`, so connection-refused did
  not count as behavior evidence.
- Valid browser RED across all three projects: Account and Operations each
  reported computed `position: fixed` where stage-owned absolute geometry was
  required. Account initially required a production rebuild with the normal E2E
  public Supabase fixture environment before its trigger existed; after that,
  all three Account cases failed for the intended positioning reason.
- GREEN: 6 of 6 focused production-bundle cases passed across desktop-fine,
  pixel-touch, and small-window with full-stage overlay/backdrop bounds, base
  suppression, surface containment/scroll ownership, variant identity,
  operations alignment/compact stacking, and focus restoration.
- Visual inspection then caught bright native number inputs. A new rendered
  palette assertion started RED with background channel 255 (required <=20),
  then passed after the overlay received dark controls and dark color-scheme.
- Causal ghosting mutation changed base-card opacity from 0 to 1. The
  small-window Operations browser oracle failed exactly `Expected: 0,
  Received: 1`; the mutation was reverted before final verification.

## Visual inspection

The rebuilt compact and 1600x900 desktop states were inspected directly. The
base Vehicle Bay, controls, panel borders, and terrain artwork are absent while
either overlay is open. Account appears as a centered record/auth console.
Operations appears as one contained command surface with dark controls, aligned
desktop label/control/explanation columns, and a scroll-owned compact stack.

## Full verification

- A first parallel full-suite run was rejected as resource-contention evidence:
  the new progression composition file timed out once and observed one duplicate
  asynchronous call while the machine simultaneously ran the engine, Edge, and
  browser suites. The focused file then passed 4 of 4 and the complete client
  suite passed 148 files / 1,145 tests when run alone.
- `npm run check`: passed, including typecheck and every deterministic harness.
- `npm run check:edge`: 267 passed, 0 failed.
- `npm run audit:deps`: zero vulnerabilities.
- Production build: passed with the normal E2E public Supabase fixture values.
- Complete isolated non-live production browser matrix: 249 passed, 30
  intentional profile skips. Port 4174 was stopped after the run; the unrelated
  port-4173 listener remained PID 106692.

## Canonical staged gates

- The exact bounded slice was staged with no unstaged or untracked product
  files.
- The canonical security pass recorded 0 sensitive lines.
- The canonical migration pass recorded 0 migration files.

## Adversarial correction cycle

- Exact package `35937264d2f087e788e4030abfd2c26f0b10b036` was BLOCKED
  with one Medium merge blocker: the Operations oracle did not prove rows were
  mutually non-overlapping, horizontally contained, bounded on desktop, or
  reachable through the surface scroll range.
- The browser oracle now checks descendant horizontal containment, DOM-ordered
  row non-overlap, a 340 CSS-pixel desktop control bound, and last-row
  reachability after scrolling the surface to its maximum.
- A causal mutation applied `margin-top: -50px` to every Operations row after
  the first. All three browser profiles failed the new row-overlap assertion;
  the mutation was reverted, the production bundle rebuilt, and all three
  profiles passed.
- The corrected two-spec production-browser run passed 33 tests with 3
  intentional desktop-only fixture skips.
- A second adversarial pass found that the reachability check was one-sided and
  the explicit desktop width bound omitted the first row. The oracle now proves
  the final row lies between both vertical surface edges after maximum scroll
  and applies the computed-width bound to every desktop control.
- A causal `translateY(-1000px)` mutation failed final-row reachability in all
  three profiles. A separate first-control `width: 360px` mutation failed the
  desktop computed-width bound at the intended assertion. Both mutations were
  reverted before final verification.

## PR coverage correction cycle

- The PR coverage audit found one Medium merge blocker: browser tests did not
  distinguish the focused Account surface from the wider Operations surface.
- Desktop Account now requires a computed width from 650 through 720 CSS pixels;
  desktop Operations requires 900 through 1040. Compact profiles continue to
  use their stage-containment contract instead of desktop width assumptions.
- A causal selector-value swap made Account 1040px and Operations 720px. Both
  desktop tests failed at their intended width assertions while compact/touch
  containment remained green. The mutation was reverted before final proof.
