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
