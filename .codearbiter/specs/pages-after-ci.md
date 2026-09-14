# Pages after successful CI

User authority: revisit CI efficiency and parallelization, followed by “Save any human work for now. Do unblocked work.” Standing commit and merge authority applies. Human reassessment tasks remain deferred and incomplete.

Scope: replace the idle Pages CI poll with a completed-workflow trigger. This is an extension of the authorized CI efficiency work, not a new deployment service or repository-settings change.

Acceptance criteria:

1. Ordinary Pages release starts only after the configured CI workflow completes successfully for a same-repository main push. The read-only gate refetches and validates the exact run, attempt, workflow identity, repository, branch, source and newest-run status. Missing, stale, PR, fork, failed or superseded evidence cannot reach build/publication.
2. The gate executes only the trusted default-branch workflow snapshot. Source is taken from verified upstream CI and must equal both the workflow snapshot and current main. Later jobs use only the gate-approved exact SHA. A moved main fails freshness checks, including after acquiring the deploy lock.
3. CI readiness uses bounded API reads without a sleep/poll loop. Failed CI does not allocate a candidate builder or obtain publication privileges.
4. Existing exact artifact ID, pre/post-browser digest checks, three browser lanes, network denial, public provenance, final CI run/attempt revalidation and publish-only write permissions remain intact.
5. Explicit rollback remains manual-only, accepts successfully tested historical push releases and new trusted workflow-run releases, and preserves prior candidate bytes. Invalid or ambiguous provenance fails closed; rollback dispatch itself is not a reusable source.
6. Regression tests prove the new valid flow and reject hostile/stale inputs; full required CI and independent security/evidence review pass. The first merged main release demonstrates the actual GitHub trigger and published provenance before claiming operational success.

Rollback: revert the isolated CI change through a PR to restore the previous main-push gate. No applied SQL, backend, reward, game or physical-observation semantics change.
