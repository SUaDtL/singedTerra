# Combat depth: baseline and comparison policy

The owner approved `ST-LS-DEPTH-SPEC` and `ST-LS-DEPTH-PLAN` on October 28,
2026. This is the initial T-BASE observation against foundation commit
`c6b32cdef661743a455f5373bd72144c437b2209`. That initial observation was not a qualified integration
baseline: foundation PR #546 was draft and CI run 40625861839 failed.
The foundation repair retains its own plan and evidence.

## Preserved inputs

The current game has two tiers and environments, three auxiliary fittings
(Repair, Launcher and Scattergun), and Close/Ranged enemies. Combat has no
enemy armor. Wave groups contain at most 20 enemies and the model capacity is
32. The approved expansion keeps finite waves and one auxiliary fitting.

These checked-in fixtures remain independent inputs, not outputs regenerated
after changing the implementation:

| Input | SHA-256 |
| --- | --- |
| `Tools/last_stand_architecture/fixtures/baseline.json` | `c1f817f127e18e9198f75741b3a7fd900190ba1af1aeffa9a28a1307baff8c3d` |
| `Tools/last_stand_architecture/fixtures/profile-v5-wave30.json` | `ec100d628dfc7e6fa4a17afa5c882615c11b31d36411adf068203fe201409888` |
| `Tools/last_stand_research/fixtures/legacy-v4.json` | `e1721668c02b117a32d3b6f64b3af6035d85f5192ca35922065d193697deee42` |
| `Tools/last_stand_research/fixtures/legacy-v4.snapshot` | `955716a0b2ffca99be6312aabf3c8c73b399285c4ece478d1b82331459a7f978` |

Paths above are relative to `campaign-unity/`. The architecture fixture itself
was captured from pre-foundation commit `07dc13c0`; that historical identity is
preserved. Current source passed both its compatibility check and its compiled
reward-drift negative control on October 28 (2 tests, 4.058 seconds). This does
not establish every migration path or browser behavior.

The current architecture suite also passed all 38 checks in 18.595 seconds.
These cover the implemented domain/application/content boundaries, native
storage and compiler/source checks. Hosted lifecycle and physical-device
qualification remain separate obligations.

## Economy observations

The previous upgrade and periodic-bulk reports each have five source digests
that differ from the current foundation files. Their numerical conclusions
must not be treated as freshly measured merely because the source changes were
intended to preserve behavior.

The current production-model periodic-bulk run produced 15 rows, all numerically
identical to the prior report, using its current 16-file source closure. This
independently confirms those model outputs after the refactor. Its mature
profiles are explicitly gifted probes with permanent level 500 (clamped by
track), speed rank 8 and supporting research rank 25. They are not an earned
calendar timeline or a renderer/endurance measurement.

The current full upgrade/economy run also completed: 129 rows, numerically
identical to the previous report, with all current input hashes checked after
the run. The frozen reports and their digests are retained beside this note in
`upgrade-economy-baseline.json`, `periodic-bulk-baseline.json` and `baseline.json`.
Neither original report includes a complete shared-Salvage
research-funding calendar, so the expansion must add that comparison rather
than present fixed research ranks as earned progress.

## Comparison policy for the new content

Use the same fixed-tick production rules and independent expected invariants
for each of the five fittings. Freeze the test matrix before tuning:

- Tiers 1 through 4; observations at waves 1, 100, 300, 500, 2,000 and 5,000,
  with defeat recorded when a build cannot reach a checkpoint.
- Equal cumulative earned Salvage budgets, disclosed permanent allocations,
  research spending and elapsed research time. A fitting's unlock must be
  earned before it enters an earned-path comparison.
- Existing after-kill investment policies as upper-bound probes, an explicit
  15-real-minute single-Max-purchase cadence, and a no-purchase control. None
  of these measurements adds automatic buying to the game.
- Record survival, active time, kills, purchase count, Scrap earned/spent,
  repeatable Salvage per active hour, first-clear awards separately, and
  research completion. Include both fresh progression and mature fixtures,
  clearly labeled by origin.
- Each fitting needs an intended useful matchup at a reachable investment.
  Preserve sustain, area damage, rapid fire and focused/penetrating damage
  tradeoffs; reject a universal winner across the selected scenarios.
- Compare a sustainable lower-tier farm with repeatedly failing in the next
  tier. Do not count one-time milestone bonuses as recurring farm income.
  Early earnings through wave 300 must not cap a 5,000-level growth track.
- Keep 0.5-step speed selection through the researched 5x ceiling. Report
  simulation ticks and measured wall time separately. The mature 5,000-wave,
  10–12-hour reference is a pacing target, not a claim about unimplemented
  Tier 10 or a real-duration run already completed.

## Qualification still required

Foundation hosted lifecycle failures remain unresolved at this observation.
Current source-bound Windows/Android/WebGL build receipts exist, but they do
not supply physical-device acceptance. The current ADB query returns no
connected device; it started the normal local ADB daemon on port 5037.

Before new content performance claims, capture a reproducible 5x player
baseline and set frame/step-time and memory budgets from that measurement.
Keep the browser, Windows and physical Android measurements distinct. Do not
alter the user's existing paused run or bypass the earlier native foreground
occlusion check to obtain a baseline. Physical-device thermal behavior,
hardware audio and real-duration farming remain unmeasured.

## Compatibility seams inspected before implementation

