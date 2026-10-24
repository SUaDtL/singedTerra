# Research and farming economy candidate

Approved scope: ST-LS-RESEARCH-SPEC, revision 8 (owner approval carried from revision
7). Values below describe the current candidate, not a final balance claim.
The implementation uses `research-v1` and `research-farming-economy-v2`.

## Currencies and commitments

Salvage funds both permanent Mechanics Shop levels and research. Scrap buys levels
for the current run. There is no Research Data wallet. Tier milestones pay once;
ordinary wave Salvage repeats. Salvage Recovery multiplies only the repeatable
component, with an integer fractional carry, so small payouts are not lost to
rounding. Research completion must save before its reward or speed benefit applies.

Slots unlock at Tier 1 waves 25 and 100. A slot holds one active and one funded
queued project. Suspend/switch keeps earned time and refunds the stored charge once;
resuming repays that project. Completion starts a legal prepaid queue without
buying any further ranks. Two slots can complete at the same instant; all those
completions resolve before queued projects begin.

## Research prices and time

Game Speed has eight ranks, each granting another 0.5x ceiling. Players choose their
actual speed in half steps, down to pause. Earning a ceiling never accelerates or
unpauses the game by itself.

| Rank | Ceiling | Salvage | Base duration |
| --- | --- | --- | --- |
| 1 | 1.5x | 20 | 10 minutes |
| 2 | 2x | 60 | 1 hour |
| 3 | 2.5x | 180 | 6 hours |
| 4 | 3x | 500 | 1 day |
| 5 | 3.5x | 1,500 | 3 days |
| 6 | 4x | 4,500 | 7 days |
| 7 | 4.5x | 12,000 | 10 days |
| 8 | 5x | 30,000 | 14 days |

The base ladder totals 48,760 Salvage and about 35.3 days of continuously funded
research. Waiting for funds increases calendar time. Research Speed can shorten
other projects; this is not a promise that a fresh player reaches 5x in 35 days.

Supporting tracks have 100 ranks. For purchased rank `r`, all divisions below
round down. Each completed rank adds two percentage points to its multiplier.

| Track | Salvage cost | Base minutes |
| --- | --- | --- |
| Salvage Recovery | `25r + 2r² + floor(r³/10)` | `15r + 3r² + floor(r³/20)` |
| Scrap Logistics | `20r + r² + floor(r³/20)` | `10r + 2r² + floor(r³/25)` |
| Research Speed | `15r + 2r² + floor(r³/12)` | `20r + 4r² + floor(r³/15)` |

Other projects lock their duration when they start: base milliseconds multiplied
by `100 / (100 + 2 × completed Research Speed rank)`, rounded up. Research Speed
never reduces its own duration. Queue promotion uses the ranks confirmed at that
instant. Research uses UTC on reopen and monotonic elapsed time while open.

## Upgrade curves

For a run's nth purchased level, let `e = max(0,n-8)`. Price is
`slope × n + floor(e²/divisor)`, except Cannon Cycle. Permanent prices use the
purchased permanent rank `n`: `initial + floor(n/linear) + floor(n²/quadratic)`.
Permanent levels improve the starting build without making the first run purchase
more expensive. Bulk 1/10/100/Max quotes sum the same prices and stop at funds/cap.

| Track | Run slope / divisor | Permanent initial / linear / quadratic | Total / permanent cap |
| --- | --- | --- | --- |
| Cannon Attack | 5 / 160 | 2 / 4 / 400 | 5,000 / 2,500 |
| Launcher Attack | 3 / 220 | 2 / 5 / 500 | 5,000 / 2,500 |
| Hull Capacity | 4 / 200 | 3 / 4 / 350 | 5,000 / 2,500 |
| Armor | 4 / 100 | 4 / 2 / 100 | 1,000 / 500 |
| Field Repair | 3 / 320 | 2 / 6 / 600 | 5,000 / 2,500 |
| Scattergun Attack | 3 / 240 | 2 / 5 / 550 | 5,000 / 2,500 |
| Scrap Yield | 5 / 20 | 5 / 1 / 20 | 200 / 200 |

Cannon Cycle's run price starts at 20 Scrap and multiplies the previous price by
1.7, rounding up each step. Permanent rank n costs `20 × 2^(n-1)` Salvage. Its
caps are 16 total / 12 permanent; each rank removes one 50 ms simulation tick from
the base one-second cannon period.

At total level L, let `g=max(0,L-8)`. Cannon damage is
`20+10L+floor(g²/80)`; Launcher `12+4L+floor(g²/8)`; Scattergun
`9+3L+floor(g²/12)`; maximum hull `120+15L+floor(g²/2)`; Field Repair
`3+L+floor(g²/40)` per simulation second. Armor subtracts L from each hit with
a minimum of one damage. Scrap Yield adds one percentage point per level.

Base kill Scrap is `3+floor((wave-1)/250)`. Scrap Yield and Scrap Logistics
multiply subsequent income with exact fractional carry. They never recalculate
past income. Migrated runs retain their original base income, prices and effects;
research bonuses apply prospectively. Reload keeps the run's pinned economy.

## Measurement boundary

`Tools/last_stand_research/measure_upgrade_economy.py` compiles the production
models and records source hashes, stage budgets, cap costs and competing policies.
The 129-row candidate report places permanent cap spending at 81,900 Salvage for
Cannon Cycle, 155,370 for Scrap Yield, 482,215 for Armor and roughly 9.21–15.68
million for the large growth tracks. Early milestone income cannot buy a permanent
gold box. Caps represent actual completed effects, not decorative levels.

The early earned twelve-run Repair path reaches approximately waves
40, 71, 112, 140, 164, 192, 216, 246, 282, 349, 402 and 481. Mature Tier 1
fixtures project 5,000 waves in 10.18–11.11 hours at 5x. Those mature fixtures use
an ideal purchase policy after each admitted kill. They do not yet establish a
comfortable manual purchase cadence, real-time renderer performance or endurance.
The separate [periodic bulk report](last-stand-research/periodic-bulk-report.json)
uses one Max purchase every 15 real minutes, rotating Cannon/Hull/Yield/Cannon/
Cycle/fitted auxiliary/Armor and skipping capped tracks. It reaches 5,000 waves
with Launcher in 10.11 hours (40 purchases), Scattergun in 11.29 hours (45), and
Repair in 12.05 hours (48). Repair is slightly above the 12-hour target. Each
purchase costs at least three input gestures, including opening and closing the
shop; this is not an automatic purchase feature. The no-purchase controls die
around waves 1,983–2,444. Actual interface and scheduling overhead are unmeasured
by this projection. No unshipped Tier 10 is treated as balanced content.

The [full stage report](last-stand-research/upgrade-economy-report.json) and periodic
report retain source digests. Regenerate them when relevant curves change.

Run history divides repeatable plus research-bonus Salvage by measured active
real hours. It excludes milestone bonuses, pause and closed time; records actual
speed mix and upgrade/research context; and warns on short or differing samples.
Timing is checkpointed. An abrupt close can lose uncheckpointed timing from the
unfinished wave, just as that wave's combat state rolls back.
