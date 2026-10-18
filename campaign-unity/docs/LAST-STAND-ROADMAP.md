# Last Stand direction and next slices

This page keeps the Unity campaign direction visible in the repository. It is a
product reference, not an execution ledger or approval to expand the current PR.
The primary owner decisions are in `sources/01-PRODUCT-DIRECTION.md` revision 15
and `sources/04-DECISIONS-AND-OPEN-QUESTIONS.md` in the September 25, 2026 source
pack `singedTerra-visual-polish-source-update-2026-09-25.zip` (SHA-256
`ea7bfac6d5b089e18580741bc701afbf6d73323ccdff4e7247c639c1628e40f1`).
The current in-repo visual scope is
[ST-VIS-01](../../.codearbiter/specs/unity-battlefield-visual-review.md).

## Current approved slice — Tier Goals and Personal Bests

On October 17, 2026 the owner approved the
[tier progression specification](../../.codearbiter/specs/last-stand-tier-progression.html).
The [matching plan](../../.codearbiter/plans/last-stand-tier-progression.html)
tracks implementation and actual checks. This approval selects the provisional
60-second Tier 1 goal, 90-second Tier 2 goal, and Tier 2 enemy hull scaling of
`ceil(base * 5/4)`. A qualifying saved terminal Tier 1 result unlocks Tier 2;
reaching the goal during live combat does not end or save the run.

Each tier keeps independent best survival and disabled-count records under
`tier-goals-v1`. Save version 3 preserves v1/v2 wallets, six permanent tracks,
run counters and pending rewards, without inventing old tier history. Ordinary
defeat still requires manual Claim for one Salvage. The existing 180-second
safety limit saves eligible progress, pays zero, and requires Continue before
another deployment. Interrupted runs grant no records, unlock or award.

Production-model calibration at the existing caps supports these provisional
goals. These measurements apply every applicable track at the stated level;
they are numerical build comparisons, not evidence that a player earned them.

| Fitting / track levels | Tier 1 survival | Tier 2 survival |
| --- | ---: | ---: |
| Repair / starter (0) | 77.85s | 70.55s |
| Launcher / starter (0) | 82.35s | 79.35s |
| Repair / permanent cap (3) | 98.85s | 98.85s |
| Launcher / permanent cap (3) | 112.35s | 98.85s |
| Repair / total cap (8) | 175.35s | 161.85s |
| Launcher / total cap (8) | 180s safety limit | 175.35s |

At repair level 3, equal survival still yields fewer disables on Tier 2
(47 versus 49). All six matched builds show lower survival or fewer disables.
The new save/model/controller tests and existing garage, battle, outcome and
keyboard/touch checks passed locally. The matching Unity Web export passed its
source/toolchain before-and-after checks. A fresh current-source compilation
also matched all eight retained Tier 1 fitting/damage baselines.

The normal-speed browser journey passed with a fresh, unseeded local save:
goal acknowledgement, saved defeat/unlock, pending-result reload, manual Claim,
an earned permanent upgrade, Tier 2 selection/deploy, unfinished Tier 2 reload,
and Return to Campaigns. Garage, combat and saved-result geometry were checked
at all five approved viewport sizes. Evidence is retained under
`campaign-unity/Evidence/last-stand-tier-progression/browser-pass-20261017T230100Z/`.
The independent contract review has no outstanding findings. These are local
implementation checks; exact-head hosted CI, merge and publication are separate.
Art, motion, sound and phone acceptance remain separate.

The same fresh browser journey also passed after integrating the Pages fixture
repair from PR #539. Its 15 profile observations and error-free result are in
`campaign-unity/Evidence/last-stand-tier-progression/browser-pages-integration-3ee9f5c/`.
The 215 affected helper/qualification guards passed across the focused run and
its Windows line-ending recheck; both attempts remain in the evidence. PR #539
contains the separate Pages repair and required CI invocation. Its hosted checks
do not qualify this tier implementation.

The dated T-06 RED handoffs below describe earlier revisions. PR #524 delivered
the later qualified loop and PR #538 repaired the Linux Pages qualification
profile. Neither historical result substitutes for checking this new slice.

## Experience and order

