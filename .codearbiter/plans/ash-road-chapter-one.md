# Ash Road Chapter One implementation plan

**Status:** Approved and executing under the combined `$ca-sprint` gate
**Spec:** `.codearbiter/specs/ash-road-chapter-one.md`
**Execution branch:** `codex/ash-road-chapter-one-current`
**Execution checkout:** `C:\Users\brenn\projects\singedTerra`
**Model policy:** Sol/Terra/Luna for all work except one ASTRA final campaign review at T-43. ASTRA is prohibited for T-01 through T-42 and T-44.

## Acceptance ledger

The governing ledger is AC-01 through AC-24 in the spec, lifted without semantic changes:

- AC-01 bound content graph
- AC-02 default compatibility
- AC-03 owned initialization and clone isolation
- AC-04 physical objects
- AC-05 deterministic effects and support
- AC-06 settled commitment authority
- AC-07 profile agreement
- AC-08 isolated campaign client
- AC-09 real Fuel Stop milestone
- AC-10 run reducer and checkpoint economy
- AC-11 durable local saves
- AC-12 campaign zones without classic drift
- AC-13 fair announced pressure
- AC-14 bounded objective-aware opponent
- AC-15 complete branching episode
- AC-16 current presentation architecture
- AC-17 accessible narrative and controls
- AC-18 asset and audio accountability
- AC-19 source-native balance evidence
- AC-20 bounded performance
- AC-21 honest shared-source provenance
- AC-22 full regression and browser proof
- AC-23 current-checkout delivery
- AC-24 final review and handoff boundary

The mechanical uncovered-intent pass returned empty. Negative judgment: if every criterion passed and nothing else changed, no machine-verifiable chapter obligation would remain broken; owner playtest, physical-phone observation, and subjective sound/art acceptance would remain honestly pending under AC-24 rather than being fabricated.

## Ordered task ledger

Every task enters `tdd` with the named obligation before implementation. Focused commands use paths relative to the workspace runner as required by the repository.

