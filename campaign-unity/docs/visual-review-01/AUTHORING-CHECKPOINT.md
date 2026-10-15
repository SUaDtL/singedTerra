# ST-VIS-01 — authoring checkpoint, not visual acceptance

September 25, 2026. Source baseline: `7d3d21cda22c8ea5b2fe1a38f722211a3a44c97b`; same draft PR #524.

The explicitly authorized scope-write retry succeeded. The complete scope is now at `.codearbiter/specs/unity-battlefield-visual-review.md`. Visual polish remains a completion requirement before upgrades; matched Unity A/B images and normal-speed early/busy motion still need to be produced and reviewed by B.

## Completed authoring

`Tools/build_visual_art.py` ran through Blender 5.2.0 LTS with exit 0. It generated a new editable `ArtSource/VisualReview_01.blend`, two separate enemy FBXs (`STV-E01`, close-vehicle appearance; `STV-E02`, gun-carrier appearance), and three 2048-pixel terrain/wear textures under `Unity/Assets/Art/VisualReview/`.

The source retains separate components and modifiers. Original tank and parts-library source were not regenerated. The new generator refuses existing output/source paths. Nominal exported triangulation is 8,868 and 9,216 respectively; these are Blender counts, not Unity import measurements or performance budgets. Source and all five FBX/texture hashes matched `art-receipt.json` at the post-block check. Python syntax was checked. No rendered-art quality approval is inferred from generation.

## Blocked integration

The append to `Unity/Assets/Scripts/ReviewCombatVisuals.cs` was blocked by the tool safety-status check. Its first 55 lines remain local and incomplete, ending inside the pooled-feedback constructor. The denied append was not retried, completed through another route, or executed.

Local uncommitted integration also includes complete `EncounterProfile.cs`, `BattlefieldReview.cs`, and edits to `EncounterModel.cs` / `EncounterSession.cs`. Those files are NOT in this source checkpoint commit. The camera adapter called by BattlefieldReview is still absent. Do not build or open the dirty review project expecting runnable code; resume from the real saved partial files and finish integration first. The original FieldAssembly scene bytes remain unchanged.

The published checkpoint contains only the complete scope, Blender authoring script/source, generated raw exports/textures and this receipt. It deliberately excludes unfinished C#; it does not claim the two Unity treatments or a new playable slice are finished.

## Evidence and next action

Execution receipt: local `Evidence/visual-art-20260925T194954Z-64d0c9/`, Blender exit 0. Pre-adapter backup: `Evidence/visual-before-20260925T194744Z/`. At 19:54:50 UTC, old ports 8787/8788/8789 had no listeners and Unity/Blender were absent. No preview or test browser was started.

No Unity import/compile, new saved comparison scene, Web export, browser input test, motion capture or B acceptance occurred. Existing tests keep their old artifact bindings; no old failure is rewritten. Shader/WebGL, library topology/LOD/gallery and former unsaved-original-scene limits remain unresolved.

After an explicit retry of the blocked vehicle-presentation append, read current head and dirty files, preserve this work, complete the existing-owner adapters and the separately saved comparison scene, then compile, inspect and test both treatments. Do not add upgrades, Android, classic/backend changes, production operations or a persistent preview. Keep the PR draft and unmerged. A source checkpoint is not a visual milestone pass.

The first attempt to save this documentation file failed because its new parent folder did not yet exist. Creating the folder and writing this independent receipt resolved that filesystem error; it did not retry or bypass the blocked C# append.
