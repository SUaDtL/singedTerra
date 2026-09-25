# ST-ART-01 - Unity Web starter tank and clearing

## Authority and task boundary

B selected Unity, clarified that the browser PoC and later mobile development use
the same Unity project/assets, deferred Android until after the full browser PoC,
and explicitly dispatched this art slice on the connected workstation. B subsequently
authorized preserving larger slices in an unmerged PR. This draft is that checkpoint,
not execution of the earlier Android-first UF-01 proposal or the recovery-v2 backlog.

## Approved slice

Editable starter tank, scorched clearing, reusable Unity prefabs, inspection and
battlefield views, two physically different optional-fitting demonstrations, limited
turret/recoil motion, and a Unity Web build. First-pass art remains revisable.
Repair/launcher names and the 0.32-world-unit recoil are presentation samples,
not a weapon catalogue, damage model, equipment allowance, or manual campaign fire.

## Write boundary

`campaign-unity/**` and this scope document only. Existing `client/`, `shared/`,
`supabase/`, npm dependencies, release workflows, accepted ADRs and existing plan
ledgers are unchanged. The Unity project is not linked into the live Vite build.
No engine duplication for classic artillery, changes to deterministic replay,
account/seat authority, retained receipts, saves, or reward evidence are authorized.
No enemies, combat, gacha, Mechanics Shop, Skills, R&D, persistence, ads or commerce.
No Android modules/builds, phone/emulator setup, merge, release, public hosting or
production operations. A draft PR is source preservation, not release approval.

## Verification and preservation

Compile/export using the pinned Unity 6000.3.24f1 and URP 17.3.0 checkpoint.
Use real browser pointer controls for fittings, camera views, idle pause/resume,
resizing, and five recoil cycles. Measure recoil in world coordinates and confirm
return to rest. The current diagnostic checks use a 0.30..0.321 peak range and
<=0.0001 return error; these bounds detect the former approximately 32-unit defect.
Inspect browser captures separately from marker/state assertions. A successful
export or passing control check is not B's final-art approval or mobile proof.
Keep the original failed browser run and its seven observed recoil records dated.

The review snapshot preserves the saved original authoring assets/settings and
adds only the reviewed recoil correction plus safer build tooling. The original
stterra editor is still open with unsaved changes: they are not in this commit.
Do not close it, regenerate its scene or overwrite it from a build copy. Reconcile
those edits deliberately before declaring the PR a complete authoring backup.

Normal export opens the saved scene and must not change its bytes. The bootstrap
Prepare command refuses to replace an existing scene. Vendor package restoration
is project-local and same-version; no installed cache or security control is patched.

## Rollback and continuation

This additive, non-integrated subtree has no live data or deployment effects.
Keep the draft unmerged; preserve old art/builds and recoverable source snapshots.
Subsequent commits to this PR may complete the same approved slice after re-reading
its live head. Another gameplay layer needs its own bounded specification/approval.
Evidence belongs in the PR and campaign-unity validation receipt, not a competing
recovery ledger. Required existing repository CI remains separate from Unity checks.

## Inspection follow-on - 2026-09-25

B requested the next slice on the same PR. This bounded continuation improves
inspection of the existing art; it does not dispatch a combat or economy layer.
Implementation choices below are reversible art-interface choices, not permanent
loadout rules or acceptance of the complete equipment-screen concept.

- Start inspection from the cannon-facing three-quarter side, not behind the tank.
- Provide left/right camera orbit steps and a front-view reset. Rotate the camera,
  never the tank, turret aim, or a gameplay target. Keep one camera owner.
- Add three compact, non-interactive callouts for the actual cannon, hull, and
  currently visible fitting. Project their endpoints from the real mesh bounds;
  retarget the fitting label/endpoint after a swap. No item statistics or prices.
- Allow callouts to be hidden. Hide inspection controls and callouts in battlefield
  view; returning preserves the inspection orientation and callout preference.
- Retain existing fitting, camera, motion and scale-aware recoil behavior.
- Do not change meshes, textures, materials, the saved scene, build pins, classic
  code, Android setup, external services or original open authoring work.

Acceptance: export the saved scene without changing its bytes; retain the existing
15-check browser suite; add pointer tests for orbit/reset, full-circle wrap, hidden
callouts, fitting retargeting, view return and resize. Inspect actual browser frames.
Measure live callout endpoints against projected world anchors and require panels
inside the tested landscape canvas. Record failures, source/build identity and
remaining art/accessibility/device gaps. No whole-game acceptance is inferred.

Keep this work on draft PR #524, with normal non-force commits and no merge.
Rollback is a scoped revert of this follow-on's runtime/UI/test files; preserve the
prior art snapshot, corrected recoil and all dated evidence. No data migration.
