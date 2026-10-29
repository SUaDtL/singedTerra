# Combat balance measurement policy

Policy `v4-expanded-2` is unchanged between the historical baseline and current calibrated measurement. This is a bounded
production-model experiment, not live player, rendering or endurance acceptance.
The retained v3 tools and reports remain unchanged.

Start with empty storage, zero Salvage/levels/research and actual unlocks. Use
Launcher for the canonical funding path, common permanent tracks only. Three
deployments farm Tier 1, then every fourth attempts the highest unlocked tier.
This fixed schedule is not an optimizer. Permanent
spending may consume at most half cumulative earned Salvage; research may consume
the other half. No synthetic credit or refunds. Common purchase order is cannon,
hull, income, cannon, cycle, armor. Research order is Game Speed, Research Speed,
Salvage Recovery, Scrap Logistics, filling actual unlocked idle slots; no queue,
switch or optimizer. Research funding is attempted before and after deployment,
not during closed time. Funding selects its greatest confirmed earned speed and
uses the after-kill upper-bound run-buy policy.

Funding caps: 128 deployments, 20,000,000 total ticks, 5,000,000 ticks per run,
90 modeled calendar days. After each deployment, advance 20 hours with no combat
or income, allowing already paid research to progress. Stop at these disclosed
caps even if a target remains unreachable. Capture finalized profile bytes at
cumulative earned thresholds 0/100/1,000/10,000/100,000/1,000,000; report actual
overshoot. No fitting-specific permanent funding before a branch.

Fork identical captured bytes for each equal-budget branch. Spend at most half
the remaining wallet through actual permanent transactions in cannon/hull/income/
cannon/cycle/selected auxiliary/armor order. No further permanent/research starts
during the branch; previously paid research still progresses. Compare all tiers
1–4, five fittings, positive speeds 0.5–5 in 0.5 steps, and policies none,
one-Max/900 active real-equivalent seconds, and after-kill One-buy upper bound.
Only earned, currently supported choices enter a branch. Each run records outcomes
at waves 1/100/300/500/2,000/5,000 continuously. The expanded policy bounds each branch at
5,000,000 ticks and the entire earned matrix at 60,000,000 ticks; resource-limited
rows are explicit, never silently dropped or called defeats.

The expanded matrix spends its finite execution budget on all earned 1x max900
cells first, then other 1x policies, then secondary speeds; within each group,
budget/tier/fitting/policy/speed order is deterministic. This prevents early
Repair speed variants from consuming the budget before new fitting observations.

Within-run Max cadence consumes one deadline whether the purchase succeeds or
fails, never replays missed deadlines, skips capped/inapplicable tracks, and saves
for the next unaffordable track. After-kill One buys are an unrealistic upper
bound, capped at 1,000 intents per kill callback. None means no run purchases.

Report repeatable/base Salvage, research bonus and first-clear awards separately;
only base plus research bonus contributes to repeatable farming rates. Every
row records currency conservation, source profile identity, investment and
research calendar. Simulated active/calendar time and tool execution time are
different quantities. Fixed tick/spawn cadence stays production-owned. Hypothetical
mature probes, if included, carry an explicit gifted label and cannot establish
earned access, farming advantage or a 10–12-hour real-duration result.

Three repeated lower-tier wave 100 farms versus next-tier defeat attempts use
identical earned starting bytes, Launcher, 1x, max900 and a separate
2,000,000-tick aggregate cap. Both branches first spend the same half-wallet
allocation; its debit, remaining wallet and resulting profile identity are
reported. There are no further permanent purchases between attempts. A pair is
a sustainable-farm/onboarding comparison only when all three lower runs clear 100
alive and all three upper runs die before clearing 100.

Confirmed fitting/tier unlocks also capture the actual saved profile at the
accepted wave boundary. Forks use the real abandon transaction before changing
selection; no reward is replayed. A final-earned cohort preserves unlocks after
the last cash threshold. Each cohort has independent 10,000,000-tick budgets
for its original 1x/Max comparisons and its supplemental comparisons.

Supplement `split-common-aux-affordable-v1` uses those same earned bytes with
half the available Salvage for common tracks and half for the selected auxiliary.
It makes actual One purchases in fixed order, skips capped/unaffordable choices,
and reports both budgets, actual debits, leftover currency and profile identity.
It uses no run purchases and observes continuous runs through wave 500, explicitly
marking later checkpoints outside that selected window. This supplement isolates
paid fitting effects; it does not replace or optimize the original policy.

