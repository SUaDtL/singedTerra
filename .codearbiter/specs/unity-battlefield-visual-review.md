---
specification_id: ST-VIS-01
specification_revision: 2
prepared_on: '2026-09-25'
repository: SUaDtL/singedTerra
baseline_sha: 7d3d21cda22c8ea5b2fe1a38f722211a3a44c97b
branch: codex/unity-web-starter-art
pull_request: 524
status: In progress; raw art exported; Unity integration blocked and untested
intended_repository_path: .codearbiter/specs/unity-battlefield-visual-review.md
---

# ST-VIS-01 — two actual Unity battlefield treatments

## Authority and finish line

B explicitly agreed to a concrete two-treatment Unity visual comparison and requested PR preservation and a durable Project-source update. This scope implements that request, not the old first-upgrade recommendation or Android-first UF-01 proposal. Continue the existing draft PR #524 after checking its live head. Do not merge, enable auto-merge, force-push, synchronize main, deploy, or create a public preview.

**Visual polish is a completion criterion.** Small scope means fewer well-finished elements, not an excuse for visibly unfinished work. The first checkpoint is two actual Unity battlefield treatments that B can compare at the same state and display size. B may select or combine elements. The chosen treatment must then be reviewed in actual normal-speed browser motion, including early and busier states, before calling this milestone visually accepted or moving it to upgrades. Do not silently choose the preferred treatment for B.

Historical r1 interruption: the first scope write was blocked and created no file. B then explicitly authorized retrying ST-VIS-01. The same write succeeded on September 25; the retry addendum and authoring checkpoint below record the separate later integration block. No denied operation was completed through another route.

## Intent to retain

Preserve the recognizable player tank, substantial tracked machinery, scorched military setting, retro-2000s identity and bronze interface character. Physical equipment must remain genuinely visible and editable. Keep the same Unity project/assets for mobile continuation. The browser PoC is not disposable, and mobile is not a mandate to recreate it.

B reviews by seeing and reacting. Show concrete alternatives without requiring previsualization, art vocabulary or a diagnosis. Record accepted elements, requested changes and open aspects. A preference for a camera does not approve the HUD, terrain, lighting or mechanics. Preserve liked elements while revising the others. Do the first workmanship review before showing B.

## Bounded contents

| Area | Intended result |
|---|---|
| Combat composition | A smaller but recognizable tank within a generous all-around engagement area, with space for approaches and a restrained HUD. Close inspection remains separate. |
| Terrain and setting | Continuous ground at the wider view, coherent material scale, purposeful scenery placement and grounded vehicles. No visible unfinished edge or HUD/scenery obstruction of necessary threats. |
| Enemy presentation | A small coherent close/ranged vehicle set that belongs beside the tank; readable silhouettes, movement and attack transitions instead of diagnostic boxes accepted as final art. |
| Waves and streams | Legible approaching groups with deliberate spacing and increasing overlap. They remain part of a last stand, not newly selected finite victory missions or a final roster. |
| Feedback | Readable firing, muzzle/recoil, outgoing fire, impacts, damage and destruction. Decorative density is bounded and cannot decide damage or targets. |
| Interface | Compact and deliberate bronze/retro hierarchy, operable comparison and run controls, clear text and no clipped/overlapping primary controls at tested viewports. No economy UI. |
| Alternatives | Two comparably developed treatments using the same tank/loadout and declared encounter state. Palette, lighting, composition and surrounding scenery may differ, with variables documented. |

Initial art proposals: **A, sunlit ash clearing** with warm light and open scorched ground; **B, cool industrial perimeter** with different lighting and perimeter framing. These names and treatments are starting design choices, not B's final selection, adopted lore or permission to replace specifically liked assets. Avoid equating more bloom, smoke, detail or camera shake with better polish.

## Separate appearance from pacing

