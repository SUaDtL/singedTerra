# Last Stand architecture and release foundation

The owner approved this sprint on October 25, 2026. The goal is an extensible,
releasable game. Subsystems, layouts and interaction flows may be redesigned or
replaced when that produces coherent ownership and a more consistent experience.
Existing class shapes and visual differences are not compatibility requirements.
Earned progress, retained-run economy rules, checkpoint recovery and player
capabilities are requirements.

The maintained specification and execution plan are
[`ST-LS-ARCH-SPEC`](../../.codearbiter/specs/last-stand-architecture-foundations.html)
and [`ST-LS-ARCH-PLAN`](../../.codearbiter/plans/last-stand-architecture-foundations.html).
This document describes ownership and extension decisions; it is not a second task
ledger or a claim that all target boundaries are already implemented.

## Baseline and product scope

The source baseline is commit `07dc13c0ea0b31af973b24402ea9bdedfb8cc815`, the
research/farming candidate in PR 544, stacked on the waves/resume candidate in
PR 543. Both were open drafts when execution began. The foundation branch is
`codex/last-stand-release-foundation`; it reuses the research checkout rather than
creating another large Unity worktree.

Last Stand is the Unity campaign. The older TypeScript artillery modes remain a
separate product path; Unity domain ownership does not imply moving those modes
or merging their engines. The existing product roadmap calls for browser proof
followed by Android using the same Unity project and assets.

## Responsibility and dependency map

October 30 extension: `LastStandProgressionPlanner` projects catalog and current
Shop/Lab values without retaining a transaction owner. Its selected target is an
optional, bounded field in the existing local preferences record; older settings
load without writes, and unsupported data remains protected. `LastStandPlannerHud`
uses the common modal, pane, keyboard and chrome owners and returns purchases to
the existing Shop/Lab flow. History selection refreshes presentation only; the
research coordinator retains clock and reconciliation ownership.

`LastStandHistoryComparison` groups exact fitting/economy/opaque start/end contexts
and GCD-normalized speed proportions. It does not parse labels into invented stat
vectors or mutate recorded runs. Current diagnostic contract v2 adds planner and
history selectors; retained v1 and its fixtures remain unchanged, with strict
version-specific readers.

The target dependency direction is presentation → application → domain. Platform
adapters implement ports used by application composition. Domain code does not
depend on Unity, browser imports, concrete storage, wall-clock reads or UI controls.
Content definitions feed domain construction and presentation projections; they
do not become another wallet or state-mutation owner.

| Area | Existing baseline owners | Target responsibility and disposition |
| --- | --- | --- |
| Combat simulation | `EncounterModel`, `EncounterProfile`, wave catalogs | Retain deterministic fixed-step rules; reshape construction around validated authored content. No UI, storage or host-clock authority. |
| Upgrade/run accounting | `MechanicsShopModel`, `LastStandShopState`, economy/upgrade catalogs | One authoritative run ledger and price/effect calculation. Preserve retained economy editions; views consume projections and send purchase intents. |
| Profile transaction | `LastStandProgression` and its save/research partials | Retain one transaction across checkpoint, wallet, research and history. Classes may change; atomic commit, ownership checks, failed-readback recovery and exactly-once rewards may not. |
| Application flow | `LastStandLoopController`, `LastStandLoopResearch`, `EncounterSession` | Reshape into explicit run/recovery, purchase and research transitions. Unity controller composes adapters and forwards lifecycle/input rather than owning every transition. |
| Content | Tier, environment, wave, reward, fitting, upgrade and research catalogs | Central typed immutable definitions with stable keys, validated references and discoverable enumeration. Explicit legacy ordinal/slot adapters isolate historical save layouts. |
| Feature presentation | `LastStandLoopHud`, Settings, Research and History HUD classes | Compose owned garage/combat/shop/modal views from domain-derived presentation data. Views cannot independently award, persist or calculate economy rules. |
| Shared presentation | Chrome/keyboard/feedback classes inside `LastStandLoopHud`; modal/pane classes inside `LastStandResearchHud` | Hoist and unify actual shared widgets, chrome, layout, modal/scroll/focus mechanics. Keep variants only for different player needs. |
| Platform services | Browser bridge, audio/display owners, storage and preferences adapters, direct host-clock calls | Capability-aware browser/native services behind explicit ports. Implement real durable native storage and lifecycle behavior rather than interface-only placeholders. |
| Observations | HUD/controller diagnostics, editor checks, JS journey reader, Python verifier | One versioned wire-contract owner and read-only observations. Runtime registrations remain real controls; consumers validate rather than invent authority. |
| Delivery | Unity editor build entry, `build_web.py`, package/source verifiers | Target-aware source/toolchain/content-bound builds with isolated outputs and playable browser/Android development artifacts. |
| Test execution | Wave catalog and research test runners | Shared compilation/process plumbing with explicit source inputs, bounded execution and retained diagnostic output. Assertions and old-version fixtures remain independent. |

