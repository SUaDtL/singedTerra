# ST-VIS-01 — actual Unity Web comparison

Packaged 2026-09-26T09:32:32.024148+00:00 from the successful final full browser receipt. Open [the local gallery](index.html).
This is a candidate for owner review. Still-image preference and normal-speed motion acceptance remain pending.

## What is held equal

Each A/B pair holds the exact paused model snapshot, encounter tick, review-pacing-v1 profile, tank,
committed fitting, effects mode and viewport equal. Fittings and viewports differ only between labeled pairs.
Both treatments use the same authored tank/enemies and gameplay rules. A uses a 58-degree camera,
warm sunlit ash palette and open scorched scenery; B uses a 70-degree camera, cooler lighting and
industrial perimeter framing. The camera, palette and scenery changes are declared comparison variables.
This profile is bounded review tuning, not selected opening balance or a finite victory mission.

## Recorded evidence

- Browser: 153.0.8010.50; owned-headless-new-no-overrides; actual pointer input.
- Headless capture: True; recorded focus scope: browser-tab.
- Windows window-manager acceptance: false. Browser-tab focus checks do not establish desktop-window/minimization acceptance.
- Renderer: ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11).
- Graphics API: WebGL 2.0 (OpenGL ES 3.0 Chromium).
- Built scene: `Assets/Scenes/BattlefieldReview.unity`. Build directory: `Web-20260926T092206Z-090ef5`.
- Source HEAD at export: `b09e2d0b73bfca41b639b3d60914a967ed7a91e7`.
- Export source inventory SHA-256: `ed67dc19b37220e3745655ab47e1ef901a215e9cf464ca9f0b342d89e52bb1e9`.
- Source state at export: a dirty worktree; its exact dirty inventory and file hashes are retained in the unchanged receipts.
- Browser checks: 126, all passing in the supplied receipt.
- Legacy model cases: 14; review model checks: 16; review scene checks: 16.
- Matched still pairs: 6. Captured viewports: 1280x720, 1600x900, 800x600.
- Recorded warnings: 6; shader diagnostic records: 3.

The original successful [build receipt](receipts/build-result.json) and [browser receipt](receipts/browser-result.json)
are copied byte-for-byte. [manifest.json](manifest.json) pins every copied artifact and generated gallery file.
Original PNGs are unedited; opening an image in the gallery shows its full-resolution source copy.
The manifest binds packaging to the actual source and build bytes, not a regenerated illustration.

## Normal-speed motion

Source frame timestamps drive encoding; MP4 output is quantized to 25 fps. Encoded frame counts and durations therefore differ from the captured frame sequences. No simulation acceleration was used; the encoded files do not preserve every source frame or exact timestamp interval.
All four motion clips use the repair fitting. A and B are separate runs of the same encounter profile,
not frame-synchronized motion comparisons. Start/end encounter ticks are listed below. Launcher evidence
consists of matched stills and the recorded technical runs, not a launcher motion clip in this package.
The copied frame JSON and encoding timelines retain those timestamps. Raw JPG frames stay in the ignored
Evidence recording directories and are not included in this package. Encoding occurred after the browser runs.
These recordings are for appearance/motion review, not a frame-rate or sustained-performance measurement.

All frame JSON files and encoding timelines are checked against hashes in the browser receipt, then pinned again by the package manifest.

| Clip | Captured frames | Captured timestamp span | Encoded frames | MP4 duration | MP4 fps | Encounter ticks |
|---|---:|---:|---:|---:|---:|---:|
| motion-repair-full-A-early | 222 | 7.866 s | 199 | 7.96 s | 25 | 0–160 |
| motion-repair-full-A-busy | 282 | 9.960 s | 251 | 10.04 s | 25 | 1200–1400 |
| motion-repair-full-B-early | 212 | 7.485 s | 189 | 7.56 s | 25 | 0–160 |
| motion-repair-full-B-busy | 282 | 9.956 s | 251 | 10.04 s | 25 | 1200–1400 |

## Limits and owner decision

The natural v1 runs recorded zero close hits; defeat was driven by ranged attacks. That is a disclosed pacing
limitation, not proof that close-contact pressure is balanced. The complete outcomes and warnings remain in
the unchanged browser receipt; no warnings or earlier failures were relabeled as passing.

No owner visual acceptance, owner motion acceptance, phone, cross-browser, sustained-resource or performance
acceptance follows from these checks. No upgrade/progression milestone is approved by this package.

Owner decision is pending: name what to **keep**, **change**, or **mix** in the actual viewed treatments.
A preference for the camera does not approve the HUD, terrain, lighting, feedback or pacing. Review early
and busy motion separately before advancing beyond this visual checkpoint.