A visual A/B holds the encounter profile, state, loadout, effects setting and viewport fixed. Switching treatment while paused must leave combat state unchanged. Camera zoom, aspect ratio, lighting and reduced decoration must not change spawn distance, range, speed, health, targeting or outcomes.

The prior fixture was a short technical encounter, not selected opening balance. A pacing adjustment is permitted only as a clearly identified bounded review profile with explicit units, rules/version and its own evidence. Keep the original fixture and expected results recoverable. Preserve the fixed-step model, admitted-time owner, automatic fire, independent launcher/repair behavior and run-committed loadout.

Earlier suggestions—tank screen width at 60–70% of the old view, 12–18 seconds of useful engagement, and 2.5–3 seconds between opening arrivals—are hypotheses, not approved constants. Farther spawning alone does not increase the in-range firing window. Compare composition with matched combat first, then identify pacing differences separately. Do not infer exact Tower timing from screenshots or stale research.

The intended experience has time to recognize approaching threats and see the tank fight before significant overlapping pressure. Some eventual close contact must remain compatible with defensive/hybrid builds. This does not promise no early damage, a fixed first-run length or a final difficulty curve.

## Existing ownership and verified source paths

All paths below are relative to `campaign-unity` and were observed at the baseline, not invented as existing commands:

| Owner / entry | Path |
|---|---|
| Combat fixture | `Unity/Assets/Scripts/EncounterModel.cs` |
| Session and admitted ticks | `Unity/Assets/Scripts/EncounterSession.cs` |
| Tank pose/recoil and camera | `Unity/Assets/Scripts/TankPresentation.cs` |
| Opponent/tracer presentation | `Unity/Assets/Scripts/EncounterView.cs` |
| Shared Canvas/input and battle controls | `Unity/Assets/Scripts/ArtHud.cs`, `EncounterHud.cs` |
| Model and imported-tank pose checks | `Unity/Assets/Editor/EncounterChecks.cs` |
| Saved-scene build | `Unity/Assets/Editor/SceneBuild.cs`, `Tools/build_web.py` |
| Existing browser checks | `Tools/verify_web.py`, `verify_inspection.py`, `verify_encounter.py` |
| Authored equipment reference | `PARTS-LIBRARY.md`, `ArtSource/PartsLibrary_01.blend`, `Unity/Assets/PartsLibrary/Prefabs/` |

Do not introduce a parallel active simulation, session, camera or input owner to add comparison UI. Keep the classic Preact/Canvas ADR scope distinct from the isolated Unity scene. Inspect actual source and governance before changing adapters. The normal build currently exports the saved FieldAssembly; a comparison-scene build route must be explicitly implemented and tested, not assumed already present.

## Source and operational protection

Write only `campaign-unity/**` and this intended new scope document. Read CLAUDE.md, CONTRIBUTING.md, .codearbiter coding/security standards, applicable accepted decisions and the existing art/encounter/library specifications. Historical recovery/balance ledger headings do not dispatch those tasks. Do not create another execution ledger.

Preserve original `stterra` and `stweb01`, all current saved art, the parts library, previous scenes/builds, failed receipts and independent edits. The original editor was absent at preflight; its formerly unsaved-memory fate is unknown. Never infer it was saved or backed up. Recheck any open editor before builds or writes. Use a separately named review scene or controlled source copy instead of overwriting saved FieldAssembly or regenerating accepted art. Normal builds must not overwrite artist edits.

Keep the existing Unity 6000.3.24f1 / URP 17.3.0 pins for this continuation; no dependency installation or upgrade is dispatched. Exclude caches, browser profiles, licensing data, secrets, font files and compiled Web payloads from the PR. Own temporary test processes and close them on success/failure. Do not restart old previews or leave a persistent server without a request.

No classic/client/shared/backend changes, save/reward authority, upgrade system, shop, currency, gacha, Skills, R&D, paid/ad integration, Android build, emulator or device setup. Base props remain scenery unless separately approved; cosmetic shapes grant no stats.