Directory or assembly changes should express these responsibilities. A file split
without moving ownership is not completion, and an assembly boundary that forces
large circular references is not useful. Use real consumers and compile-time
dependency checks to decide the smallest meaningful boundary.

### Implemented ownership

`LastStandLoopController` remains the Unity composition and player-intent adapter.
Its application owners are `Application/LastStandRunCoordinator` (run reservations,
wave/terminal/abandon commit recovery), `LastStandResearchCoordinator` (time samples,
completion publication and retry) and `LastStandPurchaseCoordinator` (permanent
purchase confirmation and temporary purchase admission across clock callbacks).
They use the same `LastStandProgression` transaction owner. Neither a new wallet
nor an alternative save writer was introduced. `ILastStandPurchaseSession` permits
testing admission against the actual rules without a Unity scene.

`LastStandLoopHud` composes `LastStandGarageView`, `LastStandCombatHud`,
`LastStandShopHud` and `LastStandModalHost`. Settings, Lab and History share
`LastStandUiPrimitives`, `LastStandModal` and `LastStandScrollPane`. Console chrome,
keyboard focus and action feedback have named owners. `LastStandObservations` and
`LastStandHudObservations` format read-only projections rather than drive gameplay.

`Content/LastStandContentManifest` validates the tier/environment/fitting graph
used by the real garage and modal selectors. Their numeric tier selection IDs are
an explicit adapter for retained player/diagnostic identity; authored semantic
keys remain distinct. Fitting refresh follows every catalog entry's unlock state.
`Content/LastStandResearchDefinitions` owns authored curves and explicit storage
slots. Publishing new research to real saved profiles still requires a deliberate
catalog/save migration and reward-policy integration; the non-awarding extension
fixture does not claim to provide that migration.

`Platform/LastStandPlatform` supplies host capabilities and clock samples.
Browser navigation and fullscreen use the existing bridge; unavailable native
destinations are absent from presentation and refused by the command adapter.
Android host suspension has a separate combat-clock hold: it preserves pre-pause
debt and player pause choices, excludes elapsed host suspension from combat and
lets real-time research reconcile independently on return. Actual phone lifecycle
qualification is a release check, not established by the pure clock test.

`Tools/last_stand_test_runtime.py` owns bounded compiler/process execution and
explicit source-byte admission. `last_stand_source_closure.py` owns declared pure
dependencies, including nested content/application files. Historical sources
supplied by a harness retain precedence. The frozen baseline oracle is never
regenerated as part of a verification run.

### Enforced boundaries

`Tools/last_stand_architecture/test_boundaries.py` compiles the production core,
content and application owners without Unity or substitute game classes. Its
negative control adds a real forbidden Unity import and requires compilation to
fail. A second guard scans discovered feature views and observations for direct
profile mutation or concrete storage access, with injected write examples. This
is a focused tripwire; behavioral transaction and failure/retry tests remain
necessary. The campaign CI lane runs these guards and content extension checks.

## Confirmed duplication and deliberate mirrors

