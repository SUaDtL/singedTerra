# Compact Pre-game Command Legibility

Task: `ux.pregame.0004`
Status: approved by the standing improvement goal
Date: 2026-08-10

## Player problem

The shared command-preparation shell fits the fixed game stage, but at the live
1024x599 compact viewport it is visually reduced to a postcard. Route labels and
supporting text render at roughly 8-11 physical pixels, so the action hierarchy is
hard to scan. The decorative `lobby-card::before` battlefield plane occupies the
same bounds as the real Vehicle Bay and adds a second border/background beneath it;
that duplicated plane reads as accidental ghosting rather than intentional depth.

## SMARTS decision

Three bounded approaches were compared.

1. Delete only the duplicate decorative border. This removes one defect but leaves
   the compact command hierarchy sub-legible.
2. Correct the lobby only under the existing `#app.is-compact` contract: keep the
   global stage scale, remove the duplicate preview plane, enlarge operational text
   and controls to measurable rendered minimums, and preserve the current two-column
   route/Vehicle Bay composition. This is selected.
3. Replace global fixed-stage zoom with a responsive application shell. This could
   ultimately improve every game surface, but it crosses the battlefield/HUD layout
   boundary and repeats the broader-risk option explicitly deferred by the previous
   local-preparation slice.

Option 2 is Specific to the production defects, Measurable in rendered geometry and
pseudo-element state, Attainable in the existing scoped lobby stylesheet, Relevant to
the pre-game overhaul, Time-bounded to one visual slice, and Strong because it fixes
both hierarchy and compositing without changing behavior. The accepted ADR-0004 DOM
overlay model is preserved. No accepted ADR or open deferral is superseded.

## Player outcome

At compact fine-pointer and landscape-touch sizes, Hot Seat and Play Online read as
an authored command console rather than a shrunk desktop screenshot. The selected
route, primary action, setup summary, tabs, and Vehicle Bay identity are legible at a
glance. The Vehicle Bay owns one visible frame and one battlefield treatment; no
same-sized decorative frame shows through or sits behind it.

## Acceptance criteria

1. The generated style disables the obsolete `lobby-card::before` preview plane; the
   real `.lobby-preview` remains present and retains its terrain, tank, and roster art.
2. On supported compact projects, the physical rendered size (`computed font-size *
   #app zoom`) is at least 12px for route headings, mode tabs, primary actions, ready
   summaries, account trigger, and Vehicle Bay identity; purely technical micro-labels
   remain at least 10px.
3. Hot Seat and Online create retain one visible dominant primary action, the active
   route remains obvious, and primary actions stay inside the lobby stage without
   document overflow at `small-window` and `pixel-touch` sizes.
4. Desktop-fine composition does not grow or reflow: its existing route/preview grid,
   account integration, control legend, and progressive-disclosure behavior remain
   intact.
5. While compact Hot Seat customization is open, Quick Duel remains available,
   both route tabs and Quick Duel retain at least a 24px physical target height,
   and keyboard tab switching still reaches Play Online.
6. Existing accessible names, tab semantics, focus behavior, callbacks, room request
   shapes, setup values, account state, Garage behavior, match launch, and gameplay do
   not change.
7. A causal mutation that restores the duplicate plane or reduces a protected compact
   label below its rendered minimum fails the browser contract.

## Scope and exclusions

- Modify scoped lobby CSS, its focused unit/browser contracts, and `main.ts` only
  to publish the inverse-zoom compact command-choice target already computed by
  the fixed-stage scaler; the scale algorithm itself remains unchanged.
- No new route, modal, asset, dependency, backend, Auth, Supabase, migration,
  persistence, deterministic engine, in-match HUD, or global stage-scaling change.
- Do not read or modify the malformed historical `.codearbiter/sprint-log.md`; this
  UTF-8 spec, plan, and sprint-evidence report are the durable decision record.

## Delivery obligations

Run focused RED/GREEN browser evidence, full pre-game browser coverage, client tests,
deterministic and Edge checks, type/build, dependency audit, secret scan, and mutation
proof. Give one adversarial reviewer the spec, plan, sprint evidence, tests, and exact
final diff; resolve every Critical, High, and merge-blocking finding before exact-head
hosted CI, guarded merge under standing authority, Pages deployment, and production
provenance/health verification.
