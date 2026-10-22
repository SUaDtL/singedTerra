# First-session tuning measurements

Measured October 21, 2026 for the first-session polish sprint. The measurement
task changes no combat, economy, save, tier-goal or presentation rule. The recommendation
below is an experiment proposal, not an implemented or owner-accepted treatment.
Fresh and returning normal-speed browser journeys for **both fittings passed**;
see [the baseline](FIRST-SESSION-BASELINE.md). Both earned Cannon level 1 through
defeat, manual Claim and purchase, then reloaded and redeployed on the same tier
with damage 30 instead of 20. The browser journeys interrupted that stronger
run, so they do not independently establish its full survival time or human
comprehension. No owner decision to implement the proposed cue has been made.

## Evidence and method

[Raw measurements and source hashes](../Evidence/first-session-polish/tuning-20261021.json)
retain 16 scenarios, the measured Git head, the raw output, and raw/LF-normalized
SHA-256 identities for every compiled source and the measurement harness. The
runner compiles the actual `EncounterModel`, tier/catalog projections and
`LastStandProgression` using Mono/Roslyn from the pinned Unity 6000.3.24f1 install.
It refuses a result if measured source bytes change during compilation or
execution. Combat advances through the production `Step()` method until its
terminal status; there is no alternative combat model.

The four builds mean:

- **Starter:** all permanent and temporary levels zero; no purchases during the
  measured run. Tier 2 starter is a numerical comparison, not a fresh-save
  admission claim.
- **First earned Cannon:** a real Tier 1 starter model reaches defeat. Its actual
  ticks and kills are passed to the production progression owner; manual Claim
  credits one Salvage, Cannon Attack level 1 spends it, and the resulting record
  is reloaded. Assertions require wallet zero, Cannon level 1, every other track
  zero, and Tier 2 unlocked. The subsequent measured runs make no temporary
  purchases. This proves an earned **in-memory model** transition, not browser
  storage, elapsed real time, or a human player's actions.
- **Permanent cap bound:** all applicable tracks start at permanent level 3.
  This is not one upgrade and does not establish that a player earned the build.
- **Total cap bound:** all applicable tracks start at permanent level 3 plus five
  temporary levels, total 8. It is a numerical upper bound and makes no claim of
  affordable or earned purchases at deployment. Inapplicable fitting tracks have
  no combat effect.

Commands run from the repository root:

```powershell
python -m unittest campaign-unity/Tools/last_stand_tiers/test_tier_calibration.py -v
python campaign-unity/Tools/last_stand_tiers/run_first_session_measurements.py --output campaign-unity/Evidence/first-session-polish/tuning-20261021.json
```

The existing calibration passed both tests: goals remain attainable at current
caps, and Tier 2 is harder for matched builds by survival or disabled count. The
new harness compiled with warnings treated as errors and completed all 16
measurements and both production purchase/reload assertions. Its starter and
cap results match the existing calibration. Reruns should choose a new output
path; the runner preserves existing evidence by refusing overwrite.

## Results

Each cell is survival seconds / enemies disabled. These are deterministic model
outcomes with no temporary purchases during the measured run.

| Fitting / tier | Starter | First earned Cannon | Permanent cap bound | Total cap bound |
| --- | ---: | ---: | ---: | ---: |
| Repair / Tier 1 | 77.85 / 28 | 85.35 / 35 | 98.85 / 49 | 175.35 / 129 |
| Repair / Tier 2 | 70.55 / 21 | 77.85 / 28 | 98.85 / 47 | 161.85 / 113 |
| Launcher / Tier 1 | 82.35 / 33 | 88.35 / 40 | 112.35 / 64 | 180.00 / 143* |
| Launcher / Tier 2 | 79.35 / 30 | 82.35 / 33 | 98.85 / 51 | 175.35 / 129 |

*The Launcher Tier 1 total-cap case reaches the 180-second safety limit with
240 hull. Every other case ends in defeat. A safety-limit result pays zero;
ordinary defeat still requires manual Claim for one Salvage.

On Tier 1, the first earned Cannon level adds **7.50 seconds and 7 disables** for
Repair, and **6.00 seconds and 7 disables** for Launcher. Tier 2 gains are
7.30 seconds / 7 disables and 3.00 seconds / 3 disables respectively. Neither
Tier 2 starter nor first-upgrade build reaches its existing 90-second goal;
both cap bounds do. Both starter fittings already exceed Tier 1's 60-second goal.

Switching tiers immediately after that first upgrade can obscure its benefit:
the upgraded Tier 2 result equals the unupgraded Tier 1 result in each fitting
(77.85 seconds / 28 disables for Repair; 82.35 seconds / 33 for Launcher). That
does not mean the upgrade failed. The comparison changed both build and tier.
These measurements alone do not establish whether players find the feedback
unclear, how quickly they progress with temporary purchases, or whether the
balance feels satisfying.

## One proposed experiment: compare the first upgrade on the same tier

After the first successfully saved permanent Cannon purchase, compare the current
flow with a concise optional **"Try your upgrade on Tier 1"** redeploy cue. Keep
Tier 2 available and preserve the player's actual selection; do not force an
extra run. Use the existing selected-tier best as the comparison, rather than
promising a fixed survival gain in the interface. Runs with temporary purchases
or changed fittings are not controlled balance comparisons.

**Expected benefit:** makes the existing first-upgrade improvement observable
before the harder tier cancels it numerically. It may make the
defeat → Claim → purchase → redeploy loop easier to understand without changing
the progression curve.

**Tradeoff:** another cue could crowd the garage or steer a player away from the
newly unlocked tier. A second Tier 1 run also asks for roughly another minute of
attention. The numerical measurements do not prove that the cue is needed.

**Observation:** use both fittings' normal-speed fresh/returning baseline to
check whether players recognize the saved purchase and choose their next tier
without confusion. If that friction is present, compare the cue against the
current flow using actual observation, including whether the extra prompt
delays or obstructs a player who wants Tier 2. Do not infer user comprehension
from automated checks or declare a winner without observed feedback.

**Rollback:** remove the cue if it is distracting or provides no observed
clarity benefit. This experiment needs no balance or save change: keep the
60/90-second goals, prices, rewards, permanent/total caps, and `tier-goals-v1`
record identity unchanged. Owner visual and motion acceptance, browser
qualification, hosted CI, merge and deployment remain separate evidence.

## Check after the clarity changes

The measurement runner was repeated against the updated text-formatting source
and its shared clock import. [The new measurement record](../Evidence/first-session-polish/tuning-after-clarity-20261021.json)
has the same 16 measurement objects and both earned-upgrade proofs as the
baseline, compared by exact parsed equality. The source hashes differ as expected;
the two records remain separate. This supports unchanged modeled combat and
progression for these scenarios, not a browser or owner-acceptance claim.