Read-only source inspection at `9ec44f0546e1082a90ec5b566addcf5b296e8af3`
confirms that a new manifest version alone would not protect existing runs.
`LastStandProgressionSave` reads historical profile versions but validates v5
tier and track shapes against current catalogs. Checkpoint restoration, paid
effect projection, wave completion and reward settlement also use current
combat/content definitions. Decode the old shapes before expanding them, then
route the existing simulation and transaction owners through a retained edition.

Keep the persisted fitting values **Launcher 0, Repair 1, Scattergun 2**; their
display order is different. Preserve upgrade slots 0–7 (`cannonAttack`,
`launcherAttack`, `hullCapacity`, `armor`, `cannonCycle`, `fieldRepair`,
`scattergunAttack`, `scrapYield`). Historical adapters have six or seven tracks;
v2/v3 economy definitions have eight. New tracks must not reinterpret those
slots or force old checkpoints through new paid-effect shapes.

The economy already retains three editions, but its run-price curve compares
against the mutable current-version constant. Freeze the existing v3 curve
explicitly before introducing another edition. Likewise, preserve old roster
and income reconstruction instead of applying new enemy values to old kills.

Mortar's Tier 1/wave 500 and Railgun's Tier 2/wave 100 rewards use milestones
that existing profiles may have claimed. Backfill newly earned unlock flags
from recorded best waves independently of first-clear currency. Tier 3 can
also be earned by an existing Tier 2/wave 300 record. Preserve the selected
tier/fitting and the active run; do not create historical runs or repeat Salvage.

Retain the existing atomic commit, retry and writer-ownership boundaries.
Research queues, paid costs/durations, partial milliseconds, fractional income
and recovery balances, history and preferences need no replacement owners.
The current JSON size/depth/node bounds remain applicable.

The frozen foundation fixture covers both historical continuation and fresh
deployment. New deployment intentionally choosing new rules needs a separate
expected result; preserve the old continuation goldens and executable
reward-drift negative control. Do not regenerate the old fixture to match the
new game. Edition propagation also touches profile/model, wave, upgrade,
reward, shop and read-model owners beyond the plan's initial serializer paths;
reconcile those task paths before implementation.

## Additional baseline checks

At `c9c921255b8464afaa8922b8133c83d548ee601e`, the maintained wave-model
suite passed all ten checks in 8.257 seconds. It includes 5,000-wave restore,
bounded state, simultaneous final-kill/defeat, paused/speed parity and
checkpoint purchase accounting. Its eighteen-tier authoring fixture tests
catalog scalability; the shipped foundation still contains two tiers.

The three upgrade-balance checks passed in 51.550 seconds against the same
unchanged model inputs. They retain separate permanent-investment stages,
measured income-investment tradeoffs and the model-projected 10–12-hour mature
farming target. These are production-model checks, not elapsed-time play.
The original fixture and report bytes above remain unchanged. Foundation
browser qualification and the bounded 5x measurement are still pending.

The subsequent isolated 5x smoke passed 180.767 active seconds and reached wave
83 in the final summary on the declared mature Launcher fixture; cleanup's
latest observation reaches wave 84 without adding active-time credit. It retains
176 fresh observations and the rendered purchase. Storage records are cumulative
from page start: 96 matching write/readbacks, including five already present at
the first summary; the first-to-final summary delta is 91. The earlier
failed sampling run remains retained. This passing run predates the final
wallet-verifier correction; its exact driver hashes are in `baseline.json`.

For a matched 180-second before/after run on this headless Windows setup,
freeze provisional regression budgets of 85 ms mean frame interval, a p95
histogram upper bound of 100 ms, 14 MiB sampled renderer JavaScript heap and
at most 2 MiB growth from the first sample. The observed mean was 73.812 ms;
the sampled heap peak was 11,165,320 bytes. Keep the same viewport, profile,
5x setting and purchase cadence. Investigate a breach or document a paired
repeat with host variance; do not silently relax it. These are diagnostic
comparison budgets, not acceptable frame-time targets for a released game.

The passive observer does not expose WebAssembly/native total memory or CPU
cost per simulation step. Callback scheduling time is not a substitute for CPU
cost. Actual Windows/Android performance, thermal and endurance budgets require
recorded target measurements. The headless result supplies no device, listening
or ten-hour farming acceptance, and foundation hosted qualification is pending.

The retained [combat view](baseline-combat.png) and
[portrait shop](baseline-shop-portrait.png) freeze current player-facing layouts
from the same player source. The portrait image reveals a shared-header defect:
the complete level/cap string is supplied, but a 94-by-26-pixel level rectangle
wraps and truncates the cap when the current level reaches two digits. T-PRESENT
includes a real-font regression and shared-layout correction through the
existing shop-card owner, including four-digit levels and long prices. These
images preserve the baseline; they do not assert full visual acceptance.

## Qualified integration base

Foundation commit `1893bbd92135555eeb021656b38f532eb9a0cbcb` now passes
CI run `40775828783`: all 24 jobs, including all ten lifecycle shards and
the combined rendering-guardrails evidence check `123136622229`. CodeQL run
`40775828731` also passed. Fresh connector readback confirmed both workflow
completion and the unchanged PR head after the CLI watcher exited zero.
The full observation is retained in `baseline.json`; earlier failures above
remain historical evidence. This satisfies the browser integration dependency.

The approved sprint uses branch `codex/last-stand-combat-depth`, created from
that exact source in the existing worktree. PR #546 remains a draft. Native
interaction/device, audio, abnormal termination, thermal and real-duration
endurance obligations retain their existing owners. No merge or release is
implied by the green browser baseline.