Counters bind actual combat events to weapon/enemy type, effective damage,
unique kills, armor mitigation, Railgun's effective bypass, Mortar multi-target
casts and Repair healing. Checkpoint records describe that actual cohort only;
total counters describe the full continuous run. Witnesses are observations,
not automatic comparative-usefulness or nondominance verdicts.

Hypothetical probes cover all four tiers/five fittings/three run-buy policies
with gifted permanent 500 clamped by each track, gifted Logistics 25 and assumed 5x.
They use actual typed Scrap/shop/model owners, 5,000,000 ticks per trajectory,
and no credited Salvage or fabricated funding history. They expose mature
mechanical behavior only, including defeat before 5000.

The historical baseline and applied calibration are separate reports. The baseline
is `combat-balance-baseline-report.json` (historical raw SHA256
`97faf58f8898d2f75fd53876950792884cc29266a5e77283f31663b9b778efc7`);
its observer is `crowded-wave-baseline-report.json` (raw `630c3ae9…`). Exact local
raw inputs and generated harnesses remain archived under
`Evidence/combat-depth-planning-20261028/`. Git checkouts may normalize line endings:
explicit raw and LF hashes distinguish historical bytes from portable admission.

The original pilot stopped at 2,000,000 funding ticks with 9,488 earned Salvage;
its 250,000-tick per-run cap stopped Tier 1 around wave 429. Expanded1 and expanded2
retain their own reports, policies and all 35 inputs. Expanded2 preserves exact
old-field numeric parity. Its only farming label changes are 36 later checkpoints
in nine intentional wave-100 runs: `resource-limited` became
`outside-selected-window`. The complete exception list is retained in
`combat-measurement-expanded2-parity-reviewed.json`, alongside the original parity
receipt. No farming currency or timing changed.

The initial production baseline lacked a measured Scattergun/Mortar advantage.
The separately retained candidate trials tested only predeclared range/radius,
damage-growth and combined alternatives on the same earned profile and continuous
Tier 3 waves 281–300, with Tier 1 controls. Damage inflation alone was insufficient.
Scattergun range 25m won every sampled Tier 3 wave and also outpaced Launcher
through Tier 1, so the smaller 22m interception change was selected. Those
changed-model trials are historical evidence, not the current production proof.

The applied current-edition changes are Scattergun range 22m with its original
damage formula, and Mortar radius 10m with quadratic damage divisor 4. Prices,
cadence, target selection/counts and ordinary armor handling remain unchanged.
Retained editions keep their original values. Root's actual mechanic regressions
preceded these changes; the reports below were then regenerated from the applied
production owners, not transformed candidate copies.

`combat-balance-calibrated-report.json` has raw SHA256
`072c83cf31ff8a7fa321027cb46b6b344c49d2cbf2c1a02fbf32ad660d67eaa4`
and LF SHA256 `f659e408aea24a1da95636b50a9eba72f328aa4483e192b5a4ca2413ee956a6f`.
The run completed in 1,076.459 seconds, with all 35 source/tool-wrapper inputs
unchanged. Funding, research purchases/completions, saved cash-threshold profiles,
balances, farming results and early-cap bounds exactly match the baseline.

The fixed funding path earned 305,402 Salvage in 22 deployments and 20,000,000
actual model ticks, unlocking all five fittings and Tier 4. It records 83.844
active real-equivalent hours plus 440 closed hours across 21.827 modeled calendar
days. This is simulated calendar time, not an observed multi-day session. The
1,000 and 10,000 thresholds share one actual 12,544-earned profile; they are not
independent samples. The 1,000,000 threshold remains unavailable.

All 3,600 requested matrix cells are retained: 196 defeats, one tick-limited run
and 3,403 unavailable cells under the unchanged earned-access/resource limits.
Longer survival can consume more of the fixed aggregate budget; an unavailable
cell is not a qualified outcome. The original branch allocation can also stall
at an unaffordable Cannon Cycle purchase. The separately declared split policy
funds actual auxiliary levels without silently replacing that original policy.

Each fitting now has a concrete benefit within an equal-earned-investment group:

| Fitting | Matched earned comparison | Observed benefit |
| --- | --- | --- |
| Repair | 102,420 gross; Tier 1, original allocation, 1x, Max/900s | Clears 2,566 waves before defeat; next best Scattergun clears 2,138. |
| Launcher | Final 305,402 gross; split allocation; Tier 1, no run buys | Clears 500 in 269,205 ticks; other fittings take 295,916–300,532. |
| Scattergun | Tier-3 unlock profile; split allocation; Tier 3, no run buys | Clears 199 before defeat; Launcher/Mortar reach 149, Railgun 122, Repair 99. |
| Mortar | Final-earned split profile; Tier 3 wave 282 | Clears in 780 ticks versus Launcher's 793, with four real two-target casts. |
| Railgun | Same final-earned window; Tier 3 wave 300 | Clears in 955 ticks versus Launcher's 960; actual armored-target bypass is recorded. |

