# R13 — migration history evidence

**Task:** R13 — Make migration history checks use real base/head evidence
**Base SHA:** `3902cad662aea03cec913d984d17aa9573b89bd0`
**Result SHA:** uncommitted worker tree at the declared base, including review remediation
**Worker:** gpt-5.6-terra / high
**Date:** 2026-09-09

## Scope and policy

Changed paths are limited to:

- `scripts/checks/migration_classification.mjs`
- `scripts/checks/migration_classification.test.mjs`
- `.github/workflows/ci.yml`
- this receipt

The migration-history check resolves explicit base and head commits, verifies both Git objects, and derives its protected inventory from the immutable base tree's `supabase/migrations/*.sql` paths. It rejects modifications, deletions, renames, staged changes, and worktree changes to that inventory. A migration absent from the base tree remains a forward-only addition. This is a repository-history policy; it does not claim that a remote database has applied every file in the base tree.

The existing `011_data_classification_comments.sql` content policy remains a separate exact SQL validator. The history check no longer uses the environment-controlled alternate-root or Git-executable compatibility helper. Its supported no-argument defaults are the strictly resolved `origin/main` base and `HEAD`; CI supplies immutable event SHAs explicitly.

For pull requests, CI compares `github.event.pull_request.base.sha` with `github.sha`, GitHub's verified synthetic merge result. It does not compare the current base with `github.event.pull_request.head.sha`, because a forward migration added only to the base after branch divergence would otherwise appear as a deletion. For `main` pushes, it uses `github.event.before` and `github.sha`. The CI step rejects missing/all-zero endpoints, fetches the two commit objects at depth one, verifies each with `git cat-file`, then invokes the history check with those SHA values. It updates the local `origin/main` ref to the verified base so the existing no-argument `npm run check` call remains reproducible after the explicit check.

## Regression-first evidence

Before implementation, `node --test scripts/checks/migration_classification.test.mjs` exited 1 with all six new disposable-Git tests failing for the intended reason: the prior checker returned success after an edit to `020`, an edit earlier in a multi-commit range, a merge-carried edit, deletion, an unavailable base, and a shallow checkout comparison. The prior `HEAD^` error swallowing and `001`–`010` prefix filter caused the false successes.

After implementation, the same command exited 0 with all six tests passing. The test suite creates only checked, uniquely prefixed temporary Git repositories and removes only those fixtures. It exercises real Git histories for:

- edits to `020` outside the old numeric filter;
- multi-commit and merge ranges;
- deletion and rename of a protected base-tree file;
- staged and unstaged protected-file edits;
- an allowed forward `021` migration;
- unavailable all-zero and nonzero missing bases;
- a depth-one clone after explicitly fetching the base object.

The review remediation adds a diverged topology: a base-only `021` forward migration remains valid when compared with the synthetic merge result, while an edit to protected `020` inside that merge is rejected. It also stores deliberately malformed commit objects only in the disposable fixture. Those objects pass commit-type resolution but make real `git ls-tree` and `git diff` fail; the checker must retain reason-specific diagnostics instead of producing an empty comparison. No production bypass or configurable alternate Git executable is introduced.

The retained classification validator continues to reject its same-line `ALTER`, standalone `DROP`, and dollar-quoted dynamic `DROP` probes before reporting success.

## Commands and results

| Command | Result |
|---|---:|
| `node --test scripts/checks/migration_classification.test.mjs` before implementation | exit 1; six intended regression failures |
| `node --test scripts/checks/migration_classification.test.mjs` after implementation | exit 0; 6 passed |
| review-remediation red: `node --test scripts/checks/migration_classification.test.mjs` | exit 1; 8 passed and the CI contract failed because it used the source PR head rather than the synthetic merge SHA |
| review-remediation green: `node --test scripts/checks/migration_classification.test.mjs` | exit 0; 9 passed |
| `node scripts/checks/migration_classification.mjs --check classification` | exit 0; 26 comments validated |
| `node scripts/checks/migration_classification.mjs --check history --base origin/main --head HEAD` | exit 0; 20 base-tree SQL migrations protected |
| `npm ci --ignore-scripts --no-fund` | exit 0; 178 locked packages, 0 vulnerabilities, no manifest/lockfile changes |
| first `npm run check` | exit 1 before source checks because this worktree had no local `tsc` executable |
| rerun `npm run check` after the locked install | exit 0 |
| `npm run test:client` | exit 0; 200 files / 1,776 tests passed |
| `npm run build` | exit 0 |

## Acceptance mapping

- **AC-045:** Base-tree inventory covers all SQL migrations present at the supplied base, including `020`; tests prove edit, delete, rename, staged, and unstaged failures without a numeric-prefix policy.
- **AC-046:** Tests cover shallow, merge, multi-commit, unavailable-base, and diverged-base synthetic-merge outcomes using disposable real Git repositories. CI requires the suite before install/test/build work.
- **AC-047:** Every Git invocation is checked; object-resolution plus deliberate real `ls-tree` and `diff` failures throw an explicit failure instead of becoming an empty diff.
- **AC-048:** The independent `011` validator and its forbidden-SQL mutation probes remain active and pass on the canonical migration.

## Remaining limits and rollback

No SQL migration, remote setting, deployment, schema, data, commit, or staging action occurred. Local validation does not execute GitHub Actions and does not prove a remote database's applied-migration state. The build retains its existing large-chunk warning.

Rollback is a revert of the checker, test, CI, and receipt changes only. It must not suppress a missing base/head error or alter migration history.


## Parent integration evidence

The author reported post-remediation npm run check exit 0 after freezing the nine-case suite. Parent independently reran all nine real Git regressions (exit 0), the combined history/classification check (20 protected migrations and 26 comments, exit 0), and changed-file secrets scan (exit 0). Fresh Sol/high final review, finding triage, and verdict aggregation passed AC-045 through AC-048 with zero findings. The canonical execution ledger owns current status; this receipt preserves task-local evidence. Integrated source validation is recorded there before promotion.
