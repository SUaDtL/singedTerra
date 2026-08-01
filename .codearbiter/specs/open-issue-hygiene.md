# Sprint spec: Open Issue Hygiene

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and its plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

The repository has 16 open GitHub issues, all filed before a month of concentrated delivery. Several describe work that is now implemented, one recommends an optimization that later analysis proved incorrect, and several bundle completed and remaining work in stale descriptions. Leaving that inventory unchanged makes the actual roadmap harder to trust.

## SMARTS decision

Choose a read-only source-and-production audit followed by narrowly reviewed GitHub issue dispositions.

| Lens | Evidence-backed issue hygiene | Continue visual feature work | Close every old issue |
|---|---|---|---|
| Scalable | Strong. A disposition record gives later audits a repeatable evidence shape. | Weak. The backlog drifts further while delivery continues. | Weak. Age alone does not scale into a reliable decision rule. |
| Maintainable | Strong. Completed, partial, and current work become distinguishable. | Weak. Engineers must rediscover which premises still hold. | Weak. Valid work and security concerns disappear with stale items. |
| Available | Strong. No runtime or deployment surface changes. | Strong. Runtime work can continue, but planning inputs remain noisy. | Strong operationally, but at the cost of roadmap integrity. |
| Reliable | Strong. Each closure requires current source, test, or live evidence. | Weak. Issue state remains an unreliable proxy for project state. | Weak. Unverified bulk closure loses real defects. |
| Testable | Strong. The report, live issue state, repository checks, and exact PR diff are inspectable. | Weak. There is no acceptance oracle for leaving known drift. | Weak. A closed count cannot prove the premise was resolved. |
| Securable | Strong. Security, auth, crypto, secret, dependency-policy, and migration items remain open and untouched. | Adequate. No new risk, but stale security descriptions can mislead. | Unacceptable. It would silently clear hard-gated work. |

**Recommendation:** Evidence-backed issue hygiene. Strength: **strong** across Maintainable, Reliable, Testable, and Securable.

## Scope

- Inventory every open issue against deployed `main` commit `7d4deb845a9a40c03aa304d073d8f574c41c1997`.
- Record one of three dispositions: close as completed, close as not planned because the premise is invalid, or retain with a current-scope note.
- Close only issues whose acceptance goal is fully satisfied or disproved.
- For partial issues, add a concise canonical status comment and narrow the title where that materially improves the open list.
- Preserve security, auth, crypto, secrets, dependency-policy, migration, and irreversible-operation issues without mutation.
- Make no production, dependency, workflow, migration, or deployment change.

## Acceptance criteria

1. All 16 issues present at audit start appear in the disposition report.
2. Every proposed closure cites current source/test/live evidence and relevant merged PRs.
3. Partially completed issues retain their unresolved work; no valid remainder is silently closed.
4. Security issue #69, security-policy issue #110, and migration issue #125 remain open and unchanged.
5. The exact report and planned issue actions receive one adversarial review with no unresolved merge blocker.
6. The governance-only PR clears hosted CI on the exact reviewed head and merges through the PR.
7. Only after the report merges are its reviewed GitHub issue mutations applied and verified.

## Non-goals

- Implementing any retained issue.
- Changing game behavior, documentation outside `.codearbiter/`, dependencies, CI, Supabase, or production.
- Treating low priority as obsolete.
- Closing a hard-gated security or migration item.
