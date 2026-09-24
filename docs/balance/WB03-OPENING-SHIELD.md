# WB-03 — Free starting Heavy Shield candidate

Document revision: 1. Parent: `dc94110c25bb2098a5b91999d80acbd1583ea66d`.
Delivery: PR #520, `codex/classic-weapon-balance-slice`.

## Decision from this slice

**Retain the current live starting kit. Do not remove the free Heavy Shield by
default on this evidence.** This is a recommendation, not a newly approved
balance policy. The candidate remains isolated in development experiments.

The proposed removal affects a player's option to spend a turn on stronger
protection. It does not address the shipped CPU's redundant normal-shield
activation, selected-weapon aiming, or the value of terrain tactics. Shortening
some exchanges by killing the defender earlier does not establish a better
match. Further blanket shield-capacity/price changes are not justified here.

This closes one candidate evaluation rather than opening another general
simulation framework. A later player-facing correction should target a
specific observed bad decision or an explicitly selected balance rule, with
its own compatibility review. No additional campaign work follows from this study.

## Run and ownership

```bash
npm run check:weapon-balance
npm run balance:opening-shield -- --out=/tmp/wb03.json
npm run balance:opening-shield -- --scenario=open-42 --weapon=missile --out=/tmp/wb03-missile.json
```

The existing CLI also accepts `--study=opening-shield`. Existing output paths,
unknown/repeated options and invalid scenario/weapon IDs fail. The full study is
opt-in. The small `scripts/checks/opening_shield.mjs` joins the existing balance
gate; no dependency or runtime import is added.

`openingShield.mjs` uses WB-02's actual-action exchange runner, which now accepts
a bounded 1–6 commitments per seat (default 2 unchanged) and an explicitly
selected held-shield policy. WB-02's three-strategy matrix still uses its original
two-commitment defaults. WB-01 and P13 remain their existing evidence owners.

## The one intervention

| Input | Stock profile | Candidate profile |
|---|---|---|
| Free Heavy Shields per seat | 1 | 0 |
| Free normal shields per seat | 1 | 1 |
| Shield capacities | 120 / 240 | Unchanged |
| Prices and bundle sizes | Actual catalog | Unchanged |
| Other ammunition, hull, terrain, credits and RNG | Stock | Identical |

The candidate changes only `inventory.heavy_shield.count` on both newly created
experimental tanks. It grants no refund, does not delete saved inventory, and
is not available as a live match setting. The constructor fails closed if the
starting shield contract has changed and needs a new evaluation.

The subject's `held-shield-first` policy selects its strongest held shield
that strictly increases its current protection on the first commitment. It
uses Heavy Shield in the stock profile and normal Shield in the candidate.
It does not buy the removed item immediately or refresh defense later. No
beneficial held shield means a recorded fallback to offense. The opponent fires
the requested weapon on each turn. **This is not the shipped CPU policy.**

The fire-first negative control uses neither shield. Every paired trace and
result must be identical except for the unused Heavy Shield inventory. This
catches an intervention that accidentally changes unrelated starting state or
execution behavior. Both profiles retain ordinary whole-bundle offensive
restocking and basic-shell fallback through the engine.

## Coverage and results

Three boards (`open-42`, `open-7`, `wrap-13`), three offensive tools (Missile,
Heavy Missile, Sandhog), both subject seats, two policies and two profiles
produce **36 pairs / 72 exchanges**. Each runs up to four real commitments per
seat, or an actual engine terminal state. P1 remains first; P2 is not given a
fabricated initiative change.

| Classification | Pairs |
|---|---:|
| Fire-first controls identical except unused inventory | 18 |
| Both declared defenses executed and compared | 16 |
| Subject eliminated before its defense could execute | 2 |

The 72 executions include 65 actual terminals and 7 censored horizons. This is
not a win-rate population or a result that 65 typical matches finish in this
time. Zero search candidates were unresolved in this measured corpus. The same
complete study reran with byte-identical JSON.

Representative paired outcomes (candidate means no free Heavy Shield):

| Board / weapon / subject | Stock result | Candidate result |
|---|---|---|
| `open-42` / Missile / P1 | 46.55 hull, horizon | 0 hull, actual defeat |
| `open-42` / Sandhog / P1 | 45 hull, horizon | 23.98 hull, horizon |
| `open-7` / Sandhog / P1 | 36 hull, horizon | 6.95 hull, horizon |
| `open-7` / Heavy Missile / P1 | Defeat after 455 simulated ticks | Defeat after 263 simulated ticks |
| `wrap-13` / Heavy Missile / P1 | 38 hull | 24.60 hull |

