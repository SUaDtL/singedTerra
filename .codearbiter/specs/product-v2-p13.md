# P13 deterministic balance and pacing baseline

The owner explicitly requested continuing the original plan's improvement phase
after recovery on 2026-09-13. This implements the existing P13 scope and four
acceptance criteria from `singedterra-plan-v2.json`; the review package alone is
not authorization. Parent: Astra/high. Author: Terra/high. Reviewer: Sol/high in
a fresh context. The sole execution ledger remains
`../evidence-recovery-v2/.codearbiter/plans/evidence-recovery-v2.md` relative to
the worktrees directory.

## Problem

Existing deterministic checks protect rules and verified replay, but provide no
versioned baseline of full-match pacing and tactical outcomes for selecting the
next practice challenges. The maintainer needs inspectable observations before
proposing tuning.

## Approach and scope

Use the existing GameEngine, AI planner and Quick Operation composition in an
offline evaluation script. Retain a small JSON dataset and readable HTML report.
Full traces cost more than aggregate win counts, but expose capped matches,
non-damaging streaks, invalid preparations and long resolution directly.

Measure team targeting, restricted-arsenal restock, multi-round gravity, Battery
input, Shield and terrain changes. Use real actions; label any scripted opening.
Do not modify gameplay, verified policy, browser UI, dependencies, production,
accounts or telemetry. Do not equate bot results with player enjoyment or waiting
time. Human observations can be added later as separately sourced evidence.

## Decided parameters

- Source baseline: `3a2f7eda7fd0738e58a716d43054d377e238e3f7`.
- Corpus version `p13-v1`, ruleset 4, explicit runner/policy version and resolved
  options on every observation. Hash the relevant source inputs so a recorded
  revision cannot silently describe changed engine or runner bytes.
- Eight scenarios, seeds 17 and 42: standard, crosswind, caldera, siege, team,
  restricted restock, scripted Battery, scripted Shield. Scenario definitions
  must exercise the named mechanism or report that it was not exercised.
- Diagnostic cap: 48 policy turns, 72 for siege; 5,000 settlement ticks per shot.
  A cap produces an inspectable incomplete result. It is never a completed match
  or proof of a softlock. Inspection thresholds are visibly documented.
- First real execution has a 120-second budget. Record observed duration outside
  the deterministic dataset. If too slow, decompose the run without silently
  dropping scenarios or reducing proof.
- Keep baseline generation explicit; do not add the complete corpus workload to
  every ordinary engine check without measured cost. No dependency installation.
- Start with no tuning proposal. Any later proposal must name a player problem,
  source observations and proposed change.

## Acceptance criteria

1. **P13-AC1:** A repeated run of the same versioned corpus and source inputs
   produces byte-identical JSON and report data, including resolved mode/seed,
   seat/team/difficulty/arms settings and policy provenance.
2. **P13-AC2:** The report labels automated and scripted evidence explicitly and
   states that it does not establish human enjoyment, retention or unbiased
   balance. No invented human observation is present.
3. **P13-AC3:** Every run includes outcome or cap, turns/ticks, damage streaks,
   weapon/purchase/Shield/Battery/terrain signals and a compact action trace.
   Mechanism coverage and missing execution are explicit, so prolonged or
   concentrated behavior can be inspected rather than hidden in averages.
4. **P13-AC4:** A nonempty tuning candidate without a player problem, observation
   references and proposed change is refused by validation. The first dataset
   records that no tuning is proposed from bot evidence alone.

## Verification and implementation order

1. Author the runner's data contract and failing behavior tests for the four
   criteria, including missing mechanisms and invalid tuning records.
2. Implement the minimal runner/reducer/report using existing owners. Execute all
   scenarios and retain actual errors or caps, then repeat for deterministic proof.
3. Run the applicable existing checks, build and independent Sol/high review;
   parent integrates only accepted source and evidence. The corpus is not browser,
   physical-device, database or player-observation evidence.

## Completeness challenge and rollback

Matching JSON alone could reproduce the same misleading metrics twice. Therefore
the tests must check metric meaning with controlled known trajectories/actions,
and the report must distinguish attempted from accepted preparations. A terrain
mutation is an evaluator signal, not a newly introduced gameplay objective.
No unresolved product fork blocks this offline baseline. Remove its registration
and generated observations to roll back; gameplay and historical receipts remain
unchanged.