Last Stand is a stationary, automatic defense run. The tank fights enemies
approaching from around it; ordinary runs end in defeat, while tier goals support
long-term progress. The owner wants a coherent, visually polished initial battle
before the first playable upgrade loop (DIR-017, DIR-024, DIR-059). Readable
approaches, movement, contact with the ground, firing, impacts, destruction,
lighting, materials and a compact interface must work together. A full final
roster or final balance is not required at this checkpoint.

Builds should support months or years of continuity, with viable defense,
hybrid and high-damage paths (DIR-009, DIR-010). A useful farming tier may be
lower than the highest unlocked push tier; exact tier goals and income remain
open (DIR-018). Short check-ins, long unattended open-game sessions and capped
away resources based on a best run are intended. Away rates, caps and interrupted
run behavior remain open (DIR-011, DIR-012).

The browser proof of concept and later mobile game use the same Unity project
and assets. Android build and phone setup follow the browser proof of concept.
The older TypeScript artillery game remains a separate product path.

The site now presents Last Stand under Campaigns. Its native link opens the
packaged Unity Web export on the same origin, and the export returns to the
Last Stand campaign entry. The first playable loop keeps its own local save;
Ash Road progress, account rewards and verified play are separate. This entry
does not settle the pending visual, motion or sound acceptance.

The current `BattlefieldReview` scene offers two matched treatments. The owner
still needs to choose what to keep, change or mix and review actual normal-speed
motion. That acceptance applies to the viewed elements, not to gameplay balance
or upgrade design. The review profile is a bounded comparison fixture, not the
selected first-tier economy or difficulty curve. See the
[gallery and review notes](visual-review-01/browser-20260926T093232Z/REVIEW.md).

## Dedicated local loop implemented

The approved [playable-loop spec](../../.codearbiter/specs/last-stand-playable-loop.html)
and [plan](../../.codearbiter/plans/last-stand-playable-loop.html) scope one
separate `LastStandPrototype` scene. Its provisional `playable-prototype-v1`
profile copies review pacing. An ordinary defeat stages one salvage; the player
claims it, buys a permanent Cannon Attack level, and redeploys. Levels 0..3
deal 20/30/40/50 cannon damage and cost 1/2/3 salvage to advance. The first
30 HP foe therefore survives a base cannon hit with 10 HP but dies to the
first upgraded hit. These values are reversible prototype tuning.

Progression uses one versioned local browser save on the same origin and is
single-tab only. It does not supply account authority, cross-origin sync or
multi-tab atomicity. The separate `BattlefieldReview` scene remains a
non-awarding art comparison. Current implementation results are recorded in
[the loop validation note](last-stand-playable-loop-validation.md), which keeps
owner sound and whole-feature acceptance pending until observed.

The bounded T-06 follow-up adds one maintained production-browser journey shared
by Playwright and the historical Python entry. Ordinary CI selection passes its
five focused policy checks, but the real journey currently fails: Unity captures
Tab and Shift+Tab after readiness, preventing keyboard access to native Return.
The later progression, storage-fault, audio and movie assertions have therefore
not executed in this new journey. See the current RED handoff in the validation
note. Existing historical browser results remain evidence of their original
revisions. A wrapper repair, independent fresh verification and native review
remain outstanding; owner A/B, motion, listening and whole-feature acceptance
remain pending.

## What exists now

`EncounterModel` and `EncounterSession` provide a deterministic automatic
encounter. Field and review modes remain non-awarding; the dedicated playable
profile connects ordinary defeat to the local progression controller. The model has automatic cannon
fire, an independent launcher or repair fitting, close and ranged enemies,
eventual defeat and a test horizon. The scene and tests support visual review.
The pure [track model](../Unity/Assets/Scripts/MechanicsShopModel.cs) is implemented
and covered by [five focused tests](../Tools/last_stand_shop/test_shop.py).
The [approved spec](../../.codearbiter/specs/last-stand-upgrade-foundation.html)
and [plan](../../.codearbiter/plans/last-stand-upgrade-foundation.html) record its
bounded scope and authoritative completion status. The owner approved this
independent preparation as pair PJ3M. That foundation does not implement the
temporary in-run Mechanics Shop interface. The later NU2Z approval covers the
separate permanent Cannon Attack loop described above: reward, wallet, saved
upgrade and its actual effect on the next encounter. Neither approval records
owner acceptance of the initial battlefield.

## Next bounded work