| ID | Paths | Verification | Maps to | Covers | Depends on | Status |
|---|---|---|---|---|---|---|
| T-01 | `.codearbiter/reports/ash-road-execution-baseline.md`, `.codearbiter/sprint-log.md` | `git status --short --branch` and `git rev-parse HEAD` match the caught-up checkout; report records package validation limits and model substitution | baseline and authority receipt | AC-23, AC-24 | — | ACCEPTED |
| T-02 | `scripts/checks/campaign_default_parity.mjs`, `scripts/checks/fixtures/campaign-default/**` | `npx tsx scripts/checks/campaign_default_parity.mjs` passes and its copied negative control fails on changed state | ordinary-mode compatibility oracle | AC-02, AC-21 | T-01 | ACCEPTED |
| T-03 | `shared/src/campaign/definitions.ts`, `scripts/checks/campaign_definitions.mjs` | `node --import tsx scripts/checks/campaign_definitions.mjs` and `npm -w @singedterra/shared run typecheck` reject unknown discriminants and prove detached frozen retained input | strict campaign domain contracts | AC-01, AC-03 | T-01 | ACCEPTED |
| T-04 | `client/src/campaign/content/episode.ts`, `client/src/campaign/content/story.ts`, `client/src/campaign/content/content.test.ts` | content tests prove four encounters, two routes, canonical profile equipment IDs, digest binding, and invalid-candidate rejection; Fuel Stop support pads and nested digests were corrected when strict T-16 construction exposed the packet slope conflict | source-owned episode graph | AC-01, AC-15, AC-17 | T-03 | ACCEPTED |
| T-05 | `shared/src/campaign/combatProfiles.ts`, `scripts/checks/campaign_combat_profiles.mjs` | `node --import tsx scripts/checks/campaign_combat_profiles.mjs` proves six choices, immutable numeric definitions, explicit reach, and unchanged default definitions | resolved campaign catalog | AC-07 | T-03 | ACCEPTED |
| T-06 | `scripts/checks/campaign_initialization.mjs` | `node --check scripts/checks/campaign_initialization.mjs` passes and `npx tsx scripts/checks/campaign_initialization.mjs` fails specifically because the owned initialization module is absent | authored initialization RED | AC-03 | T-03, T-05 | ACCEPTED |
| T-07 | `shared/src/campaign/initialization.ts`, `shared/src/engine/GameEngine.ts` | `npx tsx scripts/checks/campaign_initialization.mjs` passes without external `getState()` mutation; shared typecheck, ordinary parity, clone parity, determinism, movement, muzzle, and engine-purity checks remain green | owned initialization GREEN | AC-03, AC-07 | T-06 | ACCEPTED |
| T-08 | `scripts/checks/campaign_clone_parity.mjs`, `scripts/checks/engine_clone_parity.mjs` | campaign clone and post-construction caller-mutation cases pass while default clone parity and ordinary snapshot shape stay green | campaign clone isolation | AC-02, AC-03 | T-07 | ACCEPTED |
| T-09 | `scripts/checks/campaign_settlement.mjs` | syntax passes and the source-engine contract fails specifically on absent commitment/outcome modules before implementation; cases distinguish accepted commitments, once-only settlement, physical damage components, terminal scheduling, and simultaneous failure/success precedence | settled boundary RED | AC-06 | T-07 | ACCEPTED |
| T-10 | `shared/src/campaign/commitments.ts`, `shared/src/campaign/outcomes.ts`, `shared/src/campaign/initialization.ts`, `shared/src/engine/GameEngine.ts`, `shared/src/types/GameState.ts` | `node --import tsx scripts/checks/campaign_settlement.mjs` passes accepted/rejected fire and shield, causal fall attribution, profile-owned 90 Shield/no shopping/zero income, terminal precedence, clone replay, and rounds=1 without ordinary snapshot keys; independent rereview PASS | settled boundary GREEN | AC-02, AC-06 | T-09 | ACCEPTED |
| T-11 | `scripts/checks/campaign_objects.mjs` | syntax passes and the source-engine contract fails specifically on the absent object module; cases cover owned identities, earliest sweep, wrap remainder, movement blocking, AABB reach, deterministic direct hits, and no seat identity | object physics RED | AC-04 | T-07, T-10 | ACCEPTED |
| T-12 | `shared/src/campaign/objects.ts`, `shared/src/campaign/initialization.ts`, `shared/src/campaign/outcomes.ts`, `shared/src/engine/Physics.ts`, `shared/src/engine/Movement.ts`, `shared/src/engine/GameEngine.ts`, `shared/src/types/GameState.ts` | `npx tsx scripts/checks/campaign_objects.mjs` passes; fixed common-foot placement rejects unsupported/intersecting slopes; ordinary collision, arena-floor, walls/wrap, movement, determinism, replay, clone, blast-reach, and default-parity checks remain green; independent rereview PASS | object physics GREEN | AC-02, AC-04 | T-11 | ACCEPTED |
| T-13 | `scripts/checks/campaign_effects.mjs` | syntax passes and the source-engine contract fails specifically on absent effects/support modules; cases cover once-only activation, stable FIFO permutations, explicit provenance, support samples, repeated settlement, final-defender precedence, clone replay, and bound refusal | deterministic effects RED | AC-05, AC-06 | T-12 | ACCEPTED |
| T-14 | `shared/src/campaign/effects.ts`, `shared/src/campaign/support.ts`, `shared/src/campaign/outcomes.ts`, `shared/src/engine/GameEngine.ts` | `node --import tsx scripts/checks/campaign_effects.mjs` passes once-only bounded FIFO chains, original-foot support, technical refusal, clone/order invariance, and a final-defender chain that later destroys the refinery and yields failure; independent rereview PASS | deterministic effects GREEN | AC-05, AC-06 | T-13 | ACCEPTED |
| T-15 | `client/src/campaign/CampaignClient.test.ts`, `client/src/client/createModeClient.test.ts`, `client/src/main.campaign.test.ts` | focused RED produces only the intended absent-client/acquisition/ownership failures; client typecheck and 39 existing hot-seat/lifecycle tests remain green | campaign client RED | AC-08 | T-10, T-14 | ACCEPTED |
| T-16 | `client/src/campaign/CampaignClient.ts`, `client/src/client/GameClient.ts`, `client/src/client/createModeClient.ts`, `client/src/client/modeConfig.ts`, `client/src/main.ts` | campaign tests pass one client/CPU/rAF owner across enter/retry/quit/page restore, strict malformed/mixed rejection, and zero reward/backend writes; 131 ordinary lifecycle tests and typecheck pass; fresh rereview PASS | campaign client GREEN | AC-08, AC-23 | T-15 | ACCEPTED |
| T-17 | `client/src/client/GameClient.ts`, `client/src/client/inputCapabilities.ts`, `client/src/client/inputCapabilities.test.ts`, `client/src/campaign/CampaignClient.ts`, `client/src/input/InputHandler.ts`, `client/src/input/InputHandler.test.ts`, `client/src/ui/HUD.ts`, `client/src/ui/HUD.arsenal.test.ts`, `client/src/main.ts`, campaign acquisition/client/main tests | tests bind the canonical six-weapon roster through the real client, filter/guard HUD intents, reject forged/depleted selections, preserve fire-vs-shield cursor state, and retain ordinary roster parity; full client 2223/2223 and fresh rereview PASS | profile-aware controls | AC-07, AC-17 | T-05, T-16 | ACCEPTED |
| T-18 | `client/src/renderer/EncounterObjectRenderer.test.ts`, `client/src/ui/battleConsole/campaign-projection.test.tsx`, `client/src/ui/HUD.campaign.test.ts` | focused RED has seven intended failures on missing world renderer, HUD campaign/null projection, and single-tree objective facts; typed fire intent remains green; nearby Canvas/Preact/Pixi/HUD baselines and typecheck pass | first-playable presentation RED | AC-16, AC-17 | T-12, T-16 | ACCEPTED |
| T-19 | EncounterObjectRenderer/Renderer, HUD and battle-console types/tree, plus `projectState.ts` and mount/visual-state regressions | focused 16/16 and nearby 803/803 pass: canonical Canvas objects, visible failed-asset health labels, lazy ordinary path, finite motion, detached semantic facts, real mounted campaign updates, and explicit ordinary null; fresh rereview PASS | first-playable presentation GREEN | AC-16, AC-17 | T-18 | ACCEPTED |
| T-20 | `client/src/campaign/content/fuel-stop.ts`, `shared/src/campaign/fuelStop.test.ts`, `scripts/checks/campaign_fuel_stop.mjs` | source-engine fixture replays three accepted commitments for preserve and deliberate detonation, recomputes the real bounded CampaignClient-equivalent hard-AI turn, and proves legal support, exact outcomes, clone/replay/pacing parity, ordinary isolation, both typechecks, and fresh independent PASS | Fuel Stop engine slice | AC-09 | T-14, T-16, T-19 | ACCEPTED |
| T-21 | `client/src/campaign/checkpoint.ts`, `client/src/campaign/checkpoint.test.ts`, `client/src/campaign/runReducer.ts` | 10 focused and 19 adjacent tests prove canonical detached checkpoint reconstruction, exact seed/kit/object retry, real failure-only retry, once-only Fuel Stop supplies, and bounded committed-command replay that rejects forged terminal state and state-changing journal drift; full client 2249/2249 and fresh independent PASS | Fuel Stop checkpoint | AC-09, AC-10 | T-20 | ACCEPTED |
| T-22 | public Lobby entry; CampaignClient/main receipt+retry lifecycle; HUD/Preact campaign projection and typed retry intent; `e2e/campaign-fuel-stop.spec.ts`, `e2e/support.ts`; focused tests | six production-browser journeys play preserve/detonation across desktop, touch and small-window through public controls, real CPU turns and exact failure/retry; 2256 client tests, both typechecks, direct build, campaign/default/clone parity, committed-journal stress and fresh independent PASS | Fuel Stop browser acceptance | AC-08, AC-09, AC-16, AC-17 | T-21 | ACCEPTED |
| T-23 | loadout/run reducer plus strict campaign descriptor, shared engine initialization, acquisition/replay and focused integration tests | 9 focused economy tests plus real non-default client acquisition prove route/supplies/hull/ammo/decision/patch/retry idempotency, a zero-supplies legal basic loadout, actual terminal settlement, exact pre-attempt restoration, fail-closed overrides, legacy two-key parity, full client/typecheck/build and fresh independent PASS | run economy | AC-07, AC-10 | T-21 | ACCEPTED |
| T-24 | `client/src/campaign/storage.ts`, `client/src/campaign/storage.test.ts` | 8 focused tests prove strict v1/content-bound deterministic records, real IndexedDB open/readwrite sequencing, revision CAS, stale/content/unknown refusal, blocked/error cleanup and opaque retention; full client/typechecks/build and fresh rereview PASS | storage transaction core | AC-11 | T-23 | ACCEPTED |
| T-25 | `client/src/campaign/replay.ts`, replay/storage failure tests and canonical run-replay helpers | focused tests prove strict content/version-bound accepted-command replay to a safe boundary, obsolete or extra field refusal, duplicate-result ledger, sticky stale-tab read-only/reload, unknown retention and pre/post-commit save honesty; forged unavailable weapon correction, full client/typechecks/parity/build and fresh PASS | durable replay and failure states | AC-11 | T-24 | ACCEPTED |
| T-26 | `shared/src/campaign/zones.test.ts`, `scripts/checks/campaign_zones.mjs` | 5 focused contracts and source harness fail only because the zone owner is absent; cover birth skip, absolute expiry, overlap max-once, movement-step immunity, shield absorption and terrain reprojection | zone semantics RED | AC-12 | T-10, T-19, T-23 | ACCEPTED |
| T-27 | `shared/src/campaign/zones.ts`, `shared/src/engine/GameEngine.ts`, `client/src/renderer/EncounterZoneRenderer.ts`, `client/src/renderer/Renderer.ts` | campaign-zone checks pass while classic Napalm, default replay, clone, and speed parity remain green | zone semantics GREEN | AC-02, AC-12, AC-16 | T-26 | ACCEPTED |
| T-28 | `shared/src/campaign/warnings.test.ts`, `scripts/checks/campaign_warnings.mjs` | RED tests cover fixed target, due commitment, source cancellation, actual reach, fuel exhaustion, and legal guaranteed-equipment response | warning semantics RED | AC-13 | T-14, T-19, T-23 | ACCEPTED |
| T-29 | `shared/src/campaign/warnings.ts`, `shared/src/engine/GameEngine.ts`, `client/src/renderer/EncounterWarningRenderer.ts`, `client/src/renderer/Renderer.ts` | warning checks pass including relay destruction before an unfired strike | warning semantics GREEN | AC-13, AC-16 | T-28 | ACCEPTED |
| T-30 | `shared/src/campaign/tactics.ts`, `shared/src/campaign/tactics.test.ts`, `scripts/checks/campaign_ai.mjs`, `client/src/campaign/CampaignClient.ts` | deterministic AI checks prove bounded work, incomplete-candidate rejection, stale-generation cancellation, objective choices, and plan reuse | campaign opponent | AC-14, AC-20 | T-23, T-27, T-29 | ACCEPTED |
| T-31 | `client/src/campaign/content/high-road.ts`, `scripts/checks/campaign_high_road.mjs` | retained legal transcripts prove survival-or-elimination and at least one legal warning response | High Road content | AC-13, AC-15 | T-29, T-30 | ACCEPTED |
| T-32 | `client/src/campaign/content/salvage-pit.ts`, `scripts/checks/campaign_salvage_pit.mjs` | retained legal transcripts prove cache-preserve and aggressive paths without optional rewards | Salvage Pit content | AC-15 | T-30 | ACCEPTED |
| T-33 | `client/src/campaign/content/relay-ridge.ts`, `scripts/checks/campaign_relay_ridge.mjs` | retained legal transcripts prove relay, footing, and direct-gun counterplay at 100 hull | Relay Ridge content | AC-13, AC-15 | T-31, T-32 | ACCEPTED |
| T-34 | `scripts/checks/campaign_episode.mjs`, `e2e/campaign-episode.spec.ts` | engine journeys complete both routes and browser journey reaches each finale without synthetic state | complete episode mechanics | AC-15, AC-22 | T-25, T-27, T-33 | ACCEPTED |
| T-35 | `client/src/campaign/story.ts`, `client/src/campaign/story.test.ts`, `client/src/ui/battleConsole/types.ts`, `client/src/ui/battleConsole/components/CampaignPanel.tsx`, `client/src/ui/battleConsole/components/CampaignPanel.test.tsx`, `client/src/ui/HUD.ts` | focused tests prove factual/skippable beats, focus restoration, durable route choice, supplies, repairs, refills, and carried kit | narrative and checkpoint UI | AC-10, AC-16, AC-17 | T-23, T-25, T-34 | ACCEPTED |
| T-36 | `client/src/assets/campaign/manifest.ts`, `client/public/art/campaign/ash-road-drum.webp`, `client/public/art/campaign/ash-road-refinery.webp`, `client/public/art/campaign/ash-road-relay.webp`, `client/public/art/campaign/ash-road-cache.webp`, `client/public/art/campaign/ash-road-siege.webp`, `client/public/art/campaign/ash-road-panorama.webp`, `docs/ART_PROVENANCE.md` | asset manifest/provenance test verifies required states, hashes, source rights, and readable fallback; actual-size captures are inspected; wreck-only scenes request no image and cannot keep the aggregate renderer animating; fresh independent rereview PASS | bounded art family | AC-17, AC-18, AC-20 | T-19, T-34 | ACCEPTED |
| T-37 | `client/src/audio/CampaignAudio.ts`, `client/src/audio/CampaignAudio.test.ts`, `client/src/audio/AudioEngine.ts` | focused tests prove four deduplicated cues, sound-off equivalence, stale-event suppression, and no mechanical waits | bounded audio family | AC-17, AC-18 | T-14, T-29, T-35 | ACCEPTED |
| T-38 | `scripts/checks/campaign_balance.mjs`, `scripts/checks/fixtures/campaign-balance/**`, `.codearbiter/reports/ash-road-balance.md` | 68 deterministic source-engine probes include 55 retained, 12 genuinely held-out across four disjoint terrain/spawn/object/shield definitions, and one full-shape intentional incomplete; strict fixture negatives and fresh independent rereview PASS | balance selection evidence | AC-07, AC-09, AC-13, AC-15, AC-19 | T-30, T-34 | ACCEPTED |
| T-39 | `scripts/checks/campaign_performance.mjs`, `.codearbiter/reports/ash-road-performance.md` | named desktop run binds exact source/artifact/revision/build identities, canonical 256-command receipt cap, AI work, collection maxima, bundle delta and entry latency; fresh independent rereview PASS | bounded performance evidence | AC-20 | T-34, T-36, T-37, T-38 | ACCEPTED |
| T-40 | `client/src/campaign/CampaignClient.ts`, `client/src/campaign/CampaignClient.test.ts`, `client/src/main.ts`, `client/src/main.campaign.test.ts`, `e2e/campaign-fuel-stop.spec.ts`, `e2e/campaign-episode.spec.ts`, `e2e/campaign-accessibility.spec.ts` | production-built Playwright journeys pass wide, standard, compact, keyboard, real touch, sound-off, reduced-motion, retry, resume, and asset-failure cases; deferred journal-capture, real-CAS generation rollover, and quit-during-drain regressions prove durable lifecycle ordering | integrated browser and durable-resume acceptance | AC-09, AC-11, AC-15, AC-16, AC-17, AC-18, AC-22 | T-35, T-36, T-37, T-39 | ACCEPTED |
| T-41 | `supabase/backend-release-manifest.json`, `docs/compatibility/st1-source-manifest.json`, `scripts/ci/backendRelease.test.mjs`, `.codearbiter/reports/ash-road-shared-digest.md` | backend release 46/46 and ST1 32/32 pass; only the backend shared-tree digest and hashes for nine intentionally changed already-bound ST1 inputs are recomputed, with membership/enforcement unchanged and retained bytes/tuples/migrations unchanged; fresh independent rereview PASS | honest shared provenance | AC-02, AC-21 | T-27, T-29, T-30 | ACCEPTED |
| T-42 | `.codearbiter/reports/ash-road-verification.md` | fresh `npm run typecheck`, `npm run check`, `npm run test:client`, `npm run check:edge`, `npm run build`, applicable asset checks, and campaign Playwright commands pass from the current checkout | full regression receipt | AC-02, AC-20, AC-21, AC-22, AC-23 | T-40, T-41 | ACCEPTED |
| T-43 | `.codearbiter/reports/ash-road-final-review.md` | one fresh ASTRA reviewer independently maps every AC/task to evidence, inspects source/screens, reruns bounded checks, and reports unsupported claims or PASS | final campaign review only | AC-02, AC-21, AC-22, AC-24 | T-42 | ACCEPTED |
| T-44 | `.codearbiter/reports/ash-road-owner-playtest.md`, `.codearbiter/reports/ash-road-sprint-receipt.md` | non-ASTRA handoff links start instructions, exact tests/hashes, low-confidence decisions, pending owner/phone/audio checks, rollback, and reports `ready for owner playtest` without release claims | owner handoff | AC-18, AC-20, AC-23, AC-24 | T-43 | ACCEPTED |

