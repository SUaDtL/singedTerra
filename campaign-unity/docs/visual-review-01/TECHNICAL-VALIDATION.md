# ST-VIS-01 technical validation — September 26, 2026

The separate `BattlefieldReview` scene is a candidate for the owner's keep/change/mix review.
Open the [gallery](browser-20260926T093232Z/index.html) or its
[review notes](browser-20260926T093232Z/REVIEW.md). Neither treatment is selected,
and owner approval of stills and normal-speed motion remains pending.

The scene adds warm ash and cool industrial treatments, imported vehicle enemies,
grounded scenery, a combat HUD, and bounded hit/destruction feedback around the
retained tank. It uses the existing simulation, session, camera and input owners.
The original FieldAssembly fixture, parts library and independently committed
Seed Pack 02 remain available. No progression or production service is connected.

## Fresh local proof

Both saved-scene exports passed with Unity 6000.3.24f1 and URP 17.3.0:
`Web-20260926T092206Z-090ef5` (review) and `Web-20260926T092302Z-d0c083` (FieldAssembly).
The builder ran compilation, model and applicable editor geometry/HUD/preservation
checks, then verified unchanged scene and source bytes. It did not regenerate art.

| Executed check | Result | Copied receipt |
|---|---|---|
| `verify_visual_review.py <review receipt> --headless` | 126 checks; 54 pointer actions / 108 observed edges; six matched pairs; four motion clips | [Visual](validation-20260926/visual-result.json) |
| `verify_web.py <field build> --headless` | 15 checks | [Art](validation-20260926/art-result.json) |
| `verify_inspection.py <field build> --receipt <field receipt> --headless` | 247 checks | [Inspection](validation-20260926/inspection-result.json) |
| `verify_encounter.py <field receipt> --headless` | 50 checks | [Encounter](validation-20260926/encounter-result.json) |
| `python -m unittest discover -s Tools -p test_*.py -v` | 27 host test methods | [Host command](validation-20260926/supporting/host-tests.json) |
| `VisualReviewBuild.Check` spacing regression | Both complete natural runs; minimum footprint gaps 0.375 m / 0.372 m | [Command](validation-20260926/spacing-result.json), [safe editor markers](validation-20260926/editor-markers.json) |

The separate [gallery URL regression](verify_gallery_urls.py) exercises all five
metadata-fed URL assignments, legitimate local assets and literal display text.
From `campaign-unity`, run:

```powershell
python docs/visual-review-01/verify_gallery_urls.py docs/visual-review-01/browser-20260926T093232Z/index.html
```

Add `--revision b14aeb2208b8a34bc81fa2c2320f42ac31a4aa4f` to reproduce the
historical unsafe-URL baseline. Fixtures and receipts stay in ignored Evidence;
the check closes its owned browser and does not alter the gallery package.
The same final helper produces 121 failures on that baseline and passes all
152 checks on the corrected gallery. URLs now use fixed local folders and
encoded, strictly validated filenames; invalid metadata leaves the corresponding
URL unset. All copied captures, videos and receipts remain byte-identical.

Browser runs used installed Chrome 153.0.8010.50 in an owned `--headless=new`
default context, without focus emulation, on WebGL 2 / NVIDIA RTX 5070 Ti through
ANGLE D3D11. Pointer input, real browser-tab focus loss, frozen suspension and
explicit resume were exercised. The 50-check legacy run excludes the six headed
Windows-minimize checks; it is not relabeled as the older 56-check result.
Owned browser processes and loopback servers closed after their runs.

The six paused comparisons hold model snapshot, fitting, effects and viewport
equal within each pair. The repair early comparison includes 1600×900, 1280×720
and 800×600; busy and launcher pairs are wide captures. The four repair-only
motion clips cover early/busy A and B in separate normal-speed runs. They are
not frame-synchronized A/B recordings. Raw frame timestamps, encoding timelines
and MP4s are hash-bound by the final browser receipt and gallery manifest.
The MP4 encoder quantizes output to 25 fps: the four clips contain
199/251/189/251 encoded frames and last 7.96/10.04/7.56/10.04 seconds,
about 75–94 ms longer than their captured timestamp spans. The recorded source
frames and timelines remain available for that distinction; simulation time
was not accelerated.

## Provenance and preservation

