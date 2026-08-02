# Interactive Command Deck Specification

## Intent

Turn the newly legible fine-pointer Command Deck into a real mouse command
surface. Its five cells currently look like controls but only document keyboard
shortcuts; clicking any keycap does nothing. The deck should let a player aim,
set power, move, cycle weapons, and commit Fire through the same callbacks the
touch dock and tactical rail already use.

## SMARTS selection

Three bounded candidates were compared:

1. Make the visible desktop keycaps interactive.
2. Add another renderer-only terrain or impact polish pass.
3. Optimize deterministic hard-bot shot search.

Approach 1 wins. It converts a prominent inert surface into immediate player
agency, follows directly from the legibility slice, and reuses proven input
seams without touching physics or replay. The visual polish candidate has lower
incremental impact after the recent explosion/impact series; the AI optimization
is valuable but less continuously visible and carries deterministic search risk.

## Player contract

- On fine-pointer layouts, the Command Deck still presents Aim, Power, Move,
  Weapon, and Fire in the same order and position.
- All nine displayed keycaps are semantic buttons with accessible action names:
  aim left/right, decrease/increase power, move left/right, cycle weapon, and
  Fire/Activate shield.
- Mouse clicks and keyboard activation of those buttons route through the same
  HUD callbacks as the existing touch dock, mobility rocker, Arsenal, and
  primary action. They do not synthesize browser keyboard events.
- Visible directions remain causal: left aim emits `+3`, right aim `-3`, power
  down `-3`, power up `+3`, move left `-8`, and move right `+8`.
- Aim, power, weapon, and Fire are disabled whenever the local player cannot
  act. Move uses the stricter existing fuel/alive/not-buried movement gate. Fire
  additionally requires usable selected ammo.
- The header identifies the surface as mouse-and-keyboard capable. Hover,
  active, disabled, and focus-visible states use the existing UI tokens; Fire
  remains the sole ember-primary row.
- The deck stays within its current 236px logical bounds, preserves Impact
  Monitor clearance, creates no page scroll, and remains hidden on coarse
  pointers. The existing touch dock is unchanged.

## Architecture

- Keep the five existing `.st-hud__control-cell` containers and replace only
  their inert key hints with nested `<button type="button">` command keycaps.
- Cache the new buttons once during `HUD.build()` and reconcile their disabled
  state in the existing `syncMobility()` and `syncStrip()` paths.
- Reuse `touchAngleCb`, `touchPowerCb`, `touchWeaponCb`, `moveCb`, and
  `primaryActionCb`; no new transport or game-action abstraction is introduced.
- Preserve the existing logical-stage fit transform and semantic design tokens.

## Boundaries

- Client HUD and tests only.
- No engine, physics, replay, action-log, networking, Supabase, backend, auth,
  crypto, secret, schema, migration, dependency, lockfile, or asset changes.
- No worktree or branch cleanup is part of this slice.

## Acceptance

- A focused HUD unit test first fails against the inert deck, then proves all nine
  semantic buttons, causal deltas/callbacks, keyboard activation, and state gates.
- Production-bundle Playwright proves a deck click changes live ballistic state,
  Fire enters the busy state, geometry remains bounded in both fine-pointer
  projects, and coarse-pointer controls remain isolated.
- Focused/full client tests, deterministic harness chain, Edge tests, production
  build, full Playwright matrix, dependency audit, secret scan, adversarial
  review, exact-head hosted CI, PR-only squash merge, exact-SHA Pages provenance,
  and production smoke all pass.
