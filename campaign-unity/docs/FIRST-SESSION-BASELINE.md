# First-session baseline

Observed October 21, 2026 on the pre-polish runtime with the reviewed Vite repair.
This is a scripted functional browser observation, not a human comprehension,
listening, or visual acceptance result. The owner approved sprint execution;
the separate choice of combat visual treatment remains open.

## Reproducible journey

Both Repair and Launcher passed in fresh, isolated Chromium contexts at normal
simulation speed. Inputs used the rendered controls; no progression was seeded.
Each journey reached a Tier 1 defeat, reloaded its pending result, manually
claimed one Salvage, bought Cannon Attack level 1, reloaded, and redeployed on
Tier 1 with cannon damage 30 instead of 20. Tier 2 then remained selectable and
deployable. Reloading either unfinished upgraded run preserved the stored record
without a reward. Pause stopped progression during the temporary shop capture.

Garage, combat and saved-result captures cover 1920x1080, 1366x768, 720x640,
390x844 and 844x390. All shop categories and later combat were inspected.
The harness checks runtime/wrapper parity against local source manifests and
refuses input drift. This does not qualify native audio or all browser engines.

Evidence: [derived result summary and source identities](../Evidence/first-session-polish/both-fittings-basepath-20261021/summary.json),
[Repair Utility shop](../Evidence/first-session-polish/both-fittings-basepath-20261021/repair/permanent-shop-utility.png),
[Launcher live goal](../Evidence/first-session-polish/both-fittings-basepath-20261021/launcher/goal-met-live.png).
The complete observations and 52 screenshots remain in the same local evidence
directory. The summary retains their raw observation hashes and selected states;
it does not replace or manufacture their underlying evidence.

```powershell
$env:VITE_BASE='/singedTerra/'
npm -w @singedterra/client run preview -- --host 127.0.0.1 --port 4173 --strictPort
# In a second terminal; use a fresh output directory for each run:
node scripts/last-stand-first-session.mjs campaign-unity/Evidence/first-session-polish/both-fittings-basepath-20261021
```

## Three selected clarity observations

1. **Intervals expose internal ticks.** The Utility cards say "20 ticks between
   cannon shots to 19 ticks" and "3 hull per 20 ticks". They give no real-time
   meaning. Express these same catalog effects in seconds, preserving current
   and next values, caps, and fitting restrictions.
2. **Purchase lifetime is implicit.** Headers show only `SCRAP` or `SALVAGE`.
   The temporary cards mention permanent and this-run levels, but the currency
   heading does not explain whether a purchase survives the run. Add concise
   lifetime context to the existing shop owner; retain actual balance and save
   failure behavior.
3. **Live goal success omits the save boundary.** At 60 seconds the banner says
   `GOAL MET: TIER 1` while the run is still active. Saved results correctly show
   the later tier unlock. Clarify the live banner without announcing an unlock
   or a saved best before persistence succeeds.

These are observed interface properties and an engineering clarity assessment;
they do not establish that a person was confused. The proposed tuning experiment
remains in [FIRST-SESSION-TUNING.md](FIRST-SESSION-TUNING.md), with no balance
change. Existing art, camera, materials and combat effects remain unchanged
while the owner's visual-direction choice is open. No combat defect or visual
acceptance is inferred from still images.

## Preserved failed attempts

- `baseline-tier-20261021`: preview omitted the required `/singedTerra/` base;
  the corrected `baseline-tier-basepath-20261021` tier test passed.
- The older shop runner refused its historical runtime binding before opening
  a browser. Its `shop-repair-2026-10-21T05-37-41-081Z-c6cea269/result.json`
  remains under `Evidence/last-stand-playable-loop/t06/first-session-baseline-20261021`.
  Historical expected hashes were not rewritten.
- `both-fittings-20261021`: the preview server lacked `VITE_BASE`, so the
  served-byte parity check refused the journey. Restarting the owned server
  with the correct base produced the passing fresh output linked above.

These setup failures are retained separately from the successful observations.
Post-change export, browser qualification, independent review, hosted CI and
publication require their own evidence. See [the candidate validation record](FIRST-SESSION-VALIDATION.md)
for subsequent results; this baseline keeps its original source identities.
