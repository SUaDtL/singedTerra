# Pages after CI execution

One Terra/high writer owns scripts/ci/releaseCandidate.mjs and its tests. Astra owns the workflow, workflow structural tests and documentation; Sol/high independently reviews the trust boundary and exact diff. No additional worktree or preview.

| Obligation | Proof | Status |
| --- | --- | --- |
| AC1 trusted completion | CLI/API fixture regressions for event/run/attempt/repository/workflow/source; newest-run tests | COVERED locally |
| AC2 source and freshness | Trusted checkout structural checks, wrong snapshot/current-main tests | COVERED locally |
| AC3 no idle poll | Completed-event CLI flow, bounded request inventory, removed wait loop | COVERED locally |
| AC4 artifact and permissions | Existing release and candidate-matrix tests plus negative workflow mutations | COVERED locally |
| AC5 rollback | Historical/new release provenance and tampered-run tests; unchanged artifact checks | COVERED locally |
| AC6 delivery | Independent review, required CI, first main workflow-run release/public proof | Local review passed; exact-head CI and first hosted trigger pending |

Human tasks T07/T09/T14-T18 remain deferred by the user, not accepted or completed. This work does not alter their task states.

Verification: original workflow rejected the completed-CI trigger; original CLI rejected the valid workflow-run fixture. Added negative fixtures exposed and pinned final source/snapshot equality and newest-run fallback rejection. The full repository check passed with unchanged runtime/performance limits. Final combined release/workflow/backend-policy tests passed all 73 cases, the Pages freshness harness passed, and the secrets scan returned no findings. Independent Sol/high review passed with no remaining blocker. Exact-head hosted checks and the first real completed-CI trigger remain required for operational acceptance.

The prior “split producer and workflow_run controller” alternative in the stale-deploy-guard spec consumed a separate producer's artifact. This change keeps one Pages candidate producer and never consumes upstream CI artifacts; both existing freshness checks and the publish lock remain.
