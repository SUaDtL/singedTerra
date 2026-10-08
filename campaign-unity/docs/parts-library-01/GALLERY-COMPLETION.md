# ST-KIT-01 gallery completion — October 4, 2026

The separate saved Unity gallery presents the existing 20 reusable parts and
three assembled examples. Its controls select individual entries, page through
the full list, cycle assemblies and three paint finishes, and orbit the camera
with buttons or a pointer drag. It does not attach any item, stat, unlock or
encounter behavior to the art. The September 25 `receipt.json` and
`index-checks.json` remain records of the earlier static-library stage and its
then-unfinished gallery.

## Reproduction and proof

- A focused Editor check first failed with `ST_KIT_GALLERY_FAIL saved gallery
  scene missing` (`Evidence/gallery-red.log`, line 315). The one-time scene
  authoring step then compiled and passed `ST_KIT_GALLERY_PASS` for one scene
  owner, 23 unique prefab bindings, three assemblies and three saved paints.
- `python Tools/build_web.py --editor
  C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe
  --scene gallery` produced
  `Builds/Web-20261004T044901Z-a556f3` with `status: pass`. Its Unity scene
  digest was `4c7350383582d50c05cc7d7ac32894842ff39c4278a3c5d259f3fac77a5604c2`
  both before and after; its input inventory digest was
  `d5c7cf63d6b205b48a97b2c52cac4ec1116ef6534b5a51ee26f2cd6e133ab77f`
  before and after. The receipt is in
  `Evidence/build-20261004T044901Z-a556f3/result.json`. The subsequent index
  generator edit updates documentation/status output only; the gallery scene,
  controller and compiled Web input remained as captured in this build.
- `python Tools/gallery_browser_check.py
  Builds/Web-20261004T044901Z-a556f3
  Evidence/gallery-browser-camera-20261004T0450Z` passed in owned headless
  Chromium. Ordinary pointer input exercised next item, direct list selection,
  list paging to `STK-S03`, assembly cycling to `STK-S01`, paint to slate,
  both orbit buttons, model drag and reset. The resulting 49 state events had
  zero browser errors. The owned loopback server and browser closed.
- [Initial part](gallery/initial.png) and
  [slate assembly](gallery/assembly-slate.png) are actual Unity Web frames from
  that browser run. The complete assembly, including front tracks and plinth,
  clears the control bar in the inspected frame. The twenty-three older preview
  renders in this folder were produced by Blender and retain their prior scope.
- `python -m unittest discover -s Tools -p test_build_web.py -v` passed seven
  saved-scene routing/source-binding checks. `python Tools/index_parts_library.py`
  passed the existing FBX/source hash, prefab and finite-size checks, writing
  `index-current.json` while preserving the September 25 `index-checks.json`.

`FieldAssembly.unity` and `BattlefieldReview.unity` still match their committed
Git object IDs (`4622532053d94795f8868ef9d8c604c4b23cb18e` and
`799c06bf32afdad28b7c0f27fd737e38edc8fd68`). No authored mesh, FBX,
texture, prefab or original scene was changed or regenerated. This gallery
evidence is a local Web build and representative browser journey; it does not
claim phone performance or the owner's final visual preference for the separate
BattlefieldReview A/B treatments.

## Terminal effect correction

The `EncounterSession` presentation now ages existing tracers and feedback
after the model reaches a terminal state, while preserving its terminal model
snapshot and refusing event replay. A focused regression was red against the
original return-on-terminal path and passed after the correction for both
review fittings. It also checks focus and app-pause hold plus failure handling.
The run command is `powershell -NoProfile -File
Tools/terminal_effect_drain/run.ps1 -EditorRoot
C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1`.
That harness compiles the real session/model/profile against stub visual types;
it is not a fresh BattlefieldReview Web defeat run. The gallery Web build
compiled the corrected session in the pinned Unity Editor.
