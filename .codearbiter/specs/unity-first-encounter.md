# ST-ENC-01 - First non-awarding Unity Web encounter

## Dispatch and boundaries

B requested "next slice same pr" after the proposed small automatic encounter.
This is that bounded continuation on draft #524, starting at
`d87e261b11878ce7e6678fff4925535e1ffb86f0`. The rules below are explicit,
reversible encounter-fixture choices, not adopted production balance or a claim
that the old engine-spike oracle defines campaign gameplay. Define this contract
before coding. Keep the initial art and its evidence recoverable.

Write only `campaign-unity/**`, this spec, and the art spec's cross-reference.
No classic/client/shared/backend changes, rewards, currencies, saves, IAP, ads,
gacha, shop, Skills, R&D, targeting unlocks, Android, dependencies, merge or deploy.
One cannon and repair/launcher samples are not a launch catalogue or slot count.
No persistent preview server is started; temporary test servers close on exit.
Original stterra files are not overwritten. No Unity process was present at this
preflight; all 85 original SAVED files still matched. Prior unsaved-state fate is
unknown, not retrospectively certified as saved by observing the editor closed.

## Player flow

Inspection stays available. Deploy captures the visible repair/launcher fitting,
switches to the battlefield camera, and starts a stationary automatic defense.
A close attacker and a ranged attacker approach from eight surrounding lanes.
Cannon fire is automatic; the launcher operates independently, or the repair unit
restores hull automatically. No manual aim, direct target selection or driving.
Fitting/inspection/recoil-preview controls are unavailable during the encounter.
Pause, reduced decorative effects, and an explicit return to inspection remain.
Defeat is terminal; returning discards this non-awarding session. Redeploy starts
fresh. No victory, tier unlock, retained payout, or ordinary progression is added.

## Fixture v1: units, time and exact order

Pure C# owns small integer hit points, distances in 1/1000 world units, IDs and
20 fixed ticks/second. No Unity time, physics, transforms, RNG or storage enters
the model. This bounded representation is NOT the months-to-years number policy.
Tank starts at 120 hull. Spawn one foe initially and every 16 ticks while a free
fixture slot exists, with at most 32 active foes. A full pool delays admission,
not damage or existing enemies. This is a fixture work bound, not a production cap.
Every third foe is ranged; lanes cycle by (spawn index * 3) modulo 8. At spawn
index k, group=floor(k/8), hull=30+10*group, hit damage=4+2*group, distance=16000.
Close foes move 110 distance units/tick to 3400, attacking every 20 ticks there.
Ranged foes move 70 units/tick to 10000, attacking every 30 ticks there.
Main gun: 20 damage, range 14000, period 20 ticks. Launcher: 12 damage, range
18000, period 30 ticks. Each independently selects nearest valid foe, lowest ID
on ties. Ready weapons hold readiness without a target; cooldown starts on fire.
Repair restores 3 hull every 20 ticks, clamped to maximum; no overheal bank.
Order each tick: spawn, movement, main shot, optional launcher/repair, surviving
foe attacks in fixture-slot order, terminal check. Hits resolve immediately;
tracers are decoration, not flight-time or accuracy calculations. Dead foes cannot
attack; once tank hull is zero later attacks stop. No criticals/status/area rules.
120 simulated seconds is a safety horizon, labeled LIMIT rather than victory.
Terminal Step calls do nothing. No serialization or cross-platform replay claim.

The session owns clock admission. Foreground deltas accumulate into whole ticks;
at most eight ticks are processed per frame. A delta or backlog over 0.5 seconds
suspends for explicit resume, rather than unlimited catch-up or silent rewards.
User pause, lost focus/app pause, terminal status and technical failure are distinct.
Resume discards paused wall time. Reload loses only this unpaid test session.
No production away income, research clocks or durable run recovery is implied.

## Owners and acceptance

EncounterModel owns combat; EncounterSession alone advances/replaces it.
TankPresentation remains sole owner of tank pose, recoil and camera, accepting
presentation-only requests from the session. ArtHud retains its Canvas/EventSystem;
the encounter HUD uses that Canvas, not a parallel input owner. EncounterView owns
bounded enemy/tracer objects, never hit outcomes. Reduced effects cannot alter
model ticks, targets or damage. Keep existing editable assets and saved scene bytes.
Opponent models are explicitly new diagnostic geometry, not final approved art.

Before export, execute C# fixture tests for spawn/movement, cadence, independent
systems, repair bounds, ordering, deterministic repeats, defeat and terminal no-op.
Build Web from the saved scene without regeneration. Run the existing 15-check
art regression and rebind inspection verification to the NEW build receipt without
changing old evidence or tolerances. Test ordinary pointer deployment, no mid-run
refit/manual fire, pause/resume, actual focus interruption, defeat/return, repeated
sessions, viewport resize and full/reduced outcome parity. Inspect actual frames.
Capture runtime counts, actual result and warnings; do not manufacture a pass.
Record any shader diagnostics separately from JavaScript/network failures.

Retain all failures and old receipts. Final art, mobile, performance, long-term
numbers, durable progression and complete lifecycle acceptance remain outside scope.
Rollback is a scoped revert of encounter additions and their art adapters/spec
cross-reference, preserving the initial assets, earlier tests and other work.
This is not permission to reset a checkout, delete saves or merge the draft.
