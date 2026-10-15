# singedTerra — Seed Pack 02: Ashfall Outpost

Workspace: `C:\Users\brenn\st-kit02`. Start with `ASSET-INDEX.md` and `catalog.json`.
This is an additive art seed library, not a gameplay implementation or approved enemy roster.

## Assets

24 original base assets: 5 enemies, 7 terrain pieces, 5 buildings and 7 props.
Five enemies also have reduced-detail LOD1 exports. Base geometry totals 36,056 triangles.
Enemy IDs: ST2-E01 Tick scout; E02 Ram crawler; E03 Kiln mortar carrier; E04 Stilt walker; E05 Tripod sentry.
Terrain IDs: ST2-T01 ash tile; T02 berm; T03 crater; T04 basalt cluster; T05 escarpment; T06 ramp; T07 charred trees.
Building IDs: ST2-B01 bunker; B02 depot; B03 relay mast; B04 ruin; B05 elevated reserve tank.
Prop IDs: ST2-P01 drums; P02 fence; P03 pipe elbow; P04 work light; P05 cable reel; P06 sign; P07 wreck.
All abbreviated IDs use their corresponding `ST2-` prefix. These are art IDs, not save/item/economy IDs.

## Files to use

`ArtSource/Ashfall_Outpost_02.blend`: editable components and modifiers, arranged on a spaced source bench.
`Exports/FBX/`: 29 individual Unity-oriented model files. `Exports/GLB/`: 29 self-contained portable models.
`Textures/`: five original 256-pixel tiled base-color textures; no external art or font payload.
`Unity/Assets/SeedPack02/`: models, textures, catalog and, when import passes, Generated materials/prefabs/layout.
`singedTerra-SeedPack02.unitypackage`: generated only after a successful Unity import/validation.
`Previews/`: 24 individual Blender renders, four contact sheets and one dressing-scene render.
`Evidence/`: actual import/generation logs, geometry checks and final verification. Failed attempts remain recorded.

## Import safely

Prefer importing the ready Unity package into an isolated copy of the campaign first. It adds its own asset namespace.
Alternatively copy `Unity/Assets/SeedPack02` WITH its `.meta` files into the target project's Assets directory.
Do not replace a destination folder that already exists. Stop on GUID/path conflicts; preserve artist and CLI work.
Use the project's existing URP settings. Importing the library does not require replacing its render pipeline.

## Coordinates and hooks

One model unit is one meter. Blender: +Z up, +Y forward. Intended Unity wrapper: +Y up, -Z forward, matching Field Kit 01.
The Unity receipt checks transformed-vertex dimensions and every authored empty's position, not just conservative Renderer bounds.
Keep imported conversion transforms intact inside the identity wrapper. Do not force every nested transform to scale one.
`catalog.json` records Blender bounds, actual export node paths, materials and file hashes. Unity receipt records imported paths.
Enemy hooks include sensor/turret yaw, barrel pitch/recoil and muzzle markers as appropriate. E01 has wheel pivots; E04 has hip/knee pivots.
These are rigid hierarchy hooks, not armature rigs or animation clips. Synchronize both LOD hierarchies when animating an LODGroup prefab.
Source-bench translations are display-only. Individual exported roots are at origin; grounding exceptions include terrain bowls/relief.
T01/T02/T03 share an 8 m grid with border heights zero. T06 rises from south 0 m to north 2 m; match elevations deliberately.
Terrain meshes are top surfaces, not closed solids, colliders or Unity Terrain objects. Use a suitable underlay/skirt at exposed edges.
P02 fence repeats at 4 m. Snap markers are art anchors, not a construction or navigation system.

## Suggested bounded CLI slice

In a separate working copy, read the existing encounter/presentation owners, then map a selected enemy visual to a current diagnostic actor.
Retain its present hit rules, movement, timing and reward behavior. Bind pose hooks explicitly and verify forward direction at multiple headings.
Place a few building/terrain prefabs in a separate review scene before touching the saved campaign scene.
Re-run relevant encounter and inspection checks after integration. Existing browser receipts do not validate these new assets.
Do not infer stats, unlocks, classes, rarity, drop tables, construction, cover or pathfinding from art names or dimensions.

## Known limits

Draft seed art, not final owner-approved visuals. Low-detail faceted rocks and coarse textures are intentional starting points.
B05 reserve-tank end faces overlap the tank body's caps, producing visible shading/z-fighting artifacts. Treat B05 as requiring an endcap cleanup before production use.
A targeted correction write was blocked before a patch file existed; no correction was executed or claimed.
LOD1 is automatic decimation, not an approved distance/readability budget. LODGroup thresholds are provisional art-preview settings.
Mesh groups can contain multiple material slots; geometry totals are not draw-call counts. Readable mesh data remains enabled for import measurement.
No colliders, navigation, destruction, animation clips, gameplay code, browser build, mobile/device benchmark or production deployment is included.

## Validated delivery entry points

Read `VALIDATION.md` before integration. Unity FBX import passed for all 29 variants and produced 34 prefabs. The separate cross-format checker stopped at E04_LOD1 because GLB has 1,087 triangles versus the catalog's Blender/FBX value of 1,088; no complete portable-validation pass is claimed.

Ready prefabs: `Unity/Assets/SeedPack02/Generated/Prefabs/`. Static scene: `Unity/Assets/SeedPack02/Generated/SeedPack02_Layout.unity`. Ready import bundle: `singedTerra-SeedPack02.unitypackage`.

The measured FBX point conversion is `(x,y,z)` in Blender to `(-x,z,-y)` in Unity. Preserve the imported hierarchy rather than assuming authored left/right nodes correspond to the same global X sign. The Unity receipt records actual imported positions.
