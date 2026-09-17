# Ash Road Chapter One sprint specification

**Status:** Approved and implemented under the combined `$ca-sprint` gate
**Source direction:** `singedterra-ash-road-sprint.zip`, interpreted as guidance rather than executable authority
**Implementation checkout:** `C:\Users\brenn\projects\singedTerra` on `codex/ash-road-chapter-one-current`, based on `origin/main` at `ea574def3e8810c3eb9cf5c9ebe6905dd5ab9f23`
**Governs:** `shared/src/campaign/**`, `shared/src/engine/**`, `shared/src/types/GameState.ts`, `client/src/campaign/**`, `client/src/client/**`, `client/src/input/**`, `client/src/renderer/**`, `client/src/ui/HUD.ts`, `client/src/ui/battleConsole/**`, `client/src/audio/**`, `client/public/art/campaign/**`, `scripts/checks/campaign_*`, `e2e/campaign-*.spec.ts`, `supabase/backend-release-manifest.json`

## Problem

singedTerra has strong deterministic artillery mechanics but no authored, persistent single-player journey in which environmental preservation, route choice, carried equipment, and telegraphed threats matter across battles. The player needs a short opt-in chapter that uses the real engine and current battle-console architecture without changing ordinary hot-seat, network, verified, or account-progression behavior.

## Approach

Add an opt-in campaign experience around the existing deterministic engine. A versioned encounter definition initializes authored terrain, seats, equipment, battlefield objects, objectives, and a resolved combat profile through one owned engine path. The engine remains authoritative for physical outcomes and mission verdicts; a client-side campaign run reducer owns route, supplies, checkpoints, and device-local persistence. A dedicated `CampaignClient` owns CPU scheduling and accepted-command journaling while implementing `GameClient` and participating in the existing session lifecycle.

Presentation extends the current architecture rather than the packet's older HUD assumptions: Canvas 2D renders world-space objects, zones, and warnings; the accepted ADR-0018 Preact semantic tree receives callback-free campaign presentation state and emits typed intents; Pixi remains optional, non-interactive decoration. The first demonstrable slice is Fuel Stop. The sprint then continues through both middle routes, Relay Ridge, local saves, curated loadouts, authored presentation, and reproducible acceptance evidence.

This shape is preferred over a parallel engine or scripted DOM victory layer because it preserves deterministic replay, one authority per state, current lifecycle ownership, and compatibility with ordinary modes. It costs deeper engine integration and a versioned local journal, but those costs are necessary to make campaign outcomes real rather than cosmetic.

## Scope

### In scope

- Four authored encounter definitions: Fuel Stop, High Road, Salvage Pit, and Relay Ridge; each run plays Fuel Stop, one middle encounter, then Relay Ridge.
- A complete Fuel Stop milestone with visible collidable drums, a protected refinery, real enemy turns, preserve-versus-detonate consequences, and exact retry.
- Opt-in encounter initialization, immutable combat profiles, non-turn-taking battlefield objects, deterministic causal effects, objective precedence, and componentized settled outcomes.
- Six campaign choices: Baby Missile, Missile, Cluster Bomb, Sandhog, Napalm, and Shield; two offensive slots, one defensive slot, and a separate local supplies economy.
- A campaign-only persistent Napalm-zone prototype with an evidence-based ability to remain disabled if it fails its tactical-value tests.
- Fixed announced strikes, destructible relays, and legal guaranteed-equipment counterplay.
- A bounded deterministic campaign opponent that evaluates real engine clones and campaign objectives.
- Versioned IndexedDB saves containing bound content/checkpoints and accepted human/CPU commands, never serialized live `GameState`.
- Current battle-console integration, small world-space art/audio family, accessibility, responsive browser evidence, source provenance, and readable fail-soft placeholders.
- Default-mode compatibility, retained verified artifact integrity, honest shared-source digest maintenance, and an independent final campaign review.
- Applying and verifying the work in the current checkout. The separate worktree created during preflight is not the delivery surface.

### Out of scope

- Multiplayer campaign, procedural generation, campaign editor, navigation AI, cloud saves, account rewards, verified rewards, rank/XP integration, new currency service, server-authoritative live play, new backend functions or migrations, production deployment, release, or repository-settings changes. Merge is separately authorized only after complete implementation and green hosted CI.
- A global UI redesign or replacement of the current Preact/Pixi/Canvas ownership boundaries.
- New weapon families, bridge/cave structural simulation, permadeath, monetization, paid services, or fabricated human/device evidence.

## Decided parameters