The current observer `crowded-wave-calibrated-report.json` has raw SHA256
`f7f0d70044d36afed14288975a116a93ccdeb937eadf8f325096411bcbd648e9`.
It completed in 8.110 seconds with 38 source inputs unchanged. Checkpoints 1, 100
and 300 and every paid allocation exactly match the calibrated full report.
The five runs fork the same final-earned bytes with 134,789 available Salvage,
67,394 common-track and 67,395 auxiliary budgets. Actual auxiliary spending is
66,992–67,366; leftover funds remain visible. No run purchases occur.

| Fitting | Tier 3 window ticks, waves 281–300 | Incoming damage | Living-enemy tick sum |
| --- | ---: | ---: | ---: |
| Repair | 27,756 | 262,289, all healed | 132,588 |
| Launcher | 16,360 | 0 | 36,950 |
| Scattergun | 16,696 | 0 | 42,576 |
| Mortar | 16,641 | 0 | 43,117 |
| Railgun | 16,150 | 0 | 40,301 |

All receive 43,499 Scrap and 151 Salvage in the observed window. Scattergun is
uniquely fastest on four waves, Mortar on five, Railgun on eight and Launcher on
one; two waves tie. Pressure sums actual living foes after each step, not CPU work
or attacks. The window therefore shows distinct tradeoffs, not a universal winner
or a claim that every fitting leads every budget. In the broader final-earned
Tier 3 comparison, Scattergun and Mortar both clear the selected wave-500 boundary;
Launcher dies after 492, Repair after 432 and Railgun after 410. That selected
boundary remains a lower bound, not a measured eventual defeat for the two clears.

Three sustainable Tier 1 wave-100 farms beat three next-tier onboarding defeats
on repeatable/bonus Salvage per active time from both measured early profiles.
For the 12,544-earned profile the rates are approximately 236.6 versus 162.5
Salvage/hour; first-clear rewards are excluded. Tier 2-to-3 sustainable farming
remains unproven because the lower runs do not survive to wave 100.

The conservative one-pass waves 1–300 ceilings of 9,342 Salvage and 12,096,000
Scrap permit only 800–1,006 combined permanent/run ranks across the long-term
tracks, below 5,000. Free maximum income modifiers are used only to overestimate
this analytical ceiling, never credited to earned profiles.

Gifted mature Tier 1 pacing controls using one Max purchase every 900 active
seconds all reach wave 5,000. Projected 5x hours are Repair 11.622, Launcher 10.014,
Scattergun 10.500, Mortar 10.456 and Railgun 10.538. These retain the approximate
10–12-hour target; gifted strength and modeled time do not establish earned access
or live endurance.

Current verification is 80/80 Roslyn combat-depth tests in 57.639 seconds,
including 15 measurement checks and six observer/readback tests. Reader negatives
reject foreign bindings, missing cells, unpaid investment, replayed purchases,
missing ticks, impossible pressure/hull/currency and disconnected cumulative
boundaries. A fresh LF checkout with no ignored archive actually runs the observer.
Its historical and calibrated pins are distinct; neither admits the other's report
or source. The exact generated observer harness is included as
`crowded-wave-generated-observer.cs.txt` and bound by the current report's digest.

The earlier baseline also passed 15/15 embedded mcs checks. Current mcs compilation
to a temporary path encountered an OS read/launch `Invalid argument` before any
assertions; the failed bytes could not be read for same-byte replay. A separately
compiled owned artifact ran one actual-wave case. This is partial local host
qualification, not a current mcs-suite pass or Linux proof.

Reproduction from the declared current source uses:

```powershell
python -B campaign-unity/Tools/last_stand_combat_depth/measure_combat_balance.py --output campaign-unity/docs/last-stand-combat-depth/combat-balance-calibrated-report.json
python -B campaign-unity/Tools/last_stand_combat_depth/measure_crowded_waves.py --output campaign-unity/docs/last-stand-combat-depth/crowded-wave-calibrated-report.json
python -B -m unittest discover -s campaign-unity/Tools/last_stand_combat_depth -p 'test_*.py' -v
```

The reports support the declared bounded balance comparison on actual production
owners. High unearned budgets, censored cells, physical storage latency, rendering,
device behavior and long live runs remain outside this evidence. Release and
player acceptance use their own current receipts.
