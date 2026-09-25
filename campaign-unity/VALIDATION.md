# ST-ART-01 validation checkpoint - 2026-09-25 UTC

## New execution

The existing recoil-fixed stweb01 Web output passed a completed browser-only
verification (`browser-verify-20260925T040235Z-70b9c6`): 15 checks, five recoil
cycles, actual pointer controls, both fitting variants and camera views, resizing,
idle pause/resume, no observed browser errors or failed requests. Captures inspected.

A review snapshot then preserved 85 saved original-authoring files, the portable
Blender model, and the known corrected TankPresentation.cs. Eight saved files differ
between original and older build-copy trees; the original versions were retained,
except for the specifically reviewed recoil correction. The saved scene and material
changes were not silently replaced with generated versions.

Fresh build: `Web-20260925T040559Z-9f1c4a`, Unity 6000.3.24f1 / URP 17.3.0.
The same-version URP payload was restored from the installed editor into the new
project; no Library cache was copied. The saved-scene export and Web-entry stages
passed. FieldAssembly's SHA-256 remained unchanged before and after export:
`5652aaba327cc7f26056a7ee033a98016a061e2de00e6176ea643441ca2adf65`.

Fresh browser run: `browser-verify-20260925T040809Z-71fe67`, headed Chrome.
All 15 checks passed, including five measured recoil cycles. Observed peak range:
0.31997087597846985 to 0.31999996304512024 world units. Every recorded return error
was zero. The 1600x900 and 1280x720 captures were inspected; these are actual Web
frames, not Blender concept renders. Exact browser version, checks, source hashes
and build-file hashes are in [docs/validation.json](docs/validation.json).

## Retained failure and evidence limits

The original owner-run `recoil-local-20260925T034134Z-5fcbd4` workflow remains FAILED
at `Missing browser event: motion`. Its seven recoil observations and successful
build do not become a retroactive full-suite pass. The new verifier explicitly
foregrounds/focuses its test page, derives coordinates from the actual canvas box,
and holds mouse-down for 150 ms. That new run succeeds; the precise cause of the
original timeout was not separately isolated. No game-input code was changed to
make this suite pass, and no test runtime invokes game methods through JavaScript.

This is a bounded presentation check, not performance, battery/thermal, mobile,
full browser compatibility, accessibility or complete lifecycle certification.
No combat oracle was run because no combat is added. Positive owner appearance
feedback does not certify every asset, layout or eventual equipment design.
Visible refinement remains: rear-facing inspection, coarse terrain edges/props,
and regular track impressions. Four representative browser captures are in docs/.

## Preservation and review boundary

The original stterra editor still showed an unsaved FieldAssembly scene. It was
not closed, saved, regenerated or overwritten; unsaved work is not in this snapshot.
Old spikes, stterra and stweb01 originals, failed receipts and prior exports remain.
No copy-back into that editor or another user's worktree was performed.

Base governance was read at `7edc11ec094fe088dfa4a407aa4dbbf40875dd48`.
Only campaign-unity and its new scoped spec are added. Classic source, npm manifests,
accepted ADRs, prior execution ledgers and CI/deployment workflows are unchanged.
Existing repository CI must be read on the published PR head; it is not Unity
compilation evidence. No merge, public deployment, service change or Android work.

## Source hygiene

Python syntax checks and a bounded changed-file secret-pattern/payload scan passed.
The staged authored C#, Python, Markdown, HTML, JSON and Git-control files pass
`git diff --cached --check` for those types. The unrestricted whitespace check
reports Unity-serialized empty YAML fields with trailing spaces. They remain
unchanged to preserve the saved assets; no whitespace rule or CI gate was disabled.
Git applies the declared LF normalization to designated text files. Validation
source hashes identify the tested working-file bytes; the Git tree additionally
records the normalized source. This is not a claim that CRLF and LF hashes match.

## Inspection follow-on checkpoint - 2026-09-25T06:49Z

B explicitly retried the previously blocked inspection write. The completed helper
applied the change on parent a9c893a35cd2b6ba9e4cfc99be5011cae6cec9e0 only.
TankPresentation remains the camera/fitting owner; ArtHud adds inspection controls;
TankPartCallouts decorates that same Canvas with three mesh-bound labels.
The camera starts on the cannon-facing side. Orbit uses 45-degree camera steps,
front reset restores the initial three-quarter framing, and inspection controls
and callouts hide in battlefield view. These are reversible presentation choices.
No mesh, texture, material, saved scene, package pin or gameplay rule changed.

Build Web-20260925T064755Z-6d9dd3 passed with the pinned Unity/URP toolchain.
The existing UNCHANGED Tools/verify_web.py passed all 15 checks in headed Chrome
153.0.8010.50: evidence browser-verify-20260925T064918Z-38ba52. Its five recoil
peaks were 0.319883883..0.319996685 world units, all with zero return error.
No browser errors or failed requests were observed by that bounded regression.
Source, build and capture hashes are in docs/inspection-20260925/receipt.json.
The saved scene retained 5652aaba327cc7f26056a7ee033a98016a061e2de00e6176ea643441ca2adf65.

