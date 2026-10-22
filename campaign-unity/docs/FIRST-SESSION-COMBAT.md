# First-session combat feedback

The owner selected Option 1 on October 21, 2026: keep the existing art and
camera, improve combat feedback and readability, and continue in PR #541.
That choice sets the implementation direction. It does not claim acceptance of
the finished visuals, motion or sound.

## Selected corrections

The presentation previously checked a target's final state when displaying each
shot. A nonlethal cannon hit followed by a lethal launcher hit in the same model
step could therefore display destruction for the cannon. Destruction now uses
the outcome stored on that particular event. Damage, targeting and event order
remain owned by the unchanged model.

Reduced effects previously hid tracers, dust and scorch while retaining muzzle
and vehicle flashes. Reduced mode now keeps compact impact and destruction cues,
suppresses those extra flashes, and immediately clears existing transients when
the setting changes, including while paused. Cannon aim and recoil remain.

The dedicated playable HUD had no control for the existing effects setting.
The added Full/Reduced action uses the existing session setting and HUD input
owners. It works while paused and refuses catch-up or failed session states.
Its compact four-control row preserves the current 44px target size and 25%
battlefield-chrome limit, including the smaller Canvas inside the phone wrapper.
The in-battle shop label is shortened to `SHOP`; the garage label is unchanged.

## Evidence boundaries

The actual imported-scene regression reproduced four presentation failures
before the fix. All five cases then passed, including both fittings, event-time
destruction, compact reduced cues, paused clearing, aim/recoil, mode restoration
and model/pool preservation. The existing terminal-shot lifecycle check also
passed for both fittings. The final combined source passed the five cases again
with the saved scene and ProjectSettings unchanged. These are Editor checks,
not native browser or human acceptance.

The actual HUD checks cover mouse/touch raycasts, keyboard navigation and
activation, pause/catch-up/settling, and ten Canvas profiles. An observed
short-landscape chrome failure was corrected without changing its limit.
Shop-open Full/Reduced round trips pass for both fittings across five derived
profiles while retaining model state, save bytes and write count, audio, phase,
panel visibility and scroll position. Pure layout checks and all three strict
control-inventory regressions pass. Both Python readers reproduced their stale
nine-control assumption before correction; they now require exactly ten core
and eleven shop controls. Independent source review found no blocking issue.

Before footage uses the original exported runtime at normal speed with fresh
browser storage. Both fittings have early and busy muted captures. The first
attempt stopped because the new capture script requested `Mute` instead of the
actual `ToggleMute` control; its partial evidence is retained. After test
authoring changed the source inventory, the completed before-capture was bound
to the exact earlier runtime record and export receipt. It is explicitly
historical, rather than claimed to match the edited source tree.

The candidate capture command verifies current source, exported bytes and served
bytes before interacting with the player. It records both fittings in full and
reduced modes, normal elapsed time, muted busy combat, and paused setting changes
across five viewports. It refuses changed runtime or runner inputs. All four
candidate runs passed against `Web-20261021T091010Z-594a77`, with no browser
errors. Twenty paused setting round trips retained hull, kills, currency, mute
and pause state. The fresh export and production build also passed their
source/runtime checks. The [evidence summary](../Evidence/first-session-polish/combat-feedback-summary.json)
retains the exact runtime and raw capture, video, Editor invocation and log hashes.

Selected captures show [the earlier launcher battle](../Evidence/first-session-polish/combat-before-complete-20261021/launcher-full/busy-muted.png),
[the current full-effects battle](../Evidence/first-session-polish/combat-after-20261021/launcher-full/busy-muted.png),
and [reduced effects](../Evidence/first-session-polish/combat-after-20261021/launcher-reduced/busy-muted.png).
The [phone controls](../Evidence/first-session-polish/combat-after-20261021/repair-reduced/paused-controls-390x844.png)
and [short landscape controls](../Evidence/first-session-polish/combat-after-20261021/repair-reduced/paused-controls-844x390.png)
retain readable labels and complete targets. These are normal-speed observations
of matched encounter stages, not pixel-identical frame comparisons or human
motion/listening acceptance. Full videos and raw traces remain local.

The [final both-fitting progression journey](../Evidence/first-session-polish/both-fittings-combat-20261021/summary.json)
also passed against this export, using fresh storage and ordinary controls.
It covers the live goal, manual Claim, purchase/reload, tier unlock and stronger
redeploy across the five existing viewport sizes. Both runs end with the earned
Cannon Attack level 1 retained and 30 damage on the tier-two redeploy; neither
reported browser errors.

```powershell
python campaign-unity/Tools/last_stand_ui/test_combat_feedback.py
node scripts/last-stand-combat-feedback.mjs <fresh-evidence-directory>
```

Art assets, scenes, camera framing, simulation, economy and saves are outside
this change. Windows native player qualification, human visual/motion/listening
acceptance, current-head hosted CI, merge and deployment remain separate.