Four of the 16 executed-defense pairs leave less subject hull under the
candidate. Two additional pairs end in the same defeat earlier. Other pairs
can retain the same hull/outcome while ending with different shield reserves.
Terrain attacks remain relevant; protection is not a universal substitute for
position. These observations are counterexamples to a blanket access nerf, not
proof the existing shield values are optimal.

The ordinary AI's `chooseLoadout` currently selects normal `shield`, not
`heavy_shield`; its effective-damage roster does not include Heavy Shield.
The fast check verifies equal initial plans with/without free heavy for three
difficulties at two hull states. Do not report this candidate as fixing the
CPU's shield waste or its weapon selection. Those are separate behaviors in
`shared/src/engine/AI.ts` and remain unchanged.

## Interpretation limits

These are deterministic, perfect-information, damage-led experimental replies,
not human accuracy, optimal survival play or the game's normal CPU. Both
profiles share the same policy, search bounds and declared horizon. One
subject shields against an attacking opponent; both-players-shielding behavior,
movement, later shield purchases, multi-round carry, and player enjoyment are
not measured. Simulation ticks are not browser wall-clock time.

The helper rejects mismatched inputs, methods and horizons before comparison.
An unresolved result has no settled summary. An unexecuted shield is explicitly
excluded from defense comparisons. Horizon survivors are never called winners
or draws. All raw starts, inventories, trace actions, purchases, endings and
separate deltas are retained in the generated JSON.

[The table](wb03-baseline.tsv) and [receipt](wb03-receipt.json) bind the measured
source fingerprint. The table uses `NA` for an absent winner, not an inferred
draw. No global utility score or probability is derived from these cases.

## CI diagnosis and verification boundary

WB-02 CI run `35948022187`, attempt 1, failed after all 73,124 exhaustive cases
passed: one strict replay sample was 101.439263 ms against `<100 ms`. It stopped
before the new balance checks. The runtime, benchmark, lockfile and workflow
inputs were unchanged by WB-02. One explicit failed-jobs rerun passed all nine
jobs, including root checks, database regressions, client tests, build and
browser/Edge lanes. CodeQL also passed. No benchmark threshold, warmup, sample
selection, workflow or retry policy was modified. This cleared that run, not a
claim that shared-runner timing variability is permanently solved.

Local WB-03 evidence uses Node22.16.0 and an outside-repository TypeScript5.8.3
loader because the pinned Node24/tsx toolchain is unavailable here. A local
attempt at the same strict benchmark failed (max 154.41 ms); it is not substituted
for the hosted supported-runtime pass. Benchmark contract tests passed 7/7.
Twelve targeted source harnesses, seven CLI failure/help checks, ST1's 32 source
bindings and source syntax checks passed. The first new fixed-aim test used 90°
and terminated through actual self-damage; it was corrected to the existing
180° miss fixture, not accommodated by loosening the assertion. A command-time
budget interrupted initial combined runs; completed individual reruns and both
complete study receipts are retained separately.

The 105 purchase entries and all 144 ending tank inventories were reconciled
against recorded purchases and accepted actions. All 18 negative controls
retain identical traces. The WB-02 default study was rerun for parity against
its retained full results: all 108 rows, fixtures and method fields match.
Historical tables and receipts were not regenerated. A pre-publication CLI
dispatch typo was caught by that check, fixed, and covered by four fast
child-process dispatch regressions; the final complete study was then repeated.
Canonical new-commit CI remains a separate requirement; no local full client,
normal-entry browser, physical-device or production acceptance is claimed.

## Compatibility and rollback

All shared/client/Edge runtime sources, game rules, dependencies, migrations,
retained verification artifacts, WB-01/WB-02/P13 baselines and the preceding
commander-name correction are unchanged. Only the package's additive development
commands require an updated ST1 package source hash; other bindings remain fixed.

Revert WB-03's additive experiment/check/documents and restore the parent runner
and script wiring to undo this slice. No saved data, shield entitlement, economy
migration, server deployment or player inventory needs reversal. No merge or
production change is authorized.
