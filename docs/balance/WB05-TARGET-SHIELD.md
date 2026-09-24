# WB-05 — shield-aware hard-CPU weapon selection

Document revision: 1. Parent: `44653faf5f881d2fd5e5aae466a35eb37b6f9039`.
Delivery: PR #520, `codex/classic-weapon-balance-slice`.

## Player-visible change

A low-hull tank can still be well protected. The ordinary hard CPU previously
compared its effective-damage estimates only against hull health when choosing
a held finisher or buying one. It could therefore call the free Baby Missile a
finisher while the target still had more than 200 shield points.

The existing estimate now includes nonnegative remaining target shield for
**ordinary hard-classic play**. Both held selection and buy-to-restock use that
same requirement. Cheaper equipment still qualifies when it covers the estimate;
stronger held stock remains the fallback when no estimated finisher qualifies.
An unaffordable or tier-locked buy is still refused, and the free shell remains
the fallback when no other tool is held.

This is a heuristic correction, not an exact kill predictor or a general combat
solver. The existing effective-damage constants describe blast/burn tools;
actual damage still depends on aim, terrain, shields and subsequent effects.
Terrain-induced falls can bypass shields, so hull plus shield is not a universal
health model. No physical damage, shop price, stock, shield capacity or input rule
changes. No new tactical framework, user setting or search cost is introduced.

## Legal before/after witness

The real engine starts with stock equipment: seed17, two seats, P1 hard CPU,
one round, open walls, wind cap10, gravity0.15, arms level4, ruleset4 and decisive
starter falloff. Four accepted scripted actions establish the checkpoint:

1. P1 activates normal Shield.
2. P2 activates Heavy Shield.
3. P1 fires Sandhog at31 degrees /100 power; all effects settle.
4. P2 fires Tracer at180 degrees /100 power; all effects settle.

This is a reachable scripted checkpoint, not a claim that the ordinary CPU
would generate that opening. No health, inventory, terrain or turn injection
is used. P1 is now active with100 hull/120 shield; P2 has34 hull and
235.46804583402488 shield. P1's derived personality is conservative, matching
the ordinary caller's default, rather than a new personality supplied by the test.

| P1 next plan/result | Parent | Corrected |
|---|---:|---:|
| Weapon | Baby Missile | Heavy Missile already held |
| Angle | 31.901260184124112 | Unchanged |
| Power | 99.60460744686425 | Unchanged |
| P2 shield removed | 0 | 28.447608139341867 |
| P2 hull removed | 0 | 0 |
| Heavy Missile stock afterward | 1 | 0 |
| P1 shot stipend | 500 | 500 |
| Resolution ticks | 113 | 121 |

The corrected shot spends one existing special round and makes progress against
the shield. It does not kill the target, produce more credited hull damage, or
prove greater efficiency in every situation. The sample is evidence of the
specific selection mistake, not a win-rate, retention or human-accuracy study.

## Implementation and compatibility

`shared/src/engine/AI.ts::chooseLoadout` computes one `damageRequired` value;
its held-finisher lookup and private `chooseBuy` helper consume that same value.
The public planner API is unchanged. The quantity remains hull-only for easy,
medium and any state carrying the legacy campaign projection.

The existing nearest-enemy choice, difficulty error, ballistic search, damage
estimates and personality ordering stay unchanged. Area-denial prioritization
can still choose its preferred held tool before considering finishers. The same
computed prospective weapon purchase still participates in accessory-affordability
planning; that is not a new spending policy. Useful own-shield activation keeps
priority, including the preceding WB-04 guard against wasting/downgrading a pool.

The source review traced the ordinary consumers in `client/src/main.ts` and
`client/src/client/NetworkClient.ts`, campaign's base-plan use, public ST1 launch
composition, separate `verifiedDuel` V2/V3 selectors and retained cq1. Explicit
old logged Baby Missile commands remain legal. Fresh canonical replay reaches
the checkpoint and produces the same corrected state as direct actions.

Regenerated ordinary hard plans intentionally change; no claim of identical
old/new regenerated hard decisions or of mixed-client-version rollout safety is
made. Committed actions remain authoritative. Neither versioned verification
policies nor their artifacts are regenerated. Campaign exclusion is compatibility
containment, not dedicated Ash Road maintenance.

## Verification

Run the fast regression with the repository's pinned Node24/tsx toolchain:

```bash
node --import tsx scripts/checks/ai_target_shield.mjs
npm run check:weapon-balance
```

The first command is also imported by root-gated `weapon_balance.mjs`. There is
no new package script or dependency. Expectations are inline, not regenerated
balance tables.

Local execution used Node22.16.0 and TypeScript5.8.3 via an outside-repository
loader because the pinned toolchain is unavailable. It is not canonical CI.
The complete new test fails on parent AI at the shielded-target finisher assertion
and passes with the correction. It covers126 threshold combinations,20 real
shop/replan cases, immutable planning, old/new explicit replay and finite fallback.

An additional parent/new differential evaluated1296 synthetic states:138 plans
changed,1158 matched. Every change occurred within shielded ordinary hard play;
all936 easy/medium or unshielded controls matched, and changed plans retained the
same aim coordinates. The108 comparisons using actual campaign-engine states
matched. Four real ST1 launch profiles exercised28 commitments and12 medium-CPU
comparisons without a plan change. These are finite regression evidence, not a
universal policy proof.

Twenty-three affected source harness invocations passed, including the new and
WB-04 tests, ordinary AI/search/determinism, shields/ammo/store/arms/fall, cloning,
purity, teams, replay/lockstep, versioned CPU V2/V3, retained challenge trajectories
and the existing WB-01 gate. Targeted strict AI typechecking, syntax, all32 ST1
bindings and backend manifest validation also passed under the disclosed local
environment. The local assembly does not include every WB-03-only development
file; no full local checkout/root/client/build/browser run is claimed. All shared
runtime bytes matched the parent's verified shared digest before the single AI
change. Existing affected files start from exact published parent bytes.

An initial synthetic shop fixture used50 required damage and unexpectedly chose
Bouncing Betty, whose existing estimate is55. The fixture was corrected to56 to
isolate Missile purchase; the selector was not changed to satisfy the bad fixture.
A temporary ST1 comparison initially used an unsupported origin label; it was
corrected to `local-selection` and the full differential rerun. A session-capable
container command was unavailable before that script existed; the normal command
then wrote and completed it. These setup attempts are not counted as passing tests.

Parent CI35959849074 and CodeQL35959848906 passed without a requested rerun or
code repair. New-head CI is a separate gate. No benchmark threshold, retry policy,
workflow or historical WB/P13 expectation was weakened. The historical opt-in
P13 retained-JSON mismatch is still not a PASS, and its source identity now also
predates this intentional ordinary-policy change.

## Release and rollback limits

ST1 changes only its inspected AI binding/disposition. The backend manifest changes
only the shared-source digest, computed with the existing release helper after
verifying the parent closure. Function, migration, configuration, compatibility,
reward, save and dependency inputs remain unchanged. Digests identify source;
they do not approve deployment or certify gameplay.

No merge, production deployment, admission enablement, account reward, save reset,
other-branch write, campaign work or numerical catalog rebalance is included.
Revert WB-05 code/test wiring and its two manifest updates together to restore
WB-04 selection. The commander-name fix and all earlier slices can remain.
