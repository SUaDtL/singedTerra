# Seed Pack 02 — delivery validation

Status: Blender generation and rendering PASS; Unity FBX import PASS; portable cross-format verification FAILS on a known triangle-count discrepancy. These are separate results.

## Completed

Blender 5.2.0 LTS generated 24 original base models plus five enemy LOD1 variants, with 29 FBX and 29 GLB files. Generation and preview processes both exited zero. The 24 individual renders, four contact sheets and outpost composition were visually inspected; these are Blender renders, not Unity/browser screenshots.

Unity 6000.3.24f1 with URP 17.3.0 compiled and imported the isolated library successfully. The final process exited zero. `Evidence/unity-import-receipt.json` records all 29 FBX imports with matching transformed-vertex dimensions, exact triangle counts and verified named-empty positions. There are 34 saved prefabs: 24 base, five LOD1 and five two-level LODGroup prefabs. The static layout and `singedTerra-SeedPack02.unitypackage` were generated.

Base FBX geometry totals 36,056 triangles. These are not draw-call, frame-time or mobile-budget measurements.

## Unresolved checks and visible limitations

`Tools/verify_pack.py` exited one at ST2-E04_LOD1: GLB has 1,087 indexed triangles, while the catalog's Blender/FBX value is 1,088. The checker stops at that assertion, so later portable entries are not covered by this run. Full cross-format topology parity is NOT certified. Use the verified FBX/Unity path for initial integration.

`Evidence/pack-verification.json` was not produced because the verifier failed. The earlier README link to it identifies the verifier's intended output, not a completed receipt. A proposed format-count/checker update was blocked before execution and was not retried. The checker remains unchanged; do not interpret its nonzero result as a pass.

ST2-B05 reserve tank has overlapping endcap faces with visible dark/z-fighting artifacts. Its targeted correction write was blocked before the patch file existed, and no geometry correction was applied. This asset needs polish before production use.

The low-detail models, automatic LOD reduction, provisional LOD thresholds and textures are draft seed art. There are no animation clips, armatures, colliders, navigation, destruction rules, combat changes, Web export, browser tests, phone benchmarks or final owner visual approval.

## Preserved history and coordinates

The first Unity launch failed before import because the child environment lacked ProgramData/ALLUSERSPROFILE. Supplying these to the child process fixed startup; no system configuration or security controls were changed. The next import correctly stopped on a mistaken expected X sign. An independent node probe established the imported mapping, then the final check passed. Earlier logs and the pre-correction importer remain under Evidence.

Measured Unity point mapping is Blender `(x,y,z)` to Unity `(-x,z,-y)`. Forward is -Z and up +Y. Keep FBX conversion transforms inside the identity prefab wrapper; the node names retain their authored left/right meanings.

All work stayed in `C:\Users\brenn\st-kit02`. The existing working checkout, first pack, saved campaign scene and active uncommitted gameplay work were not modified. No commit, push, merge, deployment or save-data change occurred.