T-06 corrective handoff (2026-10-05 local): the shared production journey remains
RED. Both exact Playwright/Python entrypoints still fail native Tab after genuine
Unity readiness, and both retain a healthy UnityCache Cache.put NetworkError
already present in the eighth trial and root's first independent exact run.
Its cause is unresolved / NEEDS-TRIAGE; no error assertion was weakened. Wide/standard/compact
Campaigns first/primary placement and native keyboard Launch are observed; the
existing compatible Ash Road record is unchanged through real Last Stand launch.
Native Return/actual Ash Road resume, no-award exit, progression, complete Unity
viewport matrix, storage recovery and audio/motion remain MISSING downstream.

Scoped harness corrections now enforce the deny proxy before native Chrome
startup, bounded origin/base/redirect-safe preflight, origin-first narrow fixtures
and exact expected-error classification. The Node suite reports 21/21 normally
and 24/24 with its three explicitly enabled real transport/lifecycle probes;
fourteen named guard mutants fail after a copied-layout GREEN baseline. Observed
Windows CDP-admission failure, Python-timeout browser cleanup and child/grandchild
listener timeout remove their recorded owned processes/profiles. Forced
Playwright-worker/signal/spawn-race and Linux branches remain unmeasured. The
existing candidate general selection retains the desktop journey; other projects
skip its execution, and candidate workflow/config/byte gates remain preserved.
No hosted candidate or CI pass is claimed. The independent numeric H-03 supplement
is advisory for this test-support-only change; client 60% line/branch policy and
the required meaningful behavioral evidence remain intact.

See the appended current correction section in
[playable-loop validation](last-stand-playable-loop-validation.md) for exact raw
outputs, unique evidence, preserved diagnostic failures and current limitations.
Root owns the wrapper recovery and fresh verification/reviews; this T-06 handoff
confers no native completion or owner acceptance.

1. Complete the owner A/B choice and normal-speed visual acceptance for the
   initial battlefield. Preserve the chosen elements and unresolved changes.
2. Review the implemented defeat-to-upgrade loop, its normal-speed motion and
   sound, and then tune the approved prototype from that feedback. The bounded
   first-upgrade effect is implemented and browser-verified; owner acceptance
   and live-player feedback remain pending. Future prices, caps and economy
   expansion need their own decisions.
3. Expand equipment, Skills, R&D, targeting and longer progression in later
   scoped slices using their distinct owner decisions. The first shop model does
   not collapse those systems into one level or currency. Permanent R&D
   investment is a working preference; its content and timing remain open.

For a capped Mechanics Shop track, the selected simple rule is `level =
min(M, P+n)` and `next in-run price = C(n+1)`: `P` is the permanent starting
level, `n` counts purchases in this run, and `M` is the track cap. A new run
starts at `P` with `n=0`; resuming an existing run keeps its `n`. Permanent
levels use a different run-earned resource from temporary in-run purchases.
Attack, defense and utility tracks are intended, with both tank-wide and
attachment-specific improvements, but their exact catalog and effects remain
open (DIR-044, Q-019). `M=200` and X/Y prices were examples, not tuning.

Equipment-slot investment belongs to the compatible slot, while item rarity
and substats belong to an individual module (DIR-045, DIR-046). Skills retain
their separate collection, slots and duplicate-based development (DIR-033 to
DIR-040). These boundaries matter when the later playable economy is designed.

## Current continuation, 2026-10-07

The earlier native-Tab failure notes above are historical. The current unchanged
player journey now exercises native Return/Ash Road resume, unfinished-run
exit/reload without reward, the viewport matrix, defeat/pending reload/one Claim
and the first permanent purchase. It remains RED at purchase audio: the current
focused document has a healthy observer but no capture or samples for that cue.
Its runtime cause remains unproven; later reload/redeploy and storage/load fault
checks have not executed. The bounded diagnostic/persistence helper repair is
independently qualified (37 maintained tests, 13 semantic mutations and 13
persistence combinations); it does not qualify the full loop. Exact evidence
and limits are appended to [the validation note](last-stand-playable-loop-validation.md).

The local preview is available at `http://127.0.0.1:5198/singedTerra/last-stand/`.
The user requested a real in-game UI and delegated choosing the best generated
idea. Candidate A, Field Console, is selected in the separate
[UI draft spec](../../.codearbiter/specs/last-stand-game-ui.html): compact live
combat instruments, a clear garage primary action and coherent defeat/workshop/
recovery screens. Native approval and implementation are pending. This selection
does not settle the existing battlefield A/B, motion, listening or whole-loop
acceptance gates.

