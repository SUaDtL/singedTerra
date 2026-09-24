# Classic weapon balance laboratory — WB-01

This **per-weapon measurement slice** extends the existing balance tooling; it
is not a live balance patch. The weapon
catalog, artillery physics, CPU policies, network/replay versions, retained
challenge artifacts and match economy are unchanged. Ash Road is out of scope.
The accompanying small production fix restores the commander name in account
details independently of the masthead trigger.

## Relationship to the existing P13 corpus

`scripts/balance/p13BalanceCorpus.ts` already owns a full-match pacing corpus,
including real CPU actions, purchases, turn caps, shields and multi-round behavior.
Its retained `docs/balance/p13-v1.*` artifacts are not replaced or regenerated here.
WB-01 answers a different question: what can each held weapon do from the same
starting state when complete physical effects and aiming sensitivity are measured?
It removes CPU weapon-choice bias from that particular comparison, but does not
replace P13's opponent-response or purchasing evidence. Both use the same engine;
there is no second physics implementation or new generalized evaluation framework.

The existing `scripts/checks/balance_pacing.mjs` was also attempted. Its repeat-run
and behavioral assertions reached the retained-JSON comparison, which failed:
the old P13 artifact differs in source inventory/provenance and recorded outcomes.
The P13 runner and all its measured source inputs are unchanged in this slice.
Do not treat that old artifact as fresh current-main evidence or regenerate it
merely to hide the failure. Its separately versioned refresh is outside WB-01.

## Run it

Use the repository's `.nvmrc` and lockfile with the ordinary development setup.
No additional dependency, service, account, browser or backend is required for
the balance runner.

```bash
npm run check:weapon-balance
npm run balance:weapons -- --out=/tmp/wb01.json
npm run balance:weapons -- --scenario=shield-7 --weapon=sandhog --out=/tmp/undercut.json
```

The output path must not already exist. Without `--out`, JSON goes to stdout
and progress goes to stderr. Unknown/repeated options, unknown IDs, write errors
and changes to measured source during the run fail with a nonzero exit status.
Use `--help` for the supported options. Output is generated on demand; the lab
is not imported by the game and adds no startup/runtime simulation work.

The fast inline witness check is also part of `npm run check`. The full study is
opt-in: running the whole corpus in every CI job would add cost without making
the observations into evidence of enjoyable balance.

## Corpus and fixture authority

| Scenario | What it isolates |
|---|---|
| `open-42`, `open-7` | Different seeded terrain with open boundaries and decisive starter falloff. |
| `linear-42` | Same seed with linear starter falloff; do not merge these profiles silently. |
| `wrap-13` | Both firing directions, including wraparound routes. |
| `reflective-7` | Reflected sidewall behavior in the real engine. |
| `shield-7` | Every seat legally activates a normal shield before the sampled turn. |
| `heavy-shield-42` | Every seat legally activates a heavy shield before the sampled turn. |
| `four-seat-42`, `teams-42` | Four-seat free-for-all versus team membership/collateral accounting. |
| `near-calm` | **Synthetic** x positions 190/480, grounded with `surfaceAt`, wind zero. |

All fixtures use one round, arms level 4, wind cap 10, gravity 0.15 and the
protected-floor ruleset 4. The report records actual wind and each tank's
starting coordinates, health, shield, team and credits, not merely option caps.
Shield preparation changes turn/wind state, so it is disclosed and is not
claimed to be an otherwise identical opening. No exact-mode or client-entry
parity is asserted just from choosing an engine option tuple.

On each disposable clone, the sampled finite weapon is given **one round**;
the basic shell stays unlimited. This is controlled ammunition access, not a
claim the weapon can be purchased with the starting credits. Base terrain,
health, inventory and RNG state are never mutated by a shot probe. The only
scenario-level synthetic modifications are explicitly listed above.

The selected roster is Baby Missile, Missile, Heavy Missile, Nuke, Cluster Bomb,
Bouncing Betty, Sandhog, Riot Bomb, Napalm, Dirt Bomb and Tracer. It is not the
entire catalog. Shields are prepared conditions, not fired projectiles.

## Method: real effects, bounded search, no invented score

Every candidate executes select/angle/power/fire through `GameEngine.applyAction`
and advances fixed ticks on a fresh clone. The observer stops at the real next
`PLAYER_TURN` or `GAME_OVER`. Classic elimination may cancel remaining effects;
that existing terminal rule is respected. Multi-round engines are rejected to
avoid accidentally measuring freshly reset tanks. Campaign contexts are rejected.

The default grid samples angles 0–180 in steps of 10 and power 0–100 in steps
of 20, including endpoints: 114 initial candidates. The existing hard missile
search offers at most one additional coordinate per enemy. These are only
proposals; the actual selected weapon rescores every one. The two leading
candidates receive fixed local refinement (seven angle offsets by five power
offsets). Duplicate/illegal coordinates are not evaluated again. Search is
sequential and has a 1,000-coarse-candidate guard; each actual-engine probe has a
2,048-tick ceiling. A cap hit remains `unresolved` with no partial damage score.