Both builds bind the same 508-file inventory before and after export:
`ed67dc19b37220e3745655ab47e1ef901a215e9cf464ca9f0b342d89e52bb1e9`.
They were built at base HEAD `b09e2d0b73bfca41b639b3d60914a967ed7a91e7`
with the recorded dirty implementation inventory. These receipts do not claim a
later clean-commit rebuild. [Review build](validation-20260926/review-build-result.json)
and [field build](validation-20260926/field-build-result.json) retain exact inputs
and output hashes. The gallery and [validation manifest](validation-20260926/manifest.json)
pin unchanged copies; scoped Git attributes disable byte conversion for these
evidence folders. Full editor logs, browser profiles and compiled Web payloads
are excluded from publication.

All 150 files in the original preservation receipt still match their raw hashes.
FieldAssembly remains
`5652aaba327cc7f26056a7ee033a98016a061e2de00e6176ea643441ca2adf65`.
The separately saved review scene remains
`024013749d3d53cb32844715ec6f5013bea8144417424561681cbb2263d22c2f`.
The original Blender source, two enemy FBXs and three authored textures were not
regenerated. New Unity assets have metadata and no duplicate asset GUIDs.

## Defects corrected during this continuation

- Editor checks had broadcast `Start` to sibling components and serialized runtime
  owners into the review scene. Targeted lifecycle invocation and before/after
  owner guards prevent recurrence. The separate repair receipt preserves that history.
- Two existing JSON assets have known raw CRLF and Git LF representations. Exact
  path/history/hash compatibility admits only those recorded representations;
  content, whitespace, BOM, lone-CR, path, receipt and binary mutations are rejected.
- A simultaneous cannon/launcher kill created duplicate destruction feedback.
  A real fixture now requires one destruction effect while retaining both impacts.
- The inspection title clipped and the industrial ground repeated at viewport
  corners. Shorter review copy and material UV mapping correct those defects.
- New instanced enemy batch sizes caused a 502 ms shader-compilation stall and
  suspended combat. Disabling instancing on only the six new enemy materials
  removed the recurring stall. A separate diagnostic run reached the expected
  outcome with a maximum recorded combat long task of 106 ms; the final full
  browser suite then passed. [Red](validation-20260926/supporting/shader-stall-red.json)
  and [green](validation-20260926/supporting/shader-stall-green.json) are supporting
  diagnostics from before the later spacing correction, not final acceptance
  receipts or general performance benchmarks. Their own script hash was not recorded.
- Closely spaced enemies visibly intersected. The original presentation fails
  actual imported-mesh footprint checks at tick 57. Fixed clockwise columns now
  separate the natural runs while preserving straight travel and model radii.
  The editor check samples each tick with 0.05-second interpolation and cached
  mesh envelopes; it does not prove every animated browser subframe.
- Injected early setup failures left owned browsers open in two verifier paths.
  Outer cleanup now closes those children; bounded [red](validation-20260926/supporting/cleanup-red.json)
  and [green](validation-20260926/supporting/cleanup-green.json) injection receipts
  are retained. Earlier failed runs remain in ignored Evidence.

Raw final wide/standard/compact stills and sampled early/busy recording frames
were inspected for contact, clear silhouettes, clipping, terrain continuity and
feedback. That self-review found and corrected the visible defects above. The
owner's normal-speed viewing and scoped visual acceptance are still separate.

## Remaining limits

The explicit `review-pacing-v1` profile retains deterministic outcomes:
repair defeats at tick 1557 and launcher at tick 1647. Full/reduced effects agree.
Both natural runs have **zero close hits**; ranged attacks drive defeat. This is
bounded comparison tuning, not selected opening balance, a victory mission or
qualification of future crowded/contact profiles. The historical legacy outcomes
remain exactly recoverable and pass on the separate FieldAssembly build.

Six WebGL `INVALID_ENUM` warnings and three unsupported hidden-shader diagnostics
remain recorded. Enemy E02 imports with 9188 triangles versus 9216 nominal; no
complete importer topology-equivalence certification is claimed. Windows window
minimize, phone/Android, other browsers, full accessibility and sustained performance
acceptance are unexecuted here. Repository CI protects its own code paths and does
not certify this Unity artwork. Keep the PR draft and unmerged at the owner's
visual selection checkpoint.