- The current checkout is caught up to `origin/main` and is the required final implementation and verification surface. The superseded local branch and the task-created preservation stash were removed at the user's explicit direction; no remote ref was changed.
- The package baseline `0019bc4` is evidence only. Current source at `ea574de` and accepted ADRs govern implementation details.
- ASTRA is prohibited for planning, implementation, intermediate review, and handoff. It may be used exactly once: the final independent campaign review corresponding to AR19. AR20 handoff uses Sol or Terra.
- Non-final delegated work uses Sol for engine/client/persistence risk, Terra for presentation/content/art integration, and Luna only for bounded read-only inventories or fixture comparisons. No delegation is invented when unnecessary.
- Campaign configuration is explicit and mutually exclusive with network, verified deployment, verified challenge, and public seed challenge inputs.
- Ordinary `GameEngine(options, budget)` behavior remains byte-compatible. Campaign initialization uses an optional named definition/factory and never mutates `getState()` externally.
- World limits begin at eight objects, four live zones, chain depth eight, queued effects 32, and accepted commands 256 per encounter. Exhaustion fails visibly without reward.
- Candidate drum effect: 60 maximum damage, 76-pixel damage reach, 32-pixel crater radius, linear falloff. Candidate announced strike: 35/55/24. These values remain tunable until retained playthrough evidence selects them.
- Candidate Shield values are 60, 90, and 120, beginning at 90 for the prototype. Global weapon definitions remain unchanged.
- Campaign supplies start at two. Candidate rewards and checkpoint costs follow the packet until source-native balance evidence justifies a recorded adjustment.
- Campaign saves are device-local and player-editable. Checksums detect corruption only and confer no trust or account authority.
- No new runtime dependency is planned. The packet-only `jsonschema` validator dependency will not be installed unless separately routed through `$ca-add-dep`.
- Owner playtest, physical-phone, and subjective sound/art acceptance remain explicitly pending when unavailable; machine evidence never substitutes for them.

## Acceptance criteria

