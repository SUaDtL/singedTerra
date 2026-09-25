# singedTerra Unity Web starter art (ST-ART-01)

> Current continuation: ST-ENC-01 adds one non-awarding automatic encounter beside
> the preserved ST-ART-01 inspection. Its source/build and C# fixture checks are
> complete; browser encounter acceptance is PARTIAL. The new encounter test stops
> at focus-event verification. Earlier art-only descriptions below retain their
> initial scope; they do not describe the complete current feature set. See
> `.codearbiter/specs/unity-first-encounter.md` at the repository root and VALIDATION.md.


**Latest checkpoint:** the inspection-specific pointer/geometry suite is now
complete and passing for the pinned b10 Web artifact. The initial incomplete-test
notice near the end is historical; see the current acceptance instructions below.
All three old preview servers were explicitly stopped. No preview is left running.

Draft, production-intent asset checkpoint. This project is deliberately separate
from the existing TypeScript artillery application. It is not wired into its
launcher, npm workspaces, account services, rewards, or Pages deployment.

The owner selected Unity for the browser PoC and continued mobile development
using the same project/assets. Android builds and phone/emulator setup are deferred
until after the full browser PoC. The current slice contains no combat or economy.

## Contents and ownership

`ArtSource/StarterTank_and_Clearing.blend` is the editable model with packed textures.
`Unity/Assets/Art` holds runtime FBX exports, textures and the art inventory.
`Unity/Assets/Prefabs` holds the reusable tank and clearing. The tank retains its
articulated turret/barrel and two optional fitting examples; these are not a
selected equipment catalogue or approved starting slot count.
`Unity/Assets/Scenes/FieldAssembly.unity` is the saved authoring scene.
`TankPresentation` owns presentation state; `ArtHud` only dispatches inspection
controls. Recoil previews are not manual campaign aiming/firing or gameplay rules.

## Open and build

Use Unity 6000.3.24f1 with matching Web Build Support and URP 17.3.0 for this
checkpoint. These are reproducibility pins, not a permanent version policy.
Python 3.11+ runs the tools. The browser test additionally needs Python Playwright
and installed Chrome. No tool installs software or manages a Unity licence.

From this directory, with the Unity project closed (other projects may stay open):
```powershell
python Tools/build_web.py --editor "C:\path\to\6000.3.24f1\Editor\Unity.exe"
python Tools/verify_web.py "C:\absolute\path\to\the\reported\Builds\Web-..."
python -m http.server 8788 --bind 127.0.0.1 --directory "C:\absolute\path\to\that\Web-..."
```

Open `http://127.0.0.1:8788/` on that workstation. An occupied port is not permission
to stop another application; select a free port. Stop your own server with Ctrl+C.
Keep the automated Chrome window foreground and do not interact during the test.
The verifier uses real pointer presses held for 150 ms; it does not invoke game
methods through JavaScript. It tests both fittings/views, resize, idle pause/resume,
and five recoil cycles. Screenshots and structured results are written to Evidence.

The builder exports the SAVED scene, checks that its bytes are unchanged, and writes
a fresh output directory. It never calls scene regeneration. The old Prepare menu
now refuses to overwrite an existing scene. Save editor work deliberately before
building. Never copy a regenerated build scene back over independent authoring work.

## Dependency restoration

The same-version URP embedding workaround is retained without shipping the vendor
payload. On a fresh checkout the builder copies URP 17.3.0 from the pinned installed
editor to the ignored Unity/Packages directory, checks all copied hashes, and lets
Unity create import metadata. It does not patch the installed editor/cache. The
lockfile and restoration receipt identify the dependencies; no engine binaries,
fonts, Library caches, licence files or compiled Web binaries belong in Git.
Unity's embedding reference: https://docs.unity3d.com/6000.3/Documentation/Manual/upm-embed.html
Pointer API reference: https://playwright.dev/python/docs/api/class-mouse

## Authoring continuity and limits

This snapshot preserves the saved stterra assets, scene and settings rather than
replacing them with stweb01's generated scene. The corrected TankPresentation.cs
comes from the reviewed stweb01 build. Original roots, their failed receipts and
all unsaved editor work remain untouched. This is not a complete backup of the
still-unsaved editor scene; reconcile that work before merging or switching roots.

`Tools/build_art.py` is the original Blender generator, retained for provenance.
Do not run it over hand-edited assets: it generates into its sibling ArtSource and
Unity/Assets/Art paths. Run a copied recipe in a fresh scratch directory for a
regeneration study. Do not replace saved artistic work with a generated result.

The first art pass still uses coarse perimeter props, visible terrain edges and
regular track impressions. The initial inspection framing is rear three-quarter.
These are visible refinement opportunities, not claims of final visual approval.
There is no full campaign, mobile benchmark, battery/thermal pass or release here.
The repository's existing CI protects the classic application and does not itself
compile this Unity project. See VALIDATION.md for this slice's actual evidence.

## Failure and rollback

Missing editor, unsupported pin, absent Web module or source drift stops the
workflow; fix the specific prerequisite without disabling protections. Every build
gets a fresh evidence/output directory. No failed result is relabeled or deleted.
The saved scene and old exports remain recoverable. There is no live data migration
or production rollback: retain the branch unmerged and reconcile specific files.
No command enables auto-merge, Pages, an external listener or a public tunnel.

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
