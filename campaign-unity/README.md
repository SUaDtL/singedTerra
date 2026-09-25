# singedTerra Unity Web starter art (ST-ART-01)

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
