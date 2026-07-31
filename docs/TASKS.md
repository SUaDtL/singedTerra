# Delivery status

Updated 2026-07-31.

This is a product status snapshot, not the live task ledger. Current work is
tracked in [GitHub Issues](https://github.com/SUaDtL/singedTerra/issues) and
governed under [`.codearbiter/`](../.codearbiter/).

## Playable now

### Match and combat

- 2–4 player hot-seat and online matches
- Human and deterministic CPU seats
- Fixed-step ballistics with wind, gravity, and open, reflective, or wrap
  side-wall options
- Per-pixel destructible terrain, terrain raising, collapse, settlement, and
  burial
- Sixteen implemented weapons, including airbursts, napalm, terrain tools,
  Sandhog tunneling, and Shield
- Fuel-limited deterministic movement
- Credits, finite ammo, Store purchases, Batteries, and Fuel Tanks
- Best-of-N rounds, between-round shop, scoreboard, and persisted match result

### Player experience

- Authored raster splash and battlefield backdrop
- Modular tank Garage with four complete families and per-slot mixing
- Detailed tank renderer with team treatment and damage states
- Ballistic computer for elevation, power, and wind
- Barrel-relative trajectory guidance
- Desktop Command Deck and coarse-pointer touch controls
- Responsive fitted stage, compact HUD, and portrait-phone rotation gate
- Synthesized launch, impact, explosion, wall, napalm, shield, and miss audio
- Store, Arsenal, pause, connection, turn-watch, and game-over surfaces

### Online play

- Supabase public and private rooms
- Browseable public-room list
- Join by code, ready state, host start, recolor, rename, leave, and heartbeat
- Ordered action log with deterministic client replay
- Reconnect and refresh replay for an existing seat
- Atomic sequence allocation and turn validation
- Rematch and final-score persistence

### Delivery

- TypeScript and deterministic harness gate
- Client Vitest coverage
- Deno Edge Function tests
- Production Chromium layout and gameplay checks
- CodeQL
- GitHub Pages deployment with stale-source prevention, provenance, and live
  smoke verification

## Active direction

Near-term work favors visible player value and reliability:

- complete coarse-pointer control quality across supported landscape sizes;
- keep raising authored art and modular tank readability;
- tune weapon, economy, movement, collapse, and CPU feel through playtesting;
- reduce large UI modules without changing behavior;
- deepen client and network seam coverage;
- keep documentation aligned with the shipped product.

## Public backlog

Open bugs, enhancements, refactors, and dependency updates live in
[GitHub Issues](https://github.com/SUaDtL/singedTerra/issues).

The June 2026 whole-codebase review is retained in
[REVIEW_BACKLOG.md](REVIEW_BACKLOG.md). Its opening status and individual
completion notes must be read before treating a finding as current.

## Historical plans

Completed sprint plans are preserved under [`archive/`](archive/). Dated audit
and review packets live under [`reports/`](reports/). They explain how the
project reached the current state but do not override
[SPEC.md](SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), or live source.