### UI draft amendment: background play, 2026-10-07

The owner also requested continued play when the game is not the focused window.
The same unapproved UI spec is now revision 4, with dedicated Last Stand
background continuation criteria AC-09 through AC-11. They cover elapsed-time
accounting across blur/hidden-tab throttling, bounded deterministic catch-up,
explicit Pause, background defeat/settling and manual exactly-once Claim,
foreground feedback without replay bursts, and shared legacy/review isolation.
The proposal covers an active run while its page remains loaded. Browsers can
defer callbacks; returning to that same page reconciles elapsed active time.

The obsolete revision-3 approval request was cancelled before the amendment.
Native ready validation passes for revision 4; approval, its matching plan and
implementation remain pending. No runtime focus/audio/timing change or Unity
rebuild has been made for this amendment. The existing localhost runtime remains
available, and the failed full-loop audio evidence above remains historical
evidence with its original outcome.

### UI/background specification approved, 2026-10-07

The host genuinely captured `approve C87B` for ST-LS-UI-SPEC. Its current
revision 5 has verified native approval and the unchanged revision-4 normative
digest `64bb97154ea7fdc8f5f3872663b995d270cd6f0a2bdb7f7fd87c6fdd6b14d958`.
The matching [implementation plan](../../.codearbiter/plans/last-stand-game-ui.html)
is revision 3, bound to that approved spec, with 12 tasks covering all 11
criteria in one local-preview checkpoint. Native ready validation and admission
of its 13 declared verification commands pass. These are plan/admission results;
the proposed implementation checks have not run and runtime code is unchanged.
Plan approval remains the next required execution gate. Historical diagnostic
failures, prior receipts and pending owner acceptance remain preserved.

### Matching Field Console review preview, 2026-10-08

