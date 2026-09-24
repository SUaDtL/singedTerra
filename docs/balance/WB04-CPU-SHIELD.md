# WB-04 — useful shield decisions for the ordinary hard CPU

Document revision: 1. Parent: `ff72929b00cdfeab2f29f97070b5303cf8f7d29c`.
Delivery: PR #520, `codex/classic-weapon-balance-slice`.

## Player-visible correction

**A hurt hard CPU no longer spends a normal shield when its existing pool is
already at least as strong.** It retains that charge and uses the existing
offensive/purchase path. This prevents both a no-benefit refresh and a downgrade
from a partially intact Heavy Shield. It is a real policy correction, unlike the
counterfactual-only WB-03. It does not change the armor or weapon numbers.

The ordinary engine replaces `shieldHp` on activation; shields do not stack.
The parent planner checked hull and held stock, but not current protection.
The correction uses the normal shield capacity from the existing catalog and
preserves `SHIELD_HP_THRESHOLD = 35`. It does not add a refresh ratio, choose a
Heavy Shield, change aiming accuracy, give free actions, or prevent a human
from making the old choice. A partially depleted pool below 120 still qualifies
under the old defensive policy; whether a small refill is worth a turn remains
a different tuning question.

## A legal witness, not an injected combat state

Options: seed 17, two seats, P2 hard CPU, one round, open walls, wind cap 10,
gravity 0.15, arms level 4, ruleset 4, decisive starter falloff. Starting health,
terrain, ammunition and credits are stock. The scripted accepted prefix is:

1. P1 activates normal Shield.
2. P2 activates Heavy Shield.
3. P1 fires Sandhog at 31 degrees / power 100; the shot fully settles.

P2 now has **34 hull, 235.46804583402488 shield, and one normal shield**. P2 is
the next active seat. This demonstrates a reachable state; it does not claim
that the shipped CPU would voluntarily pick the scripted Heavy Shield prefix.

| P2 decision | Parent | Corrected |
|---|---|---|
| Selected action | Normal shield | Existing Napalm attack |
| Shield afterward | 120 | 235.46804583402488 |
| Normal charges afterward | 0 | 1 |
| P2 earned credits | 0 | 500 shot stipend |
| P1 shield afterward | 120 | Approximately 60.5 |
| Turn passes to | P1 | P1 |

The corrected Napalm uses the existing personality/weapon/search result, not a
new weapon-aware solver: angle 139.15530539420433, power 99.95989456437528.
It resolves in 206 simulation ticks. This is not a browser time or win-rate
claim. Both outcomes retain the canonical action rules and match-earned economy.

## Implementation and existing owners

Only `shared/src/engine/AI.ts::chooseLoadout` changes runtime behavior. Ordinary
local orchestration in `client/src/main.ts` and ordinary online orchestration in
`client/src/client/NetworkClient.ts` already consume that shared planner. No
second planner, lifecycle owner, UI setting or network command is added.

`shared/src/campaign/tactics.ts` also consumes the base planner. When the state
has a campaign projection, its established selection branch is retained so this
classic correction does not incidentally change old campaign planning. This is
compatibility containment, not Ash Road maintenance or a replacement-campaign
requirement.

The versioned selectors used by `shared/src/net/verifiedDuel.ts` and the retained
cq1 artifact remain independent and byte-unchanged. ST1 quick-challenge launch
composition chooses medium CPU; that branch is unchanged. This does not claim
that arbitrary regenerated ordinary hard-CPU plans stay identical: changing
that decision is the purpose of this slice.

Online replay applies explicitly logged actions through `replayNetworkAction`.
The test reaches the exact checkpoint through fresh replay, accepts an older
normal-shield command unchanged, and compares direct versus logged execution of
the corrected offensive plan. An older connected browser can still propose the
old legal command; no fleet-wide planner-version negotiation is introduced.

## Regression and compatibility evidence

Run the focused check using the existing pinned development environment:

```bash
node --import tsx scripts/checks/ai_shield_efficiency.mjs
npm run check:weapon-balance
```

The new check is imported by the existing root-gated `weapon_balance.mjs`.
The complete root and supported-toolchain browser checks remain normal PR gates;
a standalone script appearing in the tree is not being mistaken for CI coverage.

The new check failed against the exact parent AI at the harmful downgrade and
passed with the guard. Its 120-case synthetic boundary matrix covers three
difficulties, four hull values, five pools and two stock counts. Positive shield
choices strictly improve protection; other choices match the existing plan when
the unavailable normal shield is removed on a comparison clone. The legal
witness, source purity and canonical replay are checked independently.

A separately recorded parent/new differential covered 1,080 synthetic states:
54 changed precisely in the intended hard/hurt/stocked/non-beneficial condition;
1,026 stayed identical. Sixty comparisons on an actual campaign-created engine
preserved its base plans. Four real ST1 launch profiles at seed 42 executed 32
bounded commitments and compared 13 CPU turns with identical medium plans.
These finite checks support the inspected branch boundary, not a universal
proof over every possible game state.

Twenty-three local source/check commands passed, including the new regression,
ordinary AI/search/determinism, shields, ammo/store/arms, fall damage, teams,
clone/purity, replay/lockstep, versioned CPU V2/V3, nine cq1 golden trajectories,
21 challenge-workload trajectories, all 32 ST1 bindings and backend source
manifest validation. Targeted strict typechecking of AI.ts and syntax checks
also passed. See the receipt for exact execution scope.

**Local execution limitation:** Node 22.16.0 with an outside-repository
TypeScript 5.8.3 loader, not the pinned Node 24/tsx toolchain. Local source was
assembled from the uploaded main archive and exact task files; this was not a
canonical clean checkout/install or full root test. The retention check could
not start because Vite was unavailable. Two initial differential-script setup
attempts used incorrect export/accessor names; they failed before comparisons,
were corrected against actual source and the complete comparison was rerun.
Those failures are disclosed, not converted into passes.

No new full-app browser, phone, audio, Deno or disposable PostgreSQL execution
is claimed locally. Parent CI/CodeQL passed before the change. New-head hosted
results belong to the PR and are separate from this source receipt.

## Source bindings and historical evidence

The ST1 manifest changes only AI.ts's content hash and reviewed disposition;
its package binding, other sources and rules remain fixed. The backend manifest
binds all shared source, so its `verifiedReplayShared.sha256` was recomputed with
the repository's existing digest function. Function/migration/config/dependency
inputs remain unchanged. This is not a backend deployment or proof of behavioral
parity by hashing alone.

WB-01–WB-03 and P13 retained artifacts are not regenerated. Their source
fingerprints describe their original inputs. P13's historical mismatch remains
separate; unlike earlier measurement-only slices, this continuation intentionally
changes one ordinary hard-CPU input. Do not relabel old match results as current
or rebaseline them merely to suppress a mismatch.

## Scope and rollback

No price, damage, capacity, starting inventory, firing physics, human action
legality, reward, save schema, dependency, workflow or benchmark threshold is
changed. The commander-name correction stays intact. No merge, deployment,
other-branch write or production data change is authorized.

Revert the guard, its regression/import and the corresponding two source-binding
updates together to restore the parent policy. There is no inventory migration
or save reset to undo. Larger weapon-aware aiming, minimum-refresh optimization,
Heavy Shield use and global catalog tuning remain outside this slice.
