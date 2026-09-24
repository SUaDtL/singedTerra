# Classic weapon balance slice — WB-01

## Authorization and scope

B requested a weapon-balance slice and a pull request, including the commander
name correction. Ash Road is being replaced and receives no dedicated work.
This first slice implements repeatable evidence, not speculative catalog tuning.
The PR is the delivery record; this document is not another execution ledger and
does not dispatch historical recovery plans.

Baseline: `fa38cf589e2de7f2f9fba3fc0ccbd394bd630b32`.

## Deliverable

The existing P13 full-match pacing corpus remains its own evidence owner. WB-01
adds per-held-weapon comparisons, not a competing full-match runner. P13 artifacts
are retained unchanged; its stale baseline comparison is disclosed in the report.

A development-only, bounded single-salvo laboratory runs the actual classic
`GameEngine` on isolated clones. Ten explicit scenarios cover seeded terrain,
open/wrap/reflective boundaries, linear/decisive starter falloff, normal/heavy
shield preparation, four-seat free-for-all, 2v2 and a disclosed synthetic close
range. Eleven offensive/utility weapons are measured independently.

Every report separates physical hull/shield loss, score credit, self/team harm,
burial/displacement, settled terrain changes, simulation ticks, and nominal
ammunition cost. An equal-weight local aim neighborhood is sensitivity evidence,
not an estimate of human accuracy. A capped probe is unresolved, never a miss.
The existing missile search may propose coordinates; only the real selected
weapon's execution scores them. No copied physics or alternate damage formula.

The account detail view must render the authenticated commander name as
non-interactive text regardless of progression availability. It must not rely
on the separately removable masthead trigger, render names as HTML, conflate XP
sources, or retain another account's name.

## Acceptance

1. The normal root check invokes the fast WB-01 inline regression harness.
2. Repeated probes/searches are deterministic, source engines/catalogs remain
   unchanged, and returned catalog snapshots do not expose mutable live entries.
3. Inline terrain, shield, bouncing-weapon and terminal witnesses catch physical
   damage/score-credit conflation and sampling of next-round reset state.
4. Illegal inputs, unsupported multi-round/campaign contexts and oversized search
   grids fail. Time-limited work reports incomplete outcomes explicitly.
5. Reports disclose exact inputs, synthetic changes, legal preparation actions,
   search bounds, neighborhood denominators, runtime and source fingerprint.
6. Named account details survive ready/unavailable progress, trigger-only caller
   options and account switching; hostile-looking names remain text. Existing
   account controls and verified XP projection remain unchanged.
7. Canonical Node/toolchain CI is separate from adapter-based local evidence.
   No merge, deployment or live visual acceptance is implied by this slice.

## Owners and non-goals

`shared/src/engine` remains unchanged and authoritative. The lab lives under
`scripts/balance` and has no client/Edge import path. AccountSession retains
identity/auth authority; AccountPanelView only projects an already authenticated
profile. Existing mount, focus and overlay owners remain intact.

No live damage/price/ammunition/CPU-policy changes, new weapons, practice scoring
changes, campaign work, saved-data migration, account rewards, backend changes,
new dependencies, retained-artifact regeneration, or UI redesign are included.
The source-only ST1 manifest admits only the inspected `package.json` script
changes; all runtime/dependency bindings and historical challenge bytes stay fixed.
Use the measured corpus to select a later narrow tuning decision with B; do not
claim a universal weapon tier list or a proven retention improvement.

## Verification and rollback

See `docs/WEAPON_BALANCE.md` for commands and the actual evidence/limits. Reverting
the additive lab, documentation and account-view change restores prior behavior;
there is no persisted schema/economy change to reverse. Do not delete saves or
change verified receipts as part of rollback.

## WB-02 — approved continuation on PR #520

B subsequently requested “continue the next slice and add it to the PR.” This
continuation chooses the bounded shield-versus-fire opportunity-cost question,
not a blanket live catalog rebalance. Its baseline is
`e195f81bd344c0ae75d1fc4a8b224401f2d5007f`. PR #520 remains the delivery record.