## MVP slice

**T-01 through T-22** are the first independently playable slice. They establish default compatibility, engine-owned campaign contracts, real objects and causal settlement, isolated client ownership, current battle-console presentation, and both viable Fuel Stop paths with reliable retry. The MVP intentionally stops before durable IndexedDB storage, both branches, finale, final assets, and balance selection; it is a playable milestone, not chapter completion.

## Incremental slices

- **Persistence and loadout:** T-23 through T-25.
- **Environmental tactics and opponent:** T-26 through T-30.
- **Complete episode:** T-31 through T-35.
- **Polish and evidence:** T-36 through T-42.
- **Independent final campaign review and handoff:** T-43 through T-44.

## Bijection proof

Every AC is covered by at least one task: AC-01 T-03/T-04; AC-02 T-02/T-08/T-10/T-12/T-27/T-41/T-42/T-43; AC-03 T-03/T-06/T-07/T-08; AC-04 T-11/T-12; AC-05 T-13/T-14; AC-06 T-09/T-10/T-13/T-14; AC-07 T-05/T-07/T-17/T-23/T-38; AC-08 T-15/T-16/T-22; AC-09 T-20/T-21/T-22/T-38/T-40; AC-10 T-21/T-23/T-35; AC-11 T-24/T-25/T-40; AC-12 T-26/T-27; AC-13 T-28/T-29/T-31/T-33/T-38; AC-14 T-30; AC-15 T-04/T-31/T-32/T-33/T-34/T-38/T-40; AC-16 T-18/T-19/T-27/T-29/T-35/T-40; AC-17 T-17/T-18/T-19/T-35/T-36/T-37/T-40; AC-18 T-36/T-37/T-40/T-44; AC-19 T-38; AC-20 T-30/T-36/T-39/T-42/T-44; AC-21 T-02/T-41/T-42/T-43; AC-22 T-34/T-40/T-42/T-43; AC-23 T-01/T-16/T-42/T-44; AC-24 T-01/T-43/T-44.

Every task advances at least one listed AC. No task is administrative-only or outside the accepted chapter outcome.

## Hard stops retained during autonomy

- Any campaign path reaches account, verified reward, network command, backend mutation, auth, secret, migration, or production authority.
- Default replay, retained artifact, compatibility tuple, migration hash, or source guard fails and cannot be corrected without changing the protected contract.
- Exact local resume cannot be reproduced from the bound checkpoint plus accepted command journal.
- A required content response is not legally reachable with guaranteed equipment/fuel.
- Any release, deploy, repository-setting mutation, branch/worktree deletion, override, or other irreversible operation is proposed. Merge alone has standing user authority after complete implementation and green hosted CI.