Four actual Web captures were inspected: front repair/launcher views, battlefield
without callouts, and resized inspection. This supports rendered appearance and
fitting-label changes; it is not final owner visual approval or an orbit test.
The new inspection-specific verifier's SECOND write was blocked before completion.
Tools/verify_inspection.py remains an unexecuted, untracked partial file on the PC;
it is deliberately excluded from this commit. No alternate route ran those tests.
Orbit/reset, full-circle wrap, the label-visibility toggle, preference retention,
and independent endpoint geometry acceptance remain NOT TESTED in the browser.

The full inspection acceptance is therefore OPEN despite the successful build and
existing regression suite. Diagnostics emit only after a change/resize settles,
not every frame. Cached renderers and retained UI geometry are used; this is a
source-level observation, not a sustained-performance measurement.

All 85 originally snapshotted saved authoring files still match their recorded
hashes. The original stterra editor remains open with unsaved work; it was not
saved, closed, regenerated or modified. Those in-memory edits are still not backed
up by this PR. Original saved assets, both old build trees and prior failures remain.
Only the review checkout receives this follow-on. Keep PR #524 draft and unmerged.
A rollback is a scoped revert of this follow-on, preserving the initial art and
recoil fix. No Android work, classic change, production service or deployment.
The original a9c893a checks were previously observed green; a new commit must have
its own repository CI observation, which is separate from local Unity evidence.

## Inspection acceptance and preview shutdown - 2026-09-25T07:33Z

B requested the next same-PR continuation and shutdown of all three old servers.
The actual Python listeners on 127.0.0.1:8787/8788/8789 were identified by their
ports, process IDs and exact task-owned build directories before termination.
PIDs 70124, 53860 and 23760 stopped; all three ports were confirmed without listeners.
Only those servers were stopped. The open original Unity editor was not touched.
No replacement persistent preview was started.

The previously partial verifier is now complete. Against the unchanged
Web-20260925T064755Z-6d9dd3 payload, inspection-20260925T073234Z-782b7e passed
247 assertions across 29 recorded states and 28 pointer actions in Chrome
153.0.8010.50. This is one bounded suite, not 247 independent gameplay scenarios.
It covers left/right orbit, reset, eight-step full-circle wrap, fitting retargets,
label hide/show, hidden-control refusal, both view-return preferences and resizing
to 1280x720 and 1024x768 from 1600x900. Tank and paused turret rotations stayed fixed.
Independent perspective projection differed from measured screen endpoints by at
most 0.035401 pixels. The test also checks actual rendered anchor pixels and panel
appearance/disappearance, rather than accepting state markers alone. Four new
angle/hidden/resize captures were inspected; eighteen captures remain in raw evidence.

Eight host test methods passed, including corrupt/NaN geometry, wrong binding,
visibility, out-of-bounds panels, duplicate parts and stationary-camera negatives.
An intentional old-build invocation was refused with exit 1 before launching a
browser. Both failed interaction attempts and this expected refusal are retained.
Every invocation closed its temporary HTTP server; the interaction browsers closed.
Exact identities and individual results: docs/inspection-acceptance-20260925/receipt.json
and browser-result.json. Original regression/recoil results remain earlier evidence;
there was no new Unity build and no runtime, scene, artwork or dependency change.

The first new invocation timed out waiting for motion and also recorded an
attachment event of undetermined input origin. The diagnostic retry captured
its requested pointer down/up during the Unity splash, before ST_ART_STATE ready.
The verifier had waited for download/loader completion, not scene readiness.
Waiting for the existing ready event and initial inspection receipt corrected this
test race; no game method, input behavior or acceptance tolerance was changed.
This directly explains the diagnostic retry, not every historical timeout.
The new pointer capture only observes DOM events; it cannot invoke Unity methods.

No JavaScript exceptions or failed HTTP requests occurred in the passing run.
However, six WebGL INVALID_ENUM warnings and three unsupported-shader diagnostics
were emitted (CoreCopy, StencilDitherMaskSeed and HDRDebugView). They are recorded,
not resolved or declared harmless by these tests. The Python pixel reader also
emitted a Pillow getdata deprecation warning; no dependency was upgraded.
Receipt assembly initially encountered a PowerShell UTF-16 decoding mismatch;
the decoder was corrected after verifying the partial output, without changing
raw evidence. These tooling failures remain separate from game behavior.

This closes the enumerated desktop inspection-control/geometry checks only.
Viewport containment is not occlusion-aware layout: leaders may cross the tank,
and the narrow landscape fitting panel can overlap the cannon. Terrain/props and
track impressions remain first-pass art. No final owner visual approval, full
accessibility, cross-browser, sustained-performance or mobile acceptance follows.
All 85 saved original-authoring files still match their prior snapshot. Unsaved
editor memory remains outside this PR. Keep the same draft unmerged; no classic,
account, save, gameplay/economy, Android, public-hosting or deployment work occurred.
