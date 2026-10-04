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

The current `BattlefieldReview` scene offers two matched treatments. The owner
still needs to choose what to keep, change or mix and review actual normal-speed
motion. That acceptance applies to the viewed elements, not to gameplay balance
or upgrade design. The review profile is a bounded comparison fixture, not the
selected first-tier economy or difficulty curve. See the
[gallery and review notes](visual-review-01/browser-20260926T093232Z/REVIEW.md).

## What exists now

`EncounterModel` and `EncounterSession` provide a deterministic, non-awarding
automatic encounter with two bounded profiles. The model has automatic cannon
fire, an independent launcher or repair fitting, close and ranged enemies,
eventual defeat and a test horizon. The scene and tests support visual review.
The pure [track model](../Unity/Assets/Scripts/MechanicsShopModel.cs) is implemented
and covered by [five focused tests](../Tools/last_stand_shop/test_shop.py).
The [approved spec](../../.codearbiter/specs/last-stand-upgrade-foundation.html)
and [plan](../../.codearbiter/plans/last-stand-upgrade-foundation.html) record its
bounded scope and authoritative completion status. The owner approved this
independent preparation as pair PJ3M; that approval does not accept the initial
battle or authorize a playable shop. There is no playable Mechanics Shop, stat or
encounter integration, reward payout, currency, save system, persistent upgrade,
or first-upgrade loop in this Unity path.

## Next bounded work

1. Complete the owner A/B choice and normal-speed visual acceptance for the
   initial battlefield. Preserve the chosen elements and unresolved changes.
2. Define and implement the first playable retained upgrade and second-run
   effect after the visual checkpoint. This needs selected track effects,
   prices, caps, earning and claim rules, and run/save authority. No example
   value in the source pack supplies those decisions.
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
