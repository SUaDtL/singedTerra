# Spec: Cockpit-style HUD instrument cluster

**Issue:** GH #44 · **Lane:** /ca:feature · **Stage:** 1 · **Scope:** frontend only (`client/src/ui/HUD.ts` + CSS, new `client/src/ui/gaugeMath.ts`)

## Problem

Mid-turn, the active instruments — elevation, wind, power — render as a flat line
of digits (`PlayerName · Elev 45° ↗ · Power 70`, `Wind → 3.2`). They don't parse at
a glance the way an artillery cockpit should. Worse, the power element escapes its
HUD column to the right and forces a horizontal scrollbar in the HUD/menu column.

## Scope

**In:** Replace the three flat digital readouts (elevation, wind, power) with **analog
SVG gauges** consolidated into a **single bordered "instrument cluster" panel** in the
HUD side column. Each gauge keeps its exact numeric value as an on-gauge label. The
redesign replaces the overflowing power element, so the scrollbar disappears with it.

**Out of scope:**
- No change to what the values mean, to the engine, or to any `shared/` code.
- No new instruments beyond elevation / wind / power. Player N stays a **text label**, not a gauge.
- Weapon readout is not a gauge (it's a name) — may be repositioned to fit the panel but its content is unchanged.
- Nothing is drawn into the game **canvas** — instruments are HTML/SVG in the HUD DOM (project convention).
- No determinism/network behavior change.

## Design decisions (resolved this session)

- **Render medium: SVG** — dial arc (`<path>`) + transform-rotated needle (`<line>`), numeric `<text>`/HTML labels. Colors from the shipped CRT tokens (`--accent-gold` `#ffd23f`, `--accent-ember` `#ff7a1f`), numerics in the mono face. Must hold to the shipped `theme.ts`/`style.css :root` look.
- **Layout: consolidate** elevation + wind + power into one framed panel (row of 3 gauges) in the HUD side column. Larger reflow → mobile/touch layout must be retested.

## Testable acceptance criteria

These map 1:1 to `tdd` Phase 1 obligations. Each is verified by the harness
`scripts/checks/gaugemath.mjs` (pure, DOM-free — imported via `tsx`) unless noted.

1. **Power fill mapping** — `gaugeFraction(value, min, max)` returns the clamped
   linear fraction in `[0,1]`: `(0,0,100)=0`, `(100,0,100)=1`, `(70,0,100)=0.7`,
   `(-5,0,100)=0`, `(140,0,100)=1`.
2. **Wind needle mapping** — `windNeedleOffset(wind, maxWind)` returns a signed
   deflection in `[-1,1]`: `(0,10)=0`, `(10,10)=1`, `(-10,10)=-1`, `(15,10)=1`,
   `(-15,10)=-1`. Sign encodes direction (right positive, left negative).
3. **Elevation needle mapping** — `elevationNeedleDeg(angle)` maps the engine's
   global barrel angle (0=right, 90=up, 180=left) to the needle rotation, clamped
   to `[0,180]`, monotonic: `0→0`, `90→90`, `180→180`, `-30→0`, `210→180`.
4. **Numbers retained (label formatters)** — formatters return the exact on-gauge
   string for given input: power label = rounded integer (`70.4 → "70"`); wind label =
   magnitude to one decimal (`3.24 → "3.2"`) plus a direction symbol (`+→`, `-←`,
   `~0→•`); elevation label preserves the existing barrel-relative `N° dir` format
   (reuse the current `aimReadout`/elevation helper — do **not** duplicate it).
5. **Determinism-safe / canvas untouched** — verified by command, not the browser:
   `npm run check` stays green (all determinism harnesses pass) AND `git diff --stat`
   shows **no change under `shared/`** and **no change to the canvas renderer path**
   (`client/src/renderer/`). `gaugeMath.ts` is pure (no `Date.now`/`Math.random`/DOM).

## Design-review & manual gates (not unit-testable)

The visual outcome has no DOM test framework in this repo, so it is gated by the
`design-quality-reviewer` agent plus a manual check — required to pass, but not
numbered obligations:

- **D1 — Cockpit look** — the three instruments render as SVG gauges in one bordered
  panel, using the shipped CRT tokens (gold/ember accents, mono numerics, CRT-consistent
  borders). Design-reviewed.
- **D2 — Overflow bug gone (the subsumed #44 bug)** — no instrument overflows its
  column; **no horizontal scrollbar** in the HUD/menu column at desktop AND a
  representative mobile width. Verified by manual check at both widths + design review.
- **D3 — Touch/mobile intact** — the consolidated panel does not break the touch
  strip or the `zoom`-based responsive scaling. Manual check on a coarse-pointer width.

## Open questions

None — both load-bearing trade-offs (render medium, layout scope) were resolved during
brainstorming. No `[CONFIRM-NN]` outstanding.
