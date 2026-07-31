# singedTerra documentation

This directory separates current product documentation from historical project
records. Start with the guide that matches the work in front of you.

## Play

- [Playing singedTerra](PLAYING.md): match setup, controls, touch input,
  weapons, economy, rounds, and online rooms.
- [Project README](../README.md): the visual product overview, live game link,
  quickstart, and repository map.

## Build

- [Architecture](ARCHITECTURE.md): runtime modes, deterministic lockstep,
  terrain, action flow, and trust boundaries.
- [Development and operations](DEVELOPMENT.md): local setup, commands, test
  layers, Supabase configuration, and deployment.
- [UI system](UI_SYSTEM.md): visual direction, tokens, responsive composition,
  asset policy, accessibility, and browser QA.
- [Contributing](../CONTRIBUTING.md): branch, review, and determinism rules.

## Define

- [Product and system specification](SPEC.md): the maintained contract for
  gameplay, networking, rendering, and operations.
- [Delivery status](TASKS.md): what is shipped, what is active, and where new
  work is tracked.

## Project records

These files preserve decisions and findings from a point in time. They are not
the current product contract.

- [Review backlog](REVIEW_BACKLOG.md) and
  [verified findings](REVIEW_FINDINGS.md): the June 2026 adversarial review and
  its follow-up status.
- [`archive/`](archive/): completed sprint plans retained for provenance.
- [`reports/`](reports/): dated review and implementation packets.
- [`reference/`](reference/): source material used for catalog and balance
  research.

Governance state, approved sprint specifications, and the live task ledger are
stored under [`.codearbiter/`](../.codearbiter/). GitHub Issues is the public
work queue.

## Source of truth

When documentation disagrees with code, resolve the drift in this order:

1. `shared/src/engine/` and `shared/src/types/` for deterministic gameplay.
2. `client/src/client/NetworkClient.ts` plus `supabase/functions/` for the
   network action contract.
3. `client/src/ui/`, `client/src/renderer/`, and `client/src/style.css` for the
   current player experience.
4. This documentation set.
5. Dated reports and archived sprint plans.
