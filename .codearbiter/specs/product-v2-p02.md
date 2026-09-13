# P02 first meaningful shot

**Approval:** The maintainer's authorized v2 campaign continuation, relayed for this isolated worktree, approves this bounded P02 specification.

## Problem

An anonymous visitor currently sees several Quick Duel conditions before the game has shown why angle, power, wind, and firing matter. The first local match can instead offer one explicit short duel while preserving every established route.

## Approach

Add a named `first-salvo` Quick Operation that projects only `rounds: 1` through the existing Quick Duel composition seam. A browser with no recognized First Salvo preference receives one primary Start First Salvo action and may disclose the established Quick Duel choices; the existing coach remains the only instructional owner. This keeps the engine, online contract, and regular three-round defaults intact at the cost of treating unavailable browser storage as an unseen local preference.

## Scope

In scope: the local chooser, Quick Operation catalog/composition, First Salvo preference interpretation, focused client coverage, and a versioned offline P01 record extension for optional manually observed elapsed time.

Out of scope: engine or AI changes, a second coach, network/protocol work, automatic client telemetry, accounts, an analytics service, collecting participant data, or claiming newcomer understanding, retention, or replay behavior.

## Decided parameters

- `first-salvo` is an explicit local Quick Operation with `rounds: 1`; its roster, generated unsigned seed, and medium CPU remain the existing Quick Duel composition.
- A recognized `v1:completed` or `v1:skipped` First Salvo preference exposes the ordinary chooser with Standard Duel selected. Malformed, missing, or unreadable storage is harmless and exposes the introductory CTA.
- An available rejoin keeps its existing priority and suppresses the introductory CTA.
- The existing First Salvo coach and preference key remain the sole tutorial authority; this feature adds no overlay, preference, observer, or telemetry sender.
- `p01-manual-v1` remains byte-for-byte valid under its existing exact-key rules. `p02-manual-v2` may include an optional `guestEntryToFirstShotMs` non-negative safe integer only when both `guestEntry` and `firstShot` are `yes`; absence means not observed.
- No actual manual observation or retention begins until the owner confirms the P01 consent and retention policy.

## Acceptance criteria

1. **P02-AC1:** `quickOperationOptions('first-salvo', base)` returns a fresh deterministic options object whose only introductory projection is `rounds: 1`; Standard Duel retains the supplied three-round value.
2. **P02-AC2:** With an unseen, malformed, or unreadable First Salvo preference and no rejoin, the chooser exposes exactly one primary `Start First Salvo` action, routes it once to `first-salvo`, and keeps Local Battle, Play Online, and a disclosure for ordinary Quick Duels available.
3. **P02-AC3:** With a completed or skipped preference, the chooser returns to the ordinary Standard Duel selection; with a rejoin candidate, Rejoin is the sole primary action even if the preference is unseen.
4. **P02-AC4:** Launching First Salvo uses the existing two-seat Quick Duel composition with a generated seed and `rounds: 1`; the existing Standard launch remains a generated-seed, three-round local duel.
5. **P02-AC5:** `p01-manual-v1` keeps its prior strict accepted shape, while `p02-manual-v2` accepts an absent optional timing field and rejects timing that is negative, unsafe, or present without observed guest entry and first shot. Aggregated funnel counts remain unchanged.
6. **P02-AC6:** The manual templates state that elapsed timing is optional owner observation, not in-app telemetry, and that human understanding, replay behavior, and retention remain unproven pending owner-approved consent and retention handling.

## Original P02 evidence map

| Original criterion | Automated proof | Human evidence boundary |
| --- | --- | --- |
| A newcomer can reach and understand a meaningful shot without prior terminology. | AC1–AC4 prove the reachable route, explicit one-round composition, and existing coach ownership. | Understanding requires a consented observed participant and is not accepted by automated tests. |
| The existing coach has one authority. | AC2–AC4 exercise the chooser and existing First Salvo preference seam without adding another coach. | No human result is implied. |
| First-session variant and regular three-round operation remain distinct and deterministic. | AC1 and AC4 cover operation projection and launch composition. | None required for source-level proof. |
| Time-to-value and replay data are captured without coercive prompts. | AC5–AC6 validate optional offline timing and retain the P01 voluntary-replay field without runtime collection. | Recording, retention, and interpretation await owner policy and consent. |

## Open questions

None blocks the local implementation. Actual human observation remains intentionally pending the owner-confirmed P01 policy.

## Adversarial review

The most likely false conclusion is that a one-round CTA proves a newcomer learned the game. It proves only route and composition behavior. The feature therefore retains the existing observation boundary and fails closed from a retention or understanding claim.