| Baseline evidence | Disposition | Drift/acceptance check |
| --- | --- | --- |
| Settings constructs buttons, text, modal layout and scrolling independently of the Lab/History modal helpers. | Share common primitives and scrolling/focus ownership; standardize inconsistent appearance and interactions. | Existing panels plus a neutral test panel exercise the same foundation at desktop, portrait and short landscape. |
| Console mesh/frame/feedback and keyboard classes live in the main HUD file; modal/pane helpers live in Research HUD. | Move to named presentation owners and adopt them from feature views. | Compilation and player journeys prove actual consumers use them; no parallel legacy implementation kept solely for cosmetic parity. |
| Controller coordinates deploy, resume, checkpoint retry, purchases, research and feedback in one place. | Reshape application transitions; retain one durable profile transaction. | Failure/retry and coincident research/wave checks preserve rewards, holds and once-only effects. |
| Progression and preferences storage repeat WebGL read/write transport. | Share physical transport/adapters while retaining separate keys and authority. | Preferences cannot write gameplay state; save fault/restart tests cover actual native/browser behavior. |
| Control identities and diagnostic shapes appear in C#, JavaScript and Python consumers. | Share a versioned contract fixture and independent conformance checks. | Missing/duplicate controls and malformed payloads fail; gameplay goldens stay independent of runtime output. |
| Pure C# runners repeat compiler discovery, temporary output and process/error handling. | Consolidate execution plumbing with declared source closure and deadlines. | Compiler failure, timeout and source-selection failures remain visible. |
| Economy v1/v2/v3 formulas differ intentionally. | Retain versioned definitions/adapters, not a forced single current formula. | Saved editions retain their paid upgrades and future payout rules; only a new run adopts its selected current edition. |
| Old production save fixtures and independent expected game values repeat historical information. | Retain as compatibility/oracle evidence. | Pinned source provenance and observed semantics reject a real changed production calculation. |

## Content extension contract

Authoring begins with central typed immutable definitions and stable semantic keys.
Catalog enumeration supplies counts, selectors, labels and supported content; a
new row must not require updating unrelated screens or scattered numeric counts.
For existing mechanics, content variation belongs in definitions. A genuinely new
mechanic gets one explicit domain handler, referenced by its definition.

Persisted enum positions and fixed research/upgrade slots are historical encoding,
not the public content identity. Use explicit compatibility adapters when reading
those editions; extending or reordering current catalogs must not reinterpret an
old paid run. Validate duplicate keys, missing environments/fittings, invalid
unlock chains and unsupported identities before packaging.

Prove the path with one tier/environment and one research or armament extension
through ordinary selectors and runtime consumers in a non-awarding fixture. This
is an architecture demonstration, not authorization to silently retune production
progression or ship a new mechanic.

## Protected semantics

- A completed wave commits its checkpoint and rewards together. An unfinished
  wave may roll back, including its temporary spending, without losing prior
  earned progress or double-paying rewards.
- One profile/wallet transaction owns permanent purchases, research payments,
  research completion, run history and checkpoint accounting.
- Real-time research, fixed combat ticks and active-run time are different clock
  domains. A researched speed cap never automatically changes selected speed or
  resumes a player pause.
- Browser writer ownership and failed-write/readback recovery remain meaningful.
  Native storage must supply durable recovery rather than assume that Editor
  PlayerPrefs or an in-memory stub proves phone behavior.
- Prompt opt-outs, accessibility, usable controls and pause/focus safety remain
  capabilities even when their layout or shared implementation changes.

## Intentional evolution register

Record the final before/after result and affected checks as each slice lands.
These are approved design directions, not claims of implementation completion.

