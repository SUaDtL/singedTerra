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
include the lane and run attempt. Every previously executing assertion and distinct viewport scenario remains.
Retries and performance ceilings are unchanged.

Pages starts when `CI` completes on main, rather than holding a runner while CI
runs. A read-only gate accepts only a successful same-repository main push and
refetches its exact run, attempt and workflow identity. The CI source must equal
both the trusted workflow snapshot and current main; a PR, fork, stale run or
replaced attempt cannot authorize a release. GitHub's `workflow_run` context uses
the default-branch snapshot, so the upstream SHA is validated explicitly.
No upstream CI artifact or upstream branch checkout is consumed.

Pages builds one candidate with the deployment base path and public configuration.
Three parallel browser lanes each download that same artifact by ID, verify its
metadata and payload digest, exercise it with external network access denied,
and verify its bytes again. Publication requires the entire matrix plus current
main freshness, the bound successful CI attempt, and the deployment lock.

CodeQL uses the same strict documentation classifier on PR and main events; its
weekly security scan always runs in full. Classification errors fail the workflow.
Pages still runs full candidate coverage for documentation-only main commits.
That release cost remains an explicit opportunity, not a claimed saving. Skipping candidate tests
requires comparing against a trusted previously tested runtime, including when
intermediate commits were never published. Manual dispatch remains rollback-only. It accepts an exact successful historical
Pages push run or a new successful Pages workflow-run release, plus the reviewed
current main and the one unexpired candidate artifact. A rollback dispatch is not
itself a reusable release source. The original payload is verified and reuploaded
without rebuilding.

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

The first hosted parallel run, `34879942448` for PR #508 at `211efb8`, passed
in 10m58s from creation to completion, about 52% below the 22m53s PR baseline.
The active job path was 10m52s. General shards passed 237 and 225 cases, retaining
all 462 executed cases and 45 profile skips; product passed 83 with 27 skips.
The slower general lane took 10m25s including setup, the other 7m17s, and product
5m54s. These are one run's observations, not a guaranteed duration.

Initial partition discovery confirmed all 507 general cases (254 + 253), without
overlap or omissions. The subsequent selection cleanup retains 491 (246 + 245):
the eight portrait tests create their own viewport contexts, so their identical
repeats under the two other outer projects were removed. All eight distinct
portrait scenarios still execute.

Product selection now chooses the 83 previously executing project/file/title
combinations before opening a page, instead of scheduling 110 and skipping 27.
Counts are ultrawide 15, wide 16, standard 17, narrow 17, compact 18. Exact
identity comparison found no missing or new executing combinations. The 17
late skips previously spent 41.59 seconds booting pages in the measured product
run. Per-project tag filters eliminate that work in source CI and Pages.

The obsolete ignore for the removed `battle-console-integrated` directory was
also removed. Remaining audit findings: the manual performance spec schedules
three guaranteed skips, and some product geometry checks overlap stronger console
checks. Those cases remain intact; neither overlap nor an expensive test is
sufficient reason to remove an assertion.

The earlier Pages polling allowance was corrected from about 20 to 30 minutes
after it expired before a 23-minute CI run finished. The completed-CI trigger
supersedes that poll loop: its five-minute gate performs bounded API reads only.
Final CI run/attempt revalidation, current-main checks and publication locking
remain mandatory. This saves the idle gate's runner time; it does not remove CI
or candidate-browser work, and total push-to-publication time still includes both.

The privileged trigger follows GitHub's [workflow-run security guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).
Regression cases reject untrusted event/run identities, changed attempts, stale
source and unsafe artifact/checkout substitutions. Hosted timing and first-trigger
verification belong to the delivery record; local fixtures do not prove GitHub
has executed the new trigger.
