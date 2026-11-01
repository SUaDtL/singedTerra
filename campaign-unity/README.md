# singedTerra Last Stand

Last Stand is the Unity survival campaign. Clear finite enemy waves, bank Salvage
and milestone unlocks, invest in permanent upgrades and real-time research, and
resume from the last confirmed wave checkpoint. The classic TypeScript artillery
modes remain a separate game path. Unity saves are local to the browser or native
player; they do not sync with Supabase accounts or award verified account rewards.

## Current candidate — October 29, 2026

The combat-depth candidate includes four authored tiers, distinct battlefield
environments, enemy roles and elites, and five fittings: Field Repair, Launcher,
Scattergun, Mortar and Railgun. Tier advancement unlocks another battlefield without
ending a farming run. The Mechanics Shop spends run-local Scrap; the permanent
Workshop and Research Lab share Salvage. Research continues while closed; combat
does not. Resume restores the saved wave boundary and starts paused.

The maintained [combat specification](../.codearbiter/specs/last-stand-combat-depth.html)
and [plan](../.codearbiter/plans/last-stand-combat-depth.html) own implementation
status. [PR #547](https://github.com/SUaDtL/singedTerra/pull/547) is stacked on the
release foundation, research/farming and waves/resume PRs. Its baseline `af17d905`
passed all 24 hosted CI jobs and CodeQL; that result does not certify later edits,
merge, deployment, phone behavior, sound quality or sustained device performance.

The checked-in Web payload is identified by
[`asset-manifest.json`](../client/public/last-stand/asset-manifest.json), currently
`Web-20261029T014444Z-a8e42f`, and its
[sanitized build receipt](docs/last-stand-web/receipt-sanitized.json).
Source inventories bind the exported runtime, tools and assets. The receipt's
source-head label is historical; matching source bytes and the current verification
result determine applicability. Frozen calibration reports and retained run
editions are compatibility evidence, not generated files to refresh during tests.

Web, Windows and Android development build paths now exist. Physical Android
lifecycle, input, audio, performance and endurance qualification remain release
work. An APK or a passing pure C# check does not establish those outcomes.

## Owners and extension points

See the [architecture and release foundation](docs/LAST-STAND-ARCHITECTURE.md) for
the ownership map and [roadmap](docs/LAST-STAND-ROADMAP.md) for product direction.

| Responsibility | Owner |
| --- | --- |
| Fixed-step combat and wave state | `Unity/Assets/Scripts/EncounterModel.cs` and versioned catalogs |
| Durable checkpoint, wallet, research and history transaction | `LastStandProgression` and its save/research partials |
| Deploy/resume, purchases and research orchestration | `Unity/Assets/Scripts/Application/` coordinators |
| Tier, fitting, enemy and research definitions | `Content/`, `LastStandTierCatalog` and `LastStandSelection` |
| Garage, combat, shop, modal and settings presentation | `LastStandLoopHud` feature views and shared UI primitives |
| Browser/native capabilities, clocks and storage | `Unity/Assets/Scripts/Platform/` and browser bridges |
| Pure harness compilation and source closure | `Tools/last_stand_test_runtime.py` and `last_stand_source_closure.py` |
| Browser launcher | `client/src/ui/commandCenter/LastStandCommandView.ts`; Unity owns validation and resume |

Presentation reads projections and sends intents; it does not calculate another
wallet or write profile state. Catalog changes must preserve saved edition identities
and paid upgrades. A new run may select current rules; an ongoing retained run keeps
its recorded rules. Independent fixtures and historical source closures stay intact.

## Open, build and verify

The saved playable scene is `Unity/Assets/Scenes/LastStandPrototype.unity` in Unity
6000.3.24f1 (`4e7b9b5b6244`), with embedded URP 17.3.0. Unity modules, Android tools,
embedded vendor files, Library caches and generated players are outside Git. They
must already exist before export; the build commands neither install nor restore
dependencies. Toolchain availability is checked before a player build.

From `campaign-unity/`, inspect the supported options and perform a target-specific
availability check using an existing matching editor:

```powershell
python Tools/build_last_stand.py --help
python Tools/build_last_stand.py --target android --configuration development --editor "C:\path\to\6000.3.24f1\Editor\Unity.exe" --preflight-only
```

The target-aware builder supports `webgl`, `windows` and `android`, and records
explicit JDK/SDK/NDK overrides for Android when needed. Web export also requires the
current spec/plan identity metadata described by its `--approval-binding` option;
that metadata is provenance, not a new approval ceremony. Builds use saved scenes,
fresh output directories and before/after source and tool inventories. Close this
Unity project before building; preserve other editor projects and unsaved artwork.

From the repository root, `npm run build` verifies the receipt-bound Last Stand Web
payload before Vite packages it. It does not compile Unity. Pure domain checks,
imported-scene checks, rendered browser journeys, native builds and device acceptance
are separate layers. Use the current CI commands and the plan's named checks for the
changed surface; historical test commands below apply only to their named artifacts.

Reuse the single requested preview. Automated browser tools own and close their
temporary processes; do not leave additional preview ports running or stop an
unrelated listener. Preserve the user's saved game during checks.

## Assets and historical checkpoints

`ArtSource/` holds editable source art; `Unity/Assets/Art`, `Prefabs` and `Scenes`
hold runtime exports and authored scenes. `Tools/build_art.py` and other original
generators remain provenance. Do not run a generator over hand-edited assets; a
regeneration experiment belongs in an isolated scratch directory.

The FieldAssembly, BattlefieldReview and PartsGallery scenes are retained authoring
and inspection tools. Their old receipts are not acceptance for today's campaign.
The dated sections below preserve earlier scope, failures and acceptance records;
statements about missing features or deferred tooling describe those dates.

## Inspection controls - initial September 25 follow-on checkpoint

Inspection now opens from the cannon-facing three-quarter side. The upper control
row offers Orbit Left, Orbit Right, Front View (reset to that initial framing),
and Hide/Show Part Labels. Orbit moves the camera, not the tank or turret aim.
Three non-interactive labels identify the main cannon, hull and current fitting.
They are appearance inspection aids, not selected equipment slots or item stats.
The upper row and labels hide in Battlefield View; the ordinary bottom controls
remain. No additional assets, package versions, combat or Android setup are added.

This is a draft implementation checkpoint, not completed inspection acceptance.
The Web export and unchanged 15-check browser regression passed. New orbit/reset,
label toggle, full-circle and independent endpoint tests remain outstanding after
a tool blocked the new verifier's completion. Do not run an untracked partial
Tools/verify_inspection.py from the workstation. Use the complete existing
Tools/verify_web.py for its original coverage only. See VALIDATION.md and
[the dated receipt](docs/inspection-20260925/receipt.json) for exact limits.

## Current inspection acceptance - September 25, 07:33 UTC

The tracked verifier is complete; the preceding partial-file warning describes
the 06:49 checkpoint and no longer applies to this version. Python Playwright,
Pillow and installed Chrome are prerequisites; these scripts do not install them.
From campaign-unity, with no manual preview server required:

```powershell
python -m unittest discover -s Tools -p test_inspection_checks.py -v
python Tools/verify_inspection.py "C:\Users\brenn\st-art-pr\campaign-unity\Builds\Web-20260925T064755Z-6d9dd3"
```

The inspection test checks the exact artifact hashes in the original dated b10
receipt. A different export is refused, not silently granted the same evidence.
Keep the automated browser untouched while it uses real pointer input. Readiness
waits for the actual scene, not merely download completion. The owned browser and
loopback server close on success or failure. Results and failure captures are
retained in a fresh Evidence directory. The original recoil verifier is unchanged.

The manual http.server command above is OPTIONAL, not a build/test continuation.
Do not automatically leave a preview running, or accumulate old previews on new
ports. Start a requested manual preview in one foreground terminal and stop it
with Ctrl+C when finished. Never stop unrelated listeners or the authoring editor.

[Acceptance receipt](docs/inspection-acceptance-20260925/receipt.json) records the
247-assertion desktop suite, two failed starts, the stale-build refusal and server
shutdown. [VALIDATION.md](VALIDATION.md) separates successful checks from remaining
shader diagnostics, first-pass art, layout, accessibility and device limitations.

## First automatic encounter - ST-ENC-01

Choose the visible repair/launcher sample in inspection, then use Deploy Test
Encounter. The existing tank holds position while diagnostic opponents approach
from surrounding lanes. Main cannon fire is automatic. The launcher supplies an
independent attack; the repair fitting instead restores hull. Neither is a Skill.
Fittings and manual art previews are locked until Return to Inspection. Pause and
tracer reduction are the only live test controls besides returning. Defeat grants
nothing; returning/reloading retains no test-run progress and touches no old save.
These brief fixture rules are not campaign balance, an enemy cap, a numeric-library
selection, a starting loadout allowance or the complete run/progression system.

EncounterModel owns integer fixture rules; EncounterSession advances its clock.
TankPresentation still owns tank pose/recoil/camera; EncounterView owns bounded
opponent meshes/tracers; EncounterHud uses ArtHud's existing Canvas/EventSystem.
The saved tank/clearing assets and scene are not regenerated or overwritten.

The existing build command now runs EncounterChecks.Run before Web export.
The following are actual verification entry points, not a completed-pass claim:
```powershell
python Tools/verify_encounter.py "C:\absolute\project\Evidence\build-...\result.json"
python Tools/verify_inspection.py "C:\absolute\project\Builds\Web-..." --receipt "C:\absolute\project\Evidence\build-...\result.json"
```
Inspection defaults still bind to their historical artifact unless an explicit
new receipt is supplied. Old receipts and thresholds are never rewritten.
The encounter suite currently requires diagnosis after its focus-event timeout;
do not rerun until green or treat C# results as browser terminal/lifecycle proof.
No manual preview server starts automatically. Test servers close on exit.

## Current recovered encounter checkpoint - September 25, 10:31 UTC

ST-ENC-01 is implemented beside inspection: choose a fitting, deploy automatic
cannon defense against close and ranged diagnostic opponents, and use the repair
unit or an independently firing launcher. These are temporary test rules, not
selected campaign balance, equipment capacity or enemy artwork. Nothing is earned
or saved. Android and classic-game integration remain excluded.

The final Web export is Web-20260925T102215Z-797845. An imported-hierarchy test
caught and fixed an upside-down turret when firing directly behind the tank.
Fourteen C# model contracts and all eight pose headings pass. A browser repair
run reached defeat with the matching model result and passed actual foreground
focus-pause/resume checks, but the full encounter browser suite remains FAILED
at post-defeat input. New launcher/return/repeat/parity coverage is incomplete.
The final-build art and inspection suites also failed with unexpected extra
commands; their origin remains unresolved. Earlier green tests are not reassigned
to this newer artifact. Read VALIDATION.md and docs/encounter-recovery-20260925/.

All previews should remain off unless explicitly requested. Existing test commands
own and close their temporary servers. A manual preview uses one foreground shell
and must be stopped with Ctrl+C; do not leave another port running after each build.
The original stterra files remain protected. Its previously open editor is now
closed, but this observation does not recover or explain its former unsaved work.
Keep #524 draft and unmerged while completing the outstanding acceptance.

## Current desktop encounter acceptance - September 25, 11:30 UTC

The preceding incomplete-acceptance paragraphs retain their earlier dates.
The unchanged Web-20260925T102215Z-797845 now passes the complete 56-check encounter
suite, original 15-check art regression and 247-assertion inspection suite.
Actual repair and launcher runs reached defeat; full/reduced launcher outcomes
matched. Return/redeployment, post-defeat controls, real background/minimization,
no catch-up and explicit resume passed. Runtime, artwork and build bytes did not
change in this diagnostic continuation. See the new dated acceptance receipt.

The same verification commands above remain valid. Encounter verification now
needs installed Chrome and Python Playwright 1.60+ for no_defaults support.
Tools/native_chrome.py opens its OWN fresh profile under the ignored Evidence
folder, binds a temporary DevTools endpoint to loopback, and uses the existing
default context without Playwright's focus/media overrides. It never connects to
B's personal browser. It closes its own Chrome process and the test server afterward.
The ordinary art/inspection scripts retain their existing launch setup. All three
scripts record passive test-page pointer/focus evidence, not credentials or typed text.

```powershell
python -m unittest discover -s Tools -p test_native_chrome.py -v
```

Four browser-cleanup host methods and eight existing geometry host methods pass.
Warnings, visual refinement, old unexplained input sources and full device/performance
acceptance remain open. No Android or persistent preview starts automatically.
[Current receipt and captures](docs/encounter-acceptance-20260925/receipt.json).

## Field Kit 01 - ST-KIT-01, September 25

Start at [the illustrated parts index](PARTS-LIBRARY.md). The new art library
contains twenty mesh entries: six extracted from the retained starter tank and
fourteen new gun, module, armor, cosmetic and field-base designs. Each has a
stable art ID, separate FBX and Unity prefab. Three paint finishes and three
assembled examples demonstrate reuse, not selected game classes or unlocks.

Editable source: `ArtSource/PartsLibrary_01.blend`.
Unity prefabs: `Unity/Assets/PartsLibrary/Prefabs/`.
Static authoring layout: `Unity/Assets/PartsLibrary/PartsLibrary_Layout.unity`.
Interactive gallery scene: `Unity/Assets/PartsLibrary/PartsGallery.unity`.
Machine-readable inventory: `Unity/Assets/Art/PartsLibrary/catalog.json`.

The index includes Blender renders of the actual meshes, mounting conventions,
source provenance and actual Unity geometry measurements. These are not concept
images or Unity/browser screenshots. New field-base props are scenery only;
they do not implement construction, R&D, resources or collision/cover rules.

Blender generation and Unity compilation/import completed. The separate
gallery now supports 23 item selections, list paging, assembly cycling,
three paints and pointer camera orbit. Its source-bound Web export and
ordinary pointer check are recorded in
[gallery completion evidence](docs/parts-library-01/GALLERY-COMPLETION.md).
The FieldAssembly and BattlefieldReview scenes and original art were preserved.
The small terminal presentation repair ages existing visual effects after
defeat without advancing encounter rules.

Nominal Blender and imported Unity triangle counts differ for nine entries;
both counts and an independent FBX reimport probe are retained. No topology
identity, final art, LOD, sustained performance or mobile acceptance is claimed.
Read [the library receipt](docs/parts-library-01/receipt.json) and VALIDATION.md.
