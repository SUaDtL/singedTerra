# R05 proposed main protection change

Status: preparation only; no settings or production changes applied. R04 is locally verified, with hosted evidence pending. R05 requires independent assigned review, explicit owner approval, fresh pre-application comparison, and recorded after-state evidence before acceptance.

Prepared by `gpt-5.6-terra/high`, session `01a089fb-2bf9-7c21-b66d-a2f9f24b4455`, against integration `a4f332033d69d7d0afeb28d32d5efd210ded07d0`. Parent transcribed the bounded proposal after integrating R03 as `c7ab4912973cafaed529914890ff0781e41b1946`. This document is not approval or an applied-policy record.

## Observed policy and minimum proposed change

Repository: `SUaDtL/singedTerra`, branch `main`. Read-only GitHub API observations from the parent and assigned worker agree. The current CI job names come from `.github/workflows/ci.yml` and observed GitHub Actions checks.

| Setting | Observed before | Proposed after |
|---|---|---|
| Strict required checks | true | true |
| Core check, app 15368 | `typecheck · harnesses · build` | unchanged |
| Edge check, app 15368 | `edge function tests (deno)` | unchanged |
| Browser check, app 15368 | absent from required checks | add `e2e · rendering guardrails` |
| Enforce branch protection for administrators | false | true |
| Required PR approvals | 0 | 0 |
| Force pushes / deletion | false / false | unchanged |

Preserve all other settings exactly, including no stale-review dismissal, code-owner requirement, last-push approval requirement, restrictions, or rulesets. The zero-review setting remains deliberate for the current sole-maintainer workflow. Enforcing branch protection for administrators requires the checks; it does not create an independent human reviewer.

The intended required-check body is:

```json
{
  "strict": true,
  "checks": [
    { "context": "typecheck · harnesses · build", "app_id": 15368 },
    { "context": "edge function tests (deno)", "app_id": 15368 },
    { "context": "e2e · rendering guardrails", "app_id": 15368 }
  ]
}
```

After approval and dependency clearance, use narrow required-status-check and administrator-enforcement operations rather than replacing the whole branch-protection object. Capture the full before-state first and compare it to the approved proposal. These operations are not atomic: record each result and any partial application. Do not represent a failed second operation as success or silently restore settings without applicable approval. No mutation command has been executed by this preparation.

## Pages boundary and rollback

The live `github-pages` environment has only main-branch eligibility, no required-reviewer or wait-timer rule, and `can_admins_bypass=true`. That environment setting is separate from branch `enforce_admins`. Changing it would not create owner approval. No environment change is included in this minimum proposal.

Once R04 reaches main, qualifying main pushes automatically run Pages. Its workflow binds the exact successful CI attempt, builds and tests one artifact, revalidates CI and current main under the Pages lock, and publishes. Approval to merge must therefore account for automatic deployment.

A rollback is a separately approved production operation. Use only the rollback-only manual workflow path, supplying the exact prior successful trusted Pages push run, its source SHA, the owner-reviewed current main SHA, and `ROLLBACK`. The accepted artifact must be the one unexpired `github-pages-<run-id>` artifact from the trusted run; it is reuploaded unchanged, without rebuilding. Record the owner's approval, selected run/artifact/SHA, retained protections, and result. The `ROLLBACK` input prevents accidental dispatch but is not independent approval evidence. Expired or missing artifacts remain a recovery limitation; protections are not disabled to bypass it.

## Documentation content after verified application

Add a `Main protection and Pages rollback` section to `docs/DEVELOPMENT.md` only after policy application is verified. It should state the three app-bound required checks, strict behavior, administrator enforcement, recorded owner approval for policy changes, and the bounded artifact rollback procedure above. Do not publish the proposed after-state as currently enforced before it is observed.

## Required remaining evidence

1. Fresh assigned `gpt-5.6-sol/high` review of the minimum change, preservation constraints, and rollback claims.
2. R04 required hosted evidence or an explicit owner-approved disposition; no implied dependency waiver.
3. Explicit owner approval for this exact policy change.
4. Complete before/after API snapshots, per-operation results, and read-only assertions of all three exact app-bound checks, strict mode, administrator enforcement, and preserved unrelated settings.
5. Equivalent read-only policy enforcement evidence. Existing PR #415 is already conflicting and is not a clean failed-check demonstration. Do not attempt to merge it or mutate it for this test.

Rollback of these repository settings means restoring the recorded previous settings only with applicable owner approval, preserving the live release. It is not a Git revert or an automatic production rollback.
