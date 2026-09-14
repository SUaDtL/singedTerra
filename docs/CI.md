# CI coverage and execution cost

CI selects work from the exact GitHub event commits: PR base to the synthetic
merge commit, or the main push's previous commit to its new commit. Unknown or
mixed changes run the full suite. Workflow-level path filters are intentionally
absent: branch protection always receives the same three required checks.

## Change selection

Documentation-only means `README.md`, Markdown under `docs/` except
`docs/compatibility/`, and single-level `.codearbiter/plans/*.{md,json}` files.
Everything else runs full CI, including dependencies, workflows, tests, assets,
build configuration, compatibility data, and the classifier itself. Renames
include both the old and new paths; deletions participate in classification.
Empty diffs select full coverage. Invalid commit evidence fails CI.

Every change still checks immutable migration history and runs the inexpensive
CI classification, required-result, release-policy, migration, and documentation
evidence-template regressions.
Documentation-only changes omit dependency installation and the engine, client,
database, Edge, and browser execution jobs. Each required check explicitly
validates either successful required work or an intentional documentation skip.
Classifier failure, cancellation, missing results, and unexpected skips fail.

## Parallel work and retained coverage

| Lane | Coverage | Execution |
| --- | --- | --- |
| Engine, database, client, build | Determinism, replay limits, PostgreSQL lifecycle, DOM logic, types, dependency audit, production build | One job |
| Edge | Deno referee and verifier contracts | Independent job |
| General browsers | Existing desktop, touch, and small viewport inventory | Two disjoint Playwright shards, two workers each |
| Product browsers | Existing five responsive profiles and interaction cases | Independent job, existing one-worker setting |

The browser matrix does not cancel sibling lanes on failure. Failure artifacts
include the lane and run attempt. No test assertions, viewport profiles, retries,
or performance ceilings were removed or relaxed.

Pages builds one candidate with the deployment base path and public configuration.
Three parallel browser lanes each download that same artifact by ID, verify its
metadata and payload digest, exercise it with external network access denied,
and verify its bytes again. Publication requires the entire matrix plus current
main freshness, the bound successful CI attempt, and the deployment lock.

Pages still runs full candidate coverage for documentation-only main commits.
CodeQL still runs on its existing PR, main, and weekly schedule. These are
explicit remaining opportunities, not claimed savings. Skipping candidate tests
requires comparing against a trusted previously tested runtime, including when
intermediate commits were never published. Triggering Pages after CI completes
also needs to preserve the existing event and rollback trust boundaries.

## Measured baseline and first delivery

The September 14, 2026 audit used PR CI run `34870930574`, main CI run
`34873412508`, and successful Pages run `34862377317`:

- Source CI: 22m53s–23m12s wall time. General browsers took 17.2–17.3 minutes,
  then product browsers took 5.0–5.1 minutes sequentially.
- Engine/client/build took 3m52s–6m21s; Edge took 26–32 seconds.
- Pages took 39m55s, including 19m25s holding a runner while waiting for CI and
  18m31s testing the candidate.
- npm and Playwright binary caches hit. npm installs took about 4–8 seconds;
  browser system dependencies took 12–18 seconds.

The first delivery targets unnecessary documentation runs and the sequential
browser critical path. It retains lockfile-scoped npm download caching and
version-scoped browser caching; it does not cache `node_modules`. More runners
mean additional setup work, so lower wall time is not the same as fewer runner
minutes. Actual shard timing and stability must be read from the first hosted
run; equal test counts do not guarantee equal durations.

Inventory discovery confirmed 507 general cases: 254 in the first shard and
253 in the second, with no overlap or omissions. The product inventory retains
110 combinations (83 executing cases and 27 profile-specific skips).

The test audit also found follow-ups that require their own coverage comparison:
portrait tests repeat explicit internal viewport contexts under three outer
projects; 17 product skips happen after browser setup; the manual performance
spec schedules three guaranteed skips; and the removed `battle-console-integrated`
directory still has an ignore entry. Some product geometry checks overlap stronger
console checks. These cases remain intact in this delivery; neither overlap nor
an expensive test is sufficient reason to remove an assertion.

The Pages polling allowance was also corrected from about 20 minutes to about
30 minutes, with a 35-minute job timeout. The previous allowance expired before
the observed 23-minute required CI completed. It still refuses failed CI and
revalidates the exact run attempt before publication.