The experiment compares fire/fire with normal-shield/fire and heavy-shield/fire
over at most two real commitments per seat. It evaluates Missile, Heavy Missile
and Sandhog in three existing WB-01 scenarios, with both subject seats and both
stock and explicitly synthetic depleted-stock/30,000-credit checkpoints. Real
buys enforce whole-bundle affordability and store tiers. A refused offensive
restock falls back to basic ammunition; an unexecuted shield is never credited
as a successful shield strategy. The opponent is the declared greedy WB-01
experimental policy, not the shipped CPU or a human model.

### Additional acceptance

1. Source engine/catalog stay unchanged; actual exchange stock must never be
   replaced with WB-01's probe ammunition. Keep fixed-aim tests distinct from
   adaptive search experiments. Preserve WB-01 and P13 historical bytes.
2. Purchases record exact accepted/rejected outcomes, debits and granted stock.
   Starting stock, unused bundles and nominal replacement value stay distinct.
3. Both seats use the real turn order. Shielding consumes a commitment and
   grants no shot stipend. Real terminal state stops all subsequent actions.
4. Turn-horizon survivors are censored, not wins/draws. Blocked or unresolved
   results have no settled summary. No partial damage or unexecuted shield
   can establish comparative advantage.
5. Fast inline checks join `check:weapon-balance`; expensive study generation
   remains opt-in. Invalid CLI/fixture selections fail, existing reports are
   not overwritten, and the complete study is repeatable with pinned source.
6. Retain commander identity, account/reward authority, all live balance/CPU
   behavior, replay/ST1 semantics and campaign code. Update only the inspected
   package-script source binding; no dependency, backend, migration or runtime
   source change. No merge/deployment or auto-enablement.

See `docs/balance/WB02-SHIELD-EXCHANGE.md` for method, findings and evidence
limits. Revert WB-02-only scripts, development command wiring and documentation
to undo this continuation; the preceding commander fix can remain. No stored
player state or live balance migration exists to roll back.

## WB-03 — one opening-access candidate and CI diagnosis

B requested CI corrections and the next slice on PR #520. Baseline:
`dc94110c25bb2098a5b91999d80acbd1583ea66d`. The selected candidate removes only
one free starting Heavy Shield on each disposable experimental tank, preserving
normal shields, capacities, shop prices and all other state. This does not
authorize enabling the candidate in the game.

Reuse the WB-02 action runner with an explicitly bounded horizon (four
commitments per seat here; original default two preserved). Compare a
strongest-beneficial-held-shield-first policy and fire-first controls on
matched stock/candidate states. Defensive purchases/refresh are excluded; real
offensive restocking and the engine's terminal state remain authoritative.

### Additional acceptance

1. Exactly two declared starting-inventory count changes, with no refund or
   runtime default change. Fail closed when the assumed starting kit changes.
2. Eighteen fire-first controls match except unused heavy inventory; reject
   mismatched state, aim policy and horizons before comparative reporting.
3. Keep unexecuted defense and incomplete results separate from measured
   benefit. Horizons are not wins/draws; preserve actual initiative and ledger.
4. Normal-shield fallback is based on held stock and marginal protection. Do not
   buy a missing heavy shield merely to undo the experimental intervention.
5. Preserve WB-02's default outputs and historical artifacts. The new study is
   opt-in; its small regression check uses the existing balance check entry.
6. Preserve every live runtime, verification/replay, reward, account and campaign
   rule. The commander-name fix remains. No merge, deployment or new dependencies.
7. Diagnose actual hosted CI failures. Preserve the strict replay threshold and
   complete failing samples; one explicitly recorded rerun is not a new retry
   policy or proof of permanent performance remediation.

See `docs/balance/WB03-OPENING-SHIELD.md` for the resulting recommendation,
measurements, limitations and rollback. PR #520 remains the delivery record;
this is not a competing execution ledger or a dispatch of future tuning.
