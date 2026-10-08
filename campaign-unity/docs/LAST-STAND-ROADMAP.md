# Last Stand direction and next slices

This page keeps the Unity campaign direction visible in the repository. It is a
product reference, not an execution ledger or approval to expand the current PR.
The primary owner decisions are in `sources/01-PRODUCT-DIRECTION.md` revision 15
and `sources/04-DECISIONS-AND-OPEN-QUESTIONS.md` in the September 25, 2026 source
pack `singedTerra-visual-polish-source-update-2026-09-25.zip` (SHA-256
`ea7bfac6d5b089e18580741bc701afbf6d73323ccdff4e7247c639c1628e40f1`).
The current in-repo visual scope is
[ST-VIS-01](../../.codearbiter/specs/unity-battlefield-visual-review.md).

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