The earlier draft/approval and runtime notes above retain their historical
outcomes. The approved UI/background work now has a genuine source-bound export
`Web-20261008T143017Z-1ca66b` and a matching local review copy at
[Last Stand](http://127.0.0.1:5198/singedTerra/last-stand/). Native Return's
[Campaigns parent app](http://127.0.0.1:5198/singedTerra/#campaigns/last-stand)
and its emitted assets are also verified through loopback. The existing owned
post-reboot listener remains running; the previous complete copy is preserved
for rollback. Delivery checks do not change player saves.

At the provisional delivery observation, **2026-10-08 16:37 UTC**, T-11 is still
PENDING. Current matched phase/profile screenshots, normal-speed movies,
rendered-audio and maintained full-loop results remain pending. The historical
purchase-audio RED is preserved under its original source identity; it is not
silently attributed to the new export or relabelled as a pass. Overall playable
loop readiness, current all-task verification and owner UI/battlefield
keep/change/mix, motion, listening and whole-feature acceptance remain pending.
See [the review packet](last-stand-ui/preview-review.md) for exact provenance,
body/MIME hashes, listener identity, rollback, measured/unmeasured fields and
the current evidence matrix. A local unfinished test drive is available; it
does not grant checkpoint acceptance or publication authority.


### Visible console revision provisional preview, 2026-10-08

The user-requested worn metal/brass console refinement is now served from source-bound `Web-20261008T211101Z-4edf12` at [Last Stand](http://127.0.0.1:5198/singedTerra/last-stand/). All four unchanged T10 checks pass after genuine stale-package RED; actual Unity export, frozen-plan package, source/runtime validators, strict typecheck and production build pass. The existing PID13656 listener is unchanged, and its previous182-leaf served copy is recoverable at `C:\Users\brenn\codearbiter-review-integration-20261006\localhost-preview-20261007T1054\dist-visible-file-prior-20261008T211101Z-4edf12`. No player saves or tabs were touched.

The prior genuine T11 trial remains failed before player input, with raw result `40ac97ac36b8e0d1914956fb039bfb75830edecd8a300eac33722e6515030d97` preserved. Current qualification for this new runtime is pending; the historical notes above retain their original timestamps and outcomes. Overall playable-loop readiness remains blocked. Current matched phase/profile images, normal-speed movies, actual rendered listening, independent/native/current all-task proof and owner keep/change/mix acceptance remain pending. The current [review packet](last-stand-ui/preview-review.md) binds exact export/package/HTTP/process evidence and distinguishes that failed history from this new pending qualification. Local review availability grants no whole-feature acceptance or publication authority.


### Parent public-configuration recovery, 2026-10-08

The visible console export `Web-20261008T211101Z-4edf12` and all18 packaged leaves remain unchanged. The latest genuine T11 trial passed64 public preconditions/route checks, then failed at rejoin-before-ST1 after the parent initializer reported `supabaseUrl is required`; Unity never launched. That failed trial and all earlier failures retain their original outcomes.

One normal parent npm build now passes with the original gates and only the existing public configuration in its child environment (source129 bytes, SHA-256 `0316f1bb40795e7313bc2ba1c779d1bea4d1b74437046abfb622ff0663c50c44`; values unprinted) plus `/singedTerra/` base. Parent index `d8d8dd721b06103efe57d57b32e939cbb2d9e832d6e1288ba3671b39b6658ab8` and complete graph `6087017ba144ed28e749c913213f20dcd93df3f96efc66732226517244c3e44c` are bound in the [current review packet](last-stand-ui/preview-review.md). The explicit four-entry recovery passed176 required HTTP/body/MIME checks; the236-leaf served union, exact190/236 predecessor backups and earlier182/91 copies are preserved, with the PID13656 listener unchanged. The first suffixless-metadata enumeration failure and rollback are retained. No Unity/build/test repeat, app/test/helper edit, backend contact, `.env` write, save/tab/storage change or publication occurred.

Subsequent corrected-parent full-loop qualification, current matched phase/profile media, normal-speed movies, rendered listening, numeric coverage, independent/native/current all-task evidence and owner UI/battlefield/motion/listening/whole-feature decisions remain pending. Overall playable-loop readiness remains blocked; local delivery grants no native completion or acceptance.


### Material-refined provisional delivery, 2026-10-08

Current material export `Web-20261009T031011Z-27b4b6` is genuinely bound to approved UI SPEC5/PLAN30, exact3304 Unity source inputs, portable/raw closure, pinned Unity6000.3.24f1/WebGL/URP17.3.0 and full before/after toolchain. The original legacy LOOP exporter metadata keys are preserved separately; they confer no new-scope authorization. The unchanged T10 four-case suite rejected stale package first and then passed. Fresh original source/runtime validators, typecheck and normal parent production build passed against actual current714 inputs.

The matching provisional preview uses the existing public config only in its build child environment. Its actual parent graph and both runtime aliases passed138 HTTP/body/MIME checks, with exact236-leaf predecessor copy, all prior backups and obsolete runtime URLs retained; listener13656 and its exact parent/creation/command stay unchanged. See [current review packet](last-stand-ui/preview-review.md) for source/export/package/process/HTTP binding and finite atomic rollback.

Previous actual T11/driver failures remain preserved. Current material rendered comparison, native background and whole-loop qualification, matched phase/profile images, normal-speed movies, rendered audio, independent/native/current all-task proof and owner UI/battlefield/motion/listening/whole-feature decisions remain pending. Numeric C# coverage is unmeasured. Overall playable-loop readiness remains blocked; the two actual T12 delivery cases can pass while exact review-media remains RED. No lifecycle or owner acceptance follows preview availability.


### Reference-console provisional delivery, 2026-10-09

The current material revision is exported as `Web-20261009T143803Z-532a81` from exact3304 raw/portable Unity source inputs with Unity6000.3.24f1/WebGL/URP17.3.0 and full before/after toolchain closure. Approved UI SPEC5/PLAN30 is explicitly bound separately from unchanged legacy LOOP metadata. The original T10 four cases rejected the stale package and passed after real export/package/current714 validators/typecheck/production build.

The owned preview now serves matching bytes through both aliases and the closed parent graph, with 146 actual HTTP/body/MIME checks. All244 predecessor leaves, the236 older backup and every prior copy/obsolete runtime URL remain recoverable; listener13656 and exact parent/start/command remain unchanged. See [current preview review](last-stand-ui/preview-review.md).

T09's native snapshot timeout and prior T11 failures remain intact. Full-loop/native qualification, full matched25 phase/profile images, normal-speed movies/listening, numeric C# coverage and all owner decisions remain pending. Overall playable-loop readiness remains blocked. This provisional availability confers no lifecycle or acceptance authority.