1. **AC-01 — Bound content graph.** Strict content validation accepts exactly four versioned encounters forming exactly two legal three-encounter routes and rejects unknown versions, duplicate IDs, invalid references, invalid object counts, invalid spawns, or mixed campaign/network/verified launch data.
2. **AC-02 — Default compatibility.** Representative ordinary transcripts, snapshots, clone futures, shield turns, teams, hazards, best-of-three carry, verified tuples, and retained cq1 bytes remain unchanged; campaign-only optional keys are absent from ordinary states.
3. **AC-03 — Owned initialization and clone isolation.** Authored terrain, seats, hull, equipment, objects, objective, seed, and combat profile initialize through the owned engine path; caller mutation after construction and clone mutation cannot affect another engine.
4. **AC-04 — Physical objects.** Live objects participate in the earliest swept projectile contact and legal movement blocking without becoming tank seats, turn owners, inventory owners, or reward recipients; ordinary collision is unchanged when no object set exists.
5. **AC-05 — Deterministic effects and support.** Volatile activation is exactly-once, simultaneous effects use stable FIFO/ID order, support loss follows the three-sample rule, and configured depth/queue limits refuse rather than truncate or fabricate a result.
6. **AC-06 — Settled commitment authority.** Only accepted fire or shield actions consume a campaign commitment; all due projectile, object, terrain, zone, and warning effects settle before one immutable verdict, with protected-object/player failure preceding success and limit resolution.
7. **AC-07 — Profile agreement.** Engine mechanics, input cycling, battle-console presentation, save identity, and campaign AI agree on the six-choice profile, finite ammunition, explicit damage reach, and selected Shield value while the global catalog and ordinary economy remain unchanged.
8. **AC-08 — Isolated campaign client.** A campaign entry creates exactly one `CampaignClient`, one CPU scheduler, one animation/session owner, and no account-progression, claim, verified-completion, gameplay-network, or backend write path for guests or authenticated users.
9. **AC-09 — Real Fuel Stop milestone.** From the public campaign entry, retained legal playthroughs prove both a precision path preserving at least one drum and a deliberate-detonation path, each with actual collision, actual enemy turns, a living refinery on success, a clear result, and same-checkpoint retry without duplicate supplies.
10. **AC-10 — Run reducer and checkpoint economy.** Route choice, supplies, carried hull/ammunition, repair/refill/retain choices, emergency hull floor, mission application, and retry are pure, versioned, and idempotent; zero-supplies runs remain completable with guaranteed equipment.
11. **AC-11 — Durable local saves.** IndexedDB revision-checked transactions persist bound definitions, checkpoints, accepted human/CPU commands, and the result ledger; strict version/content parsing plus bounded deterministic replay reconstructs the safe boundary. Mid-shot reload, repeated completion, storage failure, stale tabs, unknown versions, obsolete fields, and page-cache restore fail or resume without duplicate rewards or overwritten newer data.
12. **AC-12 — Campaign zones without classic drift.** The Napalm prototype uses separate bounded zones with the specified birth, expiry, overlap, shield, and once-per-acting-commitment exposure rules; classic Napalm, ordinary turns, retained replay, clone parity, and playback-speed parity remain unchanged.
13. **AC-13 — Fair announced pressure.** Warnings have stable identity, fixed visible/actual target reach, explicit due commitment, and cancellation; killing the relay/source cancels an unfired strike, and each warning checkpoint has a legal response using guaranteed equipment and fuel.
14. **AC-14 — Bounded objective-aware opponent.** Campaign CPU planning uses deterministic real-engine clones, objective-aware settled scoring, bounded coarse/refinement/work budgets, no wall-clock cutoff, no uncommitted human input, validated fallback, preserved multi-step plans, and no second action owner.
15. **AC-15 — Complete branching episode.** Both routes complete from the public entry without optional rewards or synthetic terminal state, at least one encounter ends by a non-elimination objective, and Relay Ridge provides relay/terrain/equipment counterplay while keeping the siege tank at the existing 100-hull contract.
16. **AC-16 — Current presentation architecture.** World objects, zones, warnings, objectives, results, supplies, and loadout facts render from canonical state through Canvas plus callback-free Preact presentation and typed intents; no stale campaign projection survives teardown or ordinary-mode re-entry.
17. **AC-17 — Accessible narrative and controls.** Story beats are source-driven, factual, skippable, bounded to safe decision points, and cannot leak focus or block combat; keyboard-only, touch, small-window, sound-off, reduced-motion, and asset-failure paths retain all tactical information.
18. **AC-18 — Asset and audio accountability.** The required object/relay/siege/panorama states and four audio distinctions are integrated or explicitly left as bounded owner deliverables; every shipped asset has provenance, rights basis, export parameters, and hash, and no animation/audio completion gates mechanics.
19. **AC-19 — Source-native balance evidence.** A deterministic multiweapon corpus records setup, seed, profile, inventory origin, aim budget, incomplete samples, componentized harm, cost, and objective result across held-out terrain/spawn/shield/object cases without calling one-shot fixtures win rates or human proof.
20. **AC-20 — Bounded performance.** Objects, zones, effects, journals, AI work, bundle additions, and replay work are explicitly bounded; named desktop measurements separate measured values from provisional targets, and unavailable physical-phone measurements remain pending.
21. **AC-21 — Honest shared-source provenance.** Shared changes update the honestly recomputed shared-tree digest; migration hashes, compatibility tuples, retained artifact bytes, and backend deployment state remain untouched. Existing source-guard membership and enforcement remain unchanged, while hashes for intentionally changed bound sources are recomputed with a reviewed ordinary-parity disposition.
22. **AC-22 — Full regression and browser proof.** Typecheck, deterministic checks, client tests, Edge tests, production build, applicable asset tests, and campaign Playwright journeys pass from the current checkout, with failures and skipped/unavailable environments reported exactly.
23. **AC-23 — Current-checkout delivery.** The final implementation, spec, plan, and evidence exist in `C:\Users\brenn\projects\singedTerra`; no superseded local work is reintroduced and no unrelated remote ref is mutated.
24. **AC-24 — Final review and handoff boundary.** One independent ASTRA review checks the completed campaign against this spec and all evidence; the subsequent non-ASTRA handoff distinguishes machine, owner, and physical-device evidence and reports `ready for owner playtest` rather than released when human acceptance is pending.

## Open questions

None. Prototype values are deliberately evidence-selected parameters, not unresolved product forks. Any implementation discovery that would cross auth/reward authority, accepted ADRs, backend schema, or irreversible operations is a hard gate and must return to the user.

## Adversarial review

The strongest case against this design is scope concentration: it simultaneously changes deterministic engine internals, session ownership, persistent storage, authored content, AI, and presentation. The likely failure mode is a seemingly campaign-only state field altering ordinary replay, clone, or verified behavior. The plan therefore front-loads default-parity fixtures, preserves an opt-in construction path, ships Fuel Stop as the MVP slice, and requires independent final fidelity review.

The criterion most likely to be wrong is AC-12: persistent Napalm may add waiting rather than tactical choice. Its implementation is bounded and tested, but the selected profile may keep it disabled without blocking the rest of the chapter if evidence shows no useful response choice.

The assumption most likely to invalidate the approach is that accepted-command replay plus bound content is sufficient for exact local resume. If private engine state cannot be reproduced at a settled checkpoint, the storage design must stop and surface that gap rather than serialize partial `GameState` or silently resume approximately.
