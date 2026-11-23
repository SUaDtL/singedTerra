# Skills balance: bounded production-model comparison

This study compares no Skills, three passives, and three actives in the actual fixed-step combat model. It uses disclosed laboratory seeds: full hull, all three skill slots, fresh uses, fixed permanent levels, launcher plus repair, and no combat research or in-run purchases. The early three-slot comparison is deliberately counterfactual; it does not claim that those slots or skills have been earned at wave 25. No player save is read or written.

[The separate fresh-profile acquisition study](acquisition.md) measures earned Intel, random copies, ranks and slots through waves 25/50/100/300/500 with normal production transactions. Its funding and time assumptions are independent of these laboratory combat seeds.

Each scenario starts at the named empty wave cohort. It stops on defeat, 50 completed waves, or 50,000 simulation ticks (2,500 simulated seconds). This is modeled balance, not elapsed-time endurance, acquisition pacing, native input, or player acceptance.

Active policy: use Overdrive when at least half the wave is alive (minimum four), or at 60% hull; use Emergency Repairs at 45% hull; arm Minefield when at least two enemies are within its ring, or at 60% hull. Every active is spent at most once. The policy is fixed across scenarios, not optimized after seeing each outcome.

| Scenario | Permanent level | Rank | Build | Cleared waves | Simulated seconds | Effective damage | Outcome |
|---|---:|---:|---|---:|---:|---:|---|
| early-pressure | 0 | 1 | none | 0 | 24.40 | 643 | defeated |
| early-pressure | 0 | 1 | passive | 0 | 25.05 | 675 | defeated |
| early-pressure | 0 | 1 | active | 0 | 26.40 | 934 | defeated |
| mid-pressure | 100 | 2 | none | 0 | 24.35 | 77,993 | defeated |
| mid-pressure | 100 | 2 | passive | 0 | 27.80 | 103,919 | defeated |
| mid-pressure | 100 | 2 | active | 0 | 28.85 | 118,781 | defeated |
| deep-pressure | 800 | 3 | none | 0 | 33.40 | 2,664,359 | defeated |
| deep-pressure | 800 | 3 | passive | 0 | 37.40 | 3,464,146 | defeated |
| deep-pressure | 800 | 3 | active | 0 | 36.40 | 3,566,445 | defeated |
| early-sustained | 5 | 1 | none | 15 | 481.95 | 47,449 | defeated |
| early-sustained | 5 | 1 | passive | 16 | 492.35 | 51,067 | defeated |
| early-sustained | 5 | 1 | active | 15 | 473.20 | 47,449 | defeated |
| mid-sustained | 300 | 2 | none | 30 | 2500.00 | 41,417,036 | tick-cap |
| mid-sustained | 300 | 2 | passive | 33 | 2500.00 | 45,471,861 | tick-cap |
| mid-sustained | 300 | 2 | active | 30 | 2500.00 | 41,521,570 | tick-cap |
| deep-sustained | 1600 | 3 | none | 0 | 72.40 | 20,174,487 | defeated |
| deep-sustained | 1600 | 3 | passive | 18 | 2500.00 | 852,190,511 | tick-cap |
| deep-sustained | 1600 | 3 | active | 1 | 256.30 | 79,510,840 | defeated |

Active interventions improve near-failure early/mid performance: early-pressure survival rises from 24.40 to 26.40 seconds and effective damage from 643 to 934. In deep-pressure, the passive build survives longer (37.40 versus 36.40 seconds), while the active build deals slightly more damage (3,566,445 versus 3,464,146).

Persistent passive benefits matter more over the sustained windows. Mid-sustained clears 33 waves with passives versus 30 for the other builds at the common tick cap. The deep-sustained passive build reaches 18 clears and the cap; one-use actives improve the baseline from zero to one clear but eventually run out. These are threshold-sensitive fixtures, not evidence that all farming and pushing choices are balanced.

The fixed active policy can waste a useful intervention: early-sustained clears the same 15 waves as baseline but dies sooner after changing the encounter schedule. This is retained as an observed tradeoff. Better timing and mixed builds need player feedback; the measurements do not silently tune the policy to guarantee a win.

All 18 rows reapply the same Shop projection twice before combat and require the exact state to remain unchanged. Separate combat tests cover all three ranks, precise Overdrive expiry, one-use refusal, paused/5x clock equivalence, mine range, and checkpoint restore.

Reproduce with `python -B campaign-unity/Tools/last_stand_skills_combat/measure_balance.py --output campaign-unity/docs/last-stand-skills/balance.json`. The JSON records the exact production and measurement source hashes.

`sourceSha256` binds the actual input bytes read on this host. The additional `sourceLfSha256` binding uses the explicitly named `CRLF-and-CR-to-LF; all other bytes preserved` normalization, allowing comparison with an LF checkout without replacing the raw-byte evidence. Report files are written with LF line endings.
