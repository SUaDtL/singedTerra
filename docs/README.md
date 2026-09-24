# singedTerra documentation

Start with the guide that matches what you want to do. The first group
describes the current game and repository. Dated reports, rollout records, and
archived plans preserve the state that existed when they were written.

## Play and explore

- [Project overview](../README.md): current screenshots, play modes, controls, local setup, and repository map.
- [Playing singedTerra](PLAYING.md): deployment routes, Garage, battle console, weapons, economy, rounds, and online rooms.

## Build and operate

- [Architecture](ARCHITECTURE.md): deterministic engine, browser composition, online command log, and verified replay boundary.
- [Development and operations](DEVELOPMENT.md): requirements, local setup, test layers, Supabase configuration, and release boundaries.
- [CI coverage and execution cost](CI.md): change selection, parallel suites, caches, release integrity, and measured timings.
- [Classic weapon balance laboratory](WEAPON_BALANCE.md): bounded actual-engine measurements, fixture limits, and baseline evidence; no live catalog tuning.
- [UI system](UI_SYSTEM.md): bronze console direction, responsive modes, semantic controls, assets, accessibility, and browser review.
- [Contributing](../CONTRIBUTING.md): branch, review, determinism, and security expectations.
- [V3 desktop diagnostic](performance/v3-desktop-diagnostic.md): measured first play and repeated-match ownership, with explicit device and measurement limits.

## Product contract

- [Product and system specification](SPEC.md): maintained gameplay, network, rendering, security, and operational contract.
- [Delivery history](TASKS.md): completed work and retained task records.

## Current screenshots

The screenshots below were captured from the real production build on
2026-09-13. The compact view uses Pixel 5 landscape browser emulation; it is
evidence of the responsive browser layout, not a physical-device test.

| View | Asset |
|---|---|
| Desktop battlefield and battle console | [`current-battle-hud.jpg`](assets/current-battle-hud.jpg) |
| Deployment chooser | [`current-deployment-console.jpg`](assets/current-deployment-console.jpg) |
| Practice preparation | [`current-practice-preparation.jpg`](assets/current-practice-preparation.jpg) |
| Local Battle Garage result | [`current-tank-garage.jpg`](assets/current-tank-garage.jpg) |
| Compact battlefield and controls | [`current-compact-hud.jpg`](assets/current-compact-hud.jpg) |

## Specialized operational guides

- [Crosswind Qualification backend rollout](deployment/verified-challenge-cq1.md): disabled-first release, hosted evidence, and admission controls.
- [cq1 work limits](compatibility/cq1-work-limits.md): retained corpus, work accounting, and configured verifier caps.
- [Verified V2 cutover](VERIFIED_V2_CUTOVER.md): historical compatibility and recovery procedure for the earlier verified protocol.
- [Room lifecycle rollout](ROOM_LIFECYCLE_ROLLOUT.md): historical room cleanup release and rollback record.

Crosswind Qualification remains unavailable for public admission until its
separate backend release, hosted proof, and enablement steps are approved and
completed. Client code and local verification do not establish a live reward.

## Current reassessment

- [V3 correctness acceptance](reports/reassessment-v3-correctness-acceptance.md): reviewed fixes, exact delivery evidence, and remaining physical checks. This does not close the separate product experiments.

## Historical records

- [`archive/`](archive/): completed sprint plans.
- [`reports/`](reports/): dated review and implementation packets.
- [Review backlog](REVIEW_BACKLOG.md) and [review findings](REVIEW_FINDINGS.md): the June 2026 review and its follow-up status.
- [Software recovery record](SOFTWARE_RECOVERY.md): evidence and delivery notes for the recovery program.

Historical documents can name old layouts, versions, or pending work. Use the
maintained guides above for current behavior, then consult source and executable
tests when exact implementation details matter.

## Source of truth

1. `shared/src/engine/` and `shared/src/types/` define deterministic gameplay.
2. `client/src/client/NetworkClient.ts`, shared replay code, and `supabase/functions/` define online commands.
3. `client/src/ui/`, `client/src/renderer/`, and `client/src/style.css` define the current player experience.
4. The maintained guides in this directory explain those contracts.
5. Dated reports and archived plans retain historical context.