| Area | Baseline | Intended result | Validation |
| --- | --- | --- | --- |
| Shared UI | Similar surfaces own different widget/scroll construction. | Coherent chrome, spacing, controls, modal focus and scrolling; deliberate visual changes allowed. | Rendered before/after examples and real keyboard/pointer/scroll journeys. |
| Feature ownership | Central HUD/controller accumulate unrelated responsibilities. | Owned feature views and application transitions with explicit lifecycles. | Reopen/resize/redeploy cycles, no duplicate subscriptions or secondary wallet owner. |
| Content | Fixed counts and enum-index assumptions leak into consumers. | Catalog-derived content with stable identity and legacy adapters. | Real extension fixture and rejection of malformed references/ordering. |
| Native support | Saves/settings throw outside WebGL or Unity Editor. | Actual Android storage, capabilities and lifecycle behavior. | Interrupted write/restart recovery plus packaged native player checks. |
| Diagnostics | Readers repeat contract inventories. | Explicit versioned observation contract; identity changes recorded with consumer updates. | Positive and negative conformance, independent game-state expectations. |
| Delivery | Dedicated WebGL export workflow. | Target-aware browser/Android development artifacts with exact input identity. | Fresh build, stale-export rejection and packaged first/returning-session journeys. |

## Baseline evidence

`Tools/last_stand_architecture/fixtures/baseline.json` records the exact source
commit and SHA-256 values for 24 production C# files. The explicit capture tool
reads those files from Git at the pinned commit, not from the current working
tree. It records 51 capture observations and 48 compatibility observations:

- v1/v2/v3 bounties at waves 1, 10, 30, 200, 300, 2000 and 5000;
- temporary/permanent Cannon Attack prices and effects at representative levels;
- an actual bulk purchase and resumed Scrap ledger, research prices/durations;
- 5× fixed-clock scheduling over 600 callbacks, then pause/resume;
- real wave 1/10/30 model/checkpoint values, save reload, abandon and redeploy.

The stored v5 wave-30 profile is a **synthetic strong cohort**. It does not prove
that those permanent levels were earned, that the economy is balanced or that a
long real session passed. Tests compare semantic observations rather than freeze
serialization order. A compiled production mutation that increases current
bounties by one is rejected by the independent fixture comparison.

Run the focused baseline checks with:

```powershell
python -B -m unittest discover -s campaign-unity/Tools/last_stand_architecture -p test_foundation_baseline.py -v
```

Both checks passed when the baseline was established. The parent sprint also
recorded the unchanged research suite (62 tests, 135.030 seconds), wave-model
suite (10 tests, 8.278 seconds) and imported Unity menu checks (one Python wrapper,
19 internal cases, 26.702 seconds). The menu evidence is
`Evidence/last-stand-controls/20261025T083726Z-5f6d8eac`.

The 5× observation here measures deterministic scheduling outcomes, not rendered
frame time, memory/thermal behavior or endurance. Before/after rendered profiling,
browser/native interaction and real-time endurance remain separate checks.

## Release and environment boundaries

### Implemented presentation ownership

The composed `LastStandLoopHud` now delegates to `LastStandGarageView` for tier
selection and the tank preview callout, `LastStandCombatHud` for combat projection
and actions, and `LastStandShopHud` for category/purchase intent and its scroll
lifecycle. `LastStandModalHost` owns settings/research/history navigation and
focus. `LastStandUiPrimitives`, `LastStandModal` and `LastStandScrollPane` provide
neutral production controls; `LastStandConsoleChrome`, `LastStandActionFeedback`
and `LastStandHudKeyboard` separate styling, feedback and keyboard handling.
`LastStandHudObservations` exposes passive snapshots without owning gameplay.
This direction keeps wallet/research/run mutation in application/domain owners.

Target-aware export/preflight and the factual release inventory are documented
in [LAST-STAND-RELEASE-READINESS.md](LAST-STAND-RELEASE-READINESS.md). Source tests,
an actual player build and a tested player session are distinct evidence.

### Native persistence adapter

`Platform/LastStandFileStorage` is a pure C# implementation of the existing storage
and ownership ports. The composition root supplies an absolute persistent-data
directory and a separate safe record key for gameplay or preferences. The adapter
holds an exclusive per-key writer lease until disposal; other instances can read
the last committed record but cannot write. A waiting instance retries ownership
before `CanWrite` or `Read`, so the profile/settings owner's compare-and-write
check sees authoritative bytes while holding the lease. `Write` never acquires
a new lease after a read-only observation. Dispose it with its owning lifecycle.

