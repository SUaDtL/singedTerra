# Ash Road balance corpus

Status: deterministic source-engine evidence for the selected chapter profile. This is not a human win rate, a universal weapon tier list, or final tuning approval.

## Method

- Runner: `npx tsx --tsconfig client/tsconfig.json scripts/checks/campaign_balance.mjs`
- Engine: the source `GameEngine` through `createCampaignGameEngine`; no packaged baseline or mocked ballistics.
- Corpus: two deliberately separate sets: nine retained authored transcripts across Fuel Stop, High Road, Salvage Pit, and Relay Ridge, plus four synthetic-but-source-native held-out encounter definitions. The held-out decisions do not reuse a production transcript or production terrain/spawn/object definition.
- Combat profile: `ash-road-v1` version `1`, recorded on every probe as well as in the report method.
- Pairing: every human firing decision is cloned from the same canonical pre-decision state and simulated at -2, 0, and +2 degrees. Shield activation is a single not-applicable-to-aim observation.
- Budget: one full authoritative simulation per probe, with a hard 1,200-tick completion bound. Rejected or over-budget probes remain explicit incomplete records and are included in the summary rather than converted into zero-cost successes. A forced unavailable-weapon probe exercises that incomplete path.
- Inventory: Baby Missile is owned/unlimited; selected offensive weapons and Shield are granted; Relay Ridge refill cases classify both carried offensive weapons as purchased with a one-supply economic cost; no case fabricates a campaign weapon reward.
- Recorded per probe: seed, terrain/spawn family, wall mode, opening/pre-damaged terrain, initiative, protected-object presence, shield state, inventory provenance, decision turn, weapon, aim error, hull/shield/fall/hazard/self/ally/object damage, remaining ammunition, economic cost, resolution ticks, and objective state.

The exact-key/versioned fixture parser rejects unknown keys, versions, costs, provenance, and malformed replay actions; in-run negative controls exercise those failures. The runner executes the complete corpus twice and requires deep equality. It separately requires all six selected chapter weapons in the retained set and four distinct held-out seeds, terrain families, spawn families, a pre-existing shield, protected objects, a cache, relay, and supply drum.

## Fresh result

- Samples: 68 decision probes; 67 completed; 1 intentionally incomplete.
- Retained set: 55 completed probes from authored seeds 4201, 4202, 4203, and 4204.
- Held-out set: 12 completed probes from disjoint seeds 9101, 9102, 9103, and 9104, plus the one incomplete negative-control probe.
- Held-out terrain families: wide terrace, stepped basin, level shield range, and double shoulder.
- Held-out spawn families: opposed outer plateaus, maximum-separated flanks, shielded reply line, and objects between combatants.
- Maximum observed resolution: 200 ticks, below the 1,200-tick refusal bound.
- Completed shielded samples: 6, of which 3 are held out. Completed protected-object samples: 34, of which 9 are held out.
- Authored campaign wall mode observed: `open`. Wall-mode variation remains covered by the ordinary engine regression corpus; this chapter does not expose a campaign wall selector.

Retained in-sample regression set:

| Weapon | Samples | Mean hull | Mean shield absorption | Mean fall | Mean object | Max ticks | Terminal successes in probe state |
|---|---:|---:|---:|---:|---:|---:|---:|
| Baby Missile | 6 | 0.00 | 0.00 | 0.00 | 0.00 | 12 | 3 |
| Cluster Bomb | 18 | 38.14 | 0.00 | 0.00 | 18.03 | 75 | 3 |
| Missile | 18 | 29.36 | 0.00 | 0.00 | 13.06 | 144 | 6 |
| Napalm | 6 | 0.00 | 0.00 | 0.00 | 0.00 | 200 | 1 |
| Sandhog | 6 | 19.49 | 1.26 | 3.63 | 18.33 | 200 | 1 |
| Shield | 1 | 0.00 | 35.00 | 0.00 | 4.45 | 0 | 0 |

Held-out source-engine set:

| Weapon | Samples | Mean hull | Mean shield absorption | Mean fall | Mean object | Max ticks | Terminal successes in probe state |
|---|---:|---:|---:|---:|---:|---:|---:|
| Missile | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 73 | 0 |
| Cluster Bomb | 3 | 0.00 | 0.00 | 0.00 | 80.00 | 91 | 0 |
| Sandhog | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 121 | 0 |
| Napalm | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 177 | 0 |

Retained-set aim sensitivity (kept separate from held-out evidence):

| Aim error | Samples | Mean hull | Mean object | Terminal successes in probe state |
|---:|---:|---:|---:|---:|
| -2 degrees | 18 | 20.59 | 10.13 | 2 |
| 0 degrees | 19 | 34.87 | 12.02 | 9 |
| +2 degrees | 18 | 16.60 | 14.63 | 3 |

Terminal success counts describe the state reached by that bounded mechanical probe. They are not player win rates. Held-out zeros remain zeros rather than being reinterpreted as failures or successes. In the retained corpus, a zero-damage Baby Missile turn advances the survival objective, Napalm's role is persistent area control over a full 200-tick resolution, Shield absorbs the announced strike, Missile supplies precision, Cluster Bomb supplies spread and object pressure, and Sandhog supplies terrain undercut/fall pressure.

## Selection conclusion and limits

The six-weapon profile has a demonstrated chapter role without making any optional weapon mandatory: complete retained episode paths exist with two substantially different offensive kits, and the survival path uses the unlimited basic shell. The evidence supports retaining the current versioned profile for owner playtesting; it does not prove human comprehension, enjoyment, or final difficulty.

No physical-phone timing, listening-room audio judgment, or five-player formative session is claimed here. Those remain owner/device observations in the final handoff.