The diagnostic selection order is enemy hull loss, enemy shield loss, burial,
lower self/ally hull loss, lower angle, lower power. **This is not a general
utility function or a weapon ranking.** It does not optimize survival, future
position, scarce ammunition or fun. A zero sampled result is not proof that no
useful shot exists. The final report includes its chosen coordinate and ranging
proposals so a narrower follow-up can reproduce and challenge the result.

Sensitivity samples angle offsets −1/0/+1 and power offsets −2/0/+2 around the
chosen aim. Invalid boundary coordinates are omitted rather than clamped into
duplicates. Each row reports its actual denominator, unresolved count, damaging
count, minimum and mean hull loss. Equal weights are a controlled perturbation
experiment, not a measured human error distribution or player hit probability.

## Reading the measurements correctly

- **Hull/shield loss and eliminated tanks** are physical before/after results.
  Credited damage/kills are separate engine scoreboard changes. Neither grants
  account rewards. Vertical displacement is not itself a damage-source label.
- **Terrain changes** are settled bitmap occupancy differences. Collapse can
  move solid pixels; these counts are not a pure excavation-volume measurement.
  Utility weapons cannot be judged by enemy hull loss alone.
- **Ticks × 16** is simulation duration, not measured browser wait time. The
  report also records burn ticks, peak projectiles and sidewall contacts.
- **Nominal ammunition cost** is price divided by bundle size, except the
  unlimited basic shell costs zero. `nominalNetCredits` subtracts that fraction
  from observed shot income; it does not simulate buying, affordability, an
  inventory budget or multi-round interest. Preparing shields consumes turns
  before sampling; opponent response and defensive opportunity cost are not modeled.

There is no global tier list, win-rate result, performance benchmark, universal
best aim, campaign-economy conclusion or automatic recommendation to nerf a
weapon. No aim-space exhaustion is claimed.

## Measured starting points for the next balance decision

The inline witnesses deliberately distinguish outcomes the catalog alone misses:

| Setup and accepted input | Actual result |
|---|---|
| `open-42`: Sandhog 21° / 100 | 30 enemy hull lost; 52-pixel fall; zero score-credited damage. |
| `shield-7`: Sandhog 35° / 100 | 57 enemy hull lost; 70-pixel fall; enemy shield unchanged. |
| `open-7`: Betty 34° / 100 versus 25° / 100 | 0 versus approximately 44.337 enemy hull damage using the same weapon. |
| `open-42`: Heavy Missile 28° / 100 | Terminal 100-hull elimination; zero credited kills. |

The sampled corpus additionally finds a 100-hull Betty result at 20° / 100 on
`open-7`, and a wraparound Betty result at 166° / 20 on `wrap-13`. These do not
establish typical damage or justify a global nerf. They support testing actual
weapon behavior rather than pricing a weapon from a missile-proxy landing point.

**Recommended next tuning decision:** choose one bounded interaction with B—
for example the basic/Missile/Heavy Missile relationship including fall damage,
or normal/heavy shield counterplay—and evaluate cost plus opponent response.
Do not simultaneously alter blast, fall damage, shielding, prices and starting
inventory: that would obscure the reason the result changed. This PR does not
implement that later policy or modify protected verification behavior.

## Reproduction evidence and limits

The companion [baseline table](balance/wb01-baseline.tsv) records all measured
scenario/weapon pairs. Its source fingerprint, work totals and execution receipt
are in [the baseline receipt](balance/wb01-receipt.json). Generate full JSON with
the CLI for per-tank effects, terrain, catalog snapshots and sensitivity samples.
SHA-256 fingerprints identify source bytes only; they are not replay authority.

Local evidence used Node 22.16.0 and TypeScript 5.8.3 through a disclosed temporary
source-loader because the pinned Node 24 toolchain/dependencies were unavailable.
The loader was outside the repository and is not introduced as a new supported
runtime or test bypass. Two full study runs produced identical deterministic
rows. Seventeen targeted source checks passed, including WB-01, determinism,
weapons, motion, airburst, Sandhog, shields, ammunition, store, arms levels,
teams, fall damage, clone parity, AI search/determinism, weapon contracts and
replay determinism.

An isolated Chromium fixture exercised the original AccountPanelView source
before/after the commander correction, with ready/missing progression,
HTML-like names, account switching and sign-out. This is not the full game,
visual approval, canonical Vitest or supported-toolchain build evidence.
The new `AccountPanelIdentity.test.ts` runs under the existing client Vitest gate.
Canonical full client tests, `typecheck`, `build` and root checks remain CI/merge
requirements. The attempted local shared typecheck was blocked by missing Vitest
types in existing campaign tests; the backend-policy/manifest command could not
start without its installed TypeScript dependency. The ST1 source manifest updates only the reviewed `package.json` hash for the
new development commands; dependency, runtime and ruleset semantics are unchanged.
No dependency changes or retained-artifact regeneration were used to make those gaps disappear. No merge or deployment is authorized here.