Two binary slots contain the exact UTF-8 payload, record key, container version,
monotonic sequence and a noncryptographic CRC-32 checksum over the entire header,
identity and payload. A write flushes a new temporary file,
replaces only the inactive slot and confirms readback. An interrupted/corrupt
latest slot can therefore fall back to the preceding committed record. Two invalid
slots or ambiguous sequences fail closed, and an unsupported future container
does not silently downgrade. Keys cannot provide paths; collision-free hexadecimal
filenames encode at most 64 ASCII key characters, separate even case-only keys and
avoid reserved filenames. Linked directories/files are rejected.

Checksums detect corruption, not hostile modification; this is neither encrypted
storage nor account authority. File flush and redundant slots do not claim stronger
power-loss guarantees than the underlying filesystem provides. The current 4 MiB
payload bound comfortably exceeds the 2,879-byte baseline profile and keeps reads
bounded; review that bound explicitly if history/content persistence expands.

Eleven focused tests passed against actual Windows Mono file/process behavior,
including separate-process shutdown/reopen, interrupted/corrupt writes, invalid
records, key isolation, writer exclusion/release and a surviving waiting process.
A compiled no-reacquire negative control fails that same waiting-process journey.
Real profile/preferences integration preserves newer records after ownership
returns, including an owner update/exit between the settings read and write.
Actual Windows junctions exercise linked roots, linked ancestors and links at
lease/record-file positions. Reads and writes refuse them while preserving all
target entries and bytes. Isolated compiled root/file guard-removal mutations
are rejected by the same behavior assertions; removing the record guard wrongly
treats a junction at a slot position as missing progress. The fixture removes
only its own junctions before temporary-directory cleanup. It does not claim
coverage for hard links, file symbolic links or hostile concurrent link swapping.
These are native adapter tests, not proof of Android filesystem or phone lifecycle
behavior.

### Pure C# execution tooling

`Tools/last_stand_test_runtime.py` owns compilation, exact-input hashing, bounded
execution and diagnostic capture for the adopted wave-catalog and research suites.
Callers own source selection, fixtures and assertions. Tool discovery honors
`ST_CSHARP_MONO`, `ST_CSHARP_COMPILER` and optional `ST_CSHARP_COMPILER_MODE`
(`managed` or `direct`), otherwise uses the pinned Windows Unity tools or installed
Mono/mcs from PATH on Linux. Missing tools fail explicitly; there is no skip or
download. mcs receives `-langversion:latest`, and exact compile argv is returned
with input byte hashes. Legacy v4 regeneration
supplies only its pinned historical files; current closure expansion occurs at
the current-code call sites and never inside the generic compiler helper.

The runner rejects missing inputs, compiler failure, source changes during
compilation and missing/stale output, while preserving real process return codes.
`Tools/last_stand_architecture/run_pure_checks.py` discovers the pure architecture
suite for local use and the campaign CI lane. Imported Unity scene/UI/observation
checks have explicit separate host entry points; CI discovery does not silently
launch Unity or skip missing compilers. All 33 selected tests passed locally with
both Roslyn and Mono/mcs; Linux execution remains a hosted CI obligation.
Its four fault/control tests passed. The adopted research engine/profile and
wave-catalog suites passed 26 checks; a separate explicit legacy v4 regeneration
run passed all 11 profile checks and retained the recorded source/output hashes.

The pinned Unity editor is
`C:/Users/brenn/singedTerra-engine-lab/tools/unity-6000.3.24f1/Editor/Unity.exe`.
At sprint start its installed player modules were WebGL and Windows standalone;
the Android module was absent. The parent preflight reported about 79 GB free on
the system drive. Android build and device proof therefore need explicit actual
toolchain/target evidence; unrelated source implementation can proceed.

This sprint targets a playable extensible foundation and development candidates.
Public/store release still requires evidence for device performance, native
suspend/restart behavior, long-run reliability, content/economy depth, first-session
clarity, art/audio quality and rights, accessibility and support diagnostics.
Account/cloud-save/purchase systems are not invented as placeholders. Earlier
funded-research, native/background/audio and endurance obligations remain visible;
local baseline success does not clear them, hosted CI, merge or deployment.
