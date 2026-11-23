# Skills acquisition from a fresh profile

The production model reached Tier 1 waves 25, 50, 100, 300 and 500 through five normal deployments, earning 11 Skill Intel and spending it on 11 draws. The final collection owns all six skills: Overdrive has three copies and rank 2; the other five remain rank 1. Three slots are unlocked. No skill reaches rank 3 within this trajectory.

This is a separate earned acquisition study from [the laboratory combat comparison](balance.md). Its origin is a newly created production profile with zero Salvage, permanent levels, best waves, Intel and skill copies. It never changes saved fields or seeds enemies, waves, health, money or ranks. It calls the normal deploy, wave commit, paid purchase, finalize, draw and skill preparation APIs; the JSON retains the initial and final profile bytes and their hashes.

| First reached wave | Run | Cumulative modeled active minutes | Cumulative earned Intel / draws | Slots | Owned skills | Collection after garage draws |
|---|---:|---:|---:|---:|---:|---|
| 25 | 1 | 6.48 | 1 | 1 | 1 | Overdrive: 1 copy |
| 50 | 2 | 19.71 | 2 | 1 | 2 | Overdrive: 1; Reinforced Hull: 1 |
| 100 | 3 | 50.51 | 3 | 2 | 2 | Overdrive: 2; Reinforced Hull: 1 |
| 300 | 4 | 183.20 | 6 | 2 | 5 | Overdrive: 2; Repairs, Hull, Ballistics, Lining: 1 each |
| 500 | 5 | 437.15 | 11 | 3 | 6 | Overdrive: 3; Repairs, Minefield, Hull: 2 each; Ballistics, Lining: 1 each |

The draw generator uses seed **20261111** and a specified unsigned 32-bit linear congruential generator with rejection before modulo selection. Each draw samples the current catalog-ordered, eligible, nonmaxed pool. Outcomes are not selected to complete the collection: the wave-100 draw duplicates Overdrive and does not grant a second passive, while Minefield remains unowned until the wave-500 garage visit. This single deterministic seed demonstrates a reproducible route; it does not estimate the average or worst-case experience across draw seeds.

The policy uses the initially owned launcher fitting, Tier 1, and 1x speed throughout. It buys run upgrades after kills using earned Scrap. Between runs it buys permanent upgrades using earned Salvage through the existing round-robin funding policy. That policy waits for the next chosen upgrade to be affordable, so some wallet balance remains. It returns to the garage at each target wave, draws all available Intel, and equips owned passives in Hull/Ballistics/Lining order up to the earned slot count. Active skills are acquired but not activated in this acquisition baseline; their timed effects are covered by the separate combat study.

All five runs ended at the requested boundary and finalized by explicit abandon. Repeated waves are included in time and rewards: this is a sequence of 25-, 50-, 100-, 300- and 500-wave runs, not one continuous 500-wave run. First-time Intel awards at waves 25 and 50 occur once; every 100th completed wave awards repeatable Intel. The trajectory therefore earns 1 + 1 + 1 + 3 + 5 = **11 Intel**.

Funding reconciles exactly: **2,876 earned Salvage = 770 paid permanent upgrades + 2,106 remaining wallet**. Every run separately conserves earned, spent and remaining Scrap. There are no research purchases, research bonuses, speed unlocks, closed-time waits or closed-time combat rewards. Total modeled active time is **26,229,150 milliseconds**, or **7.29 hours at 1x**, over **524,583 simulation ticks**. The disclosed limits were 96 runs and 2,000,000 ticks; the study stopped after earning the final requested milestone.

The purchase policy issues 822 paid run-upgrade transactions across those five runs. It is an attentive automated policy with zero menu or decision time. The 7.29 hours are model time, not real elapsed play, a human pacing estimate, a native endurance result or evidence of typical player success. No player profile was accessed. Skills can be unlocked for drawing before the seed grants ownership, and earned slots can remain underfilled; the observations preserve those distinctions.

Reproduce the report:

```powershell
python -B campaign-unity/Tools/last_stand_skills_combat/measure_acquisition.py --output campaign-unity/docs/last-stand-skills/acquisition.json
python -B campaign-unity/Tools/last_stand_skills_combat/test_acquisition.py
```

[The JSON artifact](acquisition.json) binds production and measurement source hashes, each draw's eligible pool and pre/post collection, per-run currency and combat records, and each milestone's earned state. The independent validator replays the seeded draws, checks reward/slot thresholds and currency/time conservation, and rejects altered origins, reward grants, pools, rerolls, copies, milestone states, slot counts, funding and clocks. Two tests pass, including nine falsified-report controls.

`sourceSha256` retains actual input-byte hashes. The separate `sourceLfSha256` map uses the recorded `CRLF-and-CR-to-LF; all other bytes preserved` normalization for comparison across Windows and Linux checkouts. The portability assertion checks all three Skills report generators against LF, CRLF and CR source variants while retaining BOM and non-ASCII bytes, and checks LF report output. These normalized bindings do not replace the raw evidence.