## Acceptance and evidence

**Technical:** fresh compilation and Web export; source/build binding; relevant existing regressions with historical fixtures intact; actual pointer controls; paused A/B state preservation; deterministic comparison-profile results if added; resize/threat visibility; pause/focus behavior; repeated entry/run cleanup; full/reduced-effect outcome equivalence. Record what actually ran, not a fabricated count or inherited pass assigned to a new scene.

**Visual review readiness:** inspect actual rendered output for ground contact, sliding or discontinuous movement, terrain edges/tiling, material/lighting mismatch, ambiguous hits/deaths, clipping/overlap and weak hierarchy. Correct clear defects before presenting; disclose remaining deficiencies. Compare the same state in both treatments and include a readable busier moment. Preserve raw captures when assembling a labeled comparison board.

**Owner visual acceptance:** B reviews the real alternatives and names what to retain/change/mix. Approval attaches only to the viewed artifact and specific elements. Delivering a candidate, obtaining green tests, or judging the scene attractive does not satisfy this gate. Normal-speed motion must be reviewed separately from stills before moving to the upgrade layer.

Record renderer, source SHA/dirty inventory, build, viewport, treatment, encounter time/state and effects mode for visual evidence. Concepts, Blender renders, Unity Editor views and browser captures must be labeled distinctly. No phone, full accessibility/cross-browser, sustained-resource or final production acceptance follows from this bounded checkpoint. Retain the existing shader/WebGL diagnostics until genuinely investigated; do not suppress them to create a clean-looking report.

## Handoff and rollback

Stop at the two-treatment selection checkpoint rather than expanding into progression. Carry the selected captures, keep/change/open decisions and unresolved defects into the later CLI-agent prompt; supply complete relevant instructions without assuming Project-source access.

Publish a coherent normal commit to the same draft only after verifying scope, current remote head, complete files and evidence. No reset, cleanup or scene overwrite is a rollback strategy. A later authorized scoped revert must retain prior art/encounter work, original assets, independent edits and dated evidence. This visual slice has no production data migration.

## Authorized retry and implementation profile — September 25, 2026

B explicitly requested “retry ST-VIS-01.” The preceding blocked status is historical. The same path was created through Desktop Commander after clean-head verification at 19:44:34 UTC; this addendum does not claim rendering or acceptance before execution.

Implementation uses a separately saved BattlefieldReview scene, opt-in review settings and the existing model/session/presentation/UI owners. Original FieldAssembly defaults and its fixture remain unchanged. The A/B uses one named review-pacing-v1 profile, identical in both environments: 20 ticks/s, 1/1000-unit distances, spawn radius 25000; cannon range 22000, launcher range 25000; close/ranged speed 50/40 per tick and stops 4800/12000. Existing weapon/repair damage and periods, tank hull, per-tick resolution order and nearest-then-ID selection remain. Arrival intervals are 56,42,32,24,20 ticks for successive eight-spawn groups (clamped at the last interval), with each four-spawn stream using a common surrounding lane and small deterministic angular separation for presentation. Hull/damage retain the legacy eight-spawn growth. Review horizon 3600 ticks is a test limit, never victory. These values are scoped comparison tuning, not selected first-tier balance.

Environment art and enemy prefabs are new assets. Decorations have no colliders or gameplay effects. Camera composition is fitted to a declared world-space approach ring and viewport, never the reverse. Treatment selection changes only environment/light/camera presentation. Inspection, manual-refit prohibition, explicit suspension/resume and non-awarding sessions remain. Readiness requires real captures and motion; selection remains B's.

Current integration receipt: `campaign-unity/docs/visual-review-01/AUTHORING-CHECKPOINT.md`. The raw-art checkpoint is not a Unity visual acceptance. Five pending C# files remain local and uncommitted after the vehicle-presentation append was blocked; the published art/scope checkpoint does not include them.
