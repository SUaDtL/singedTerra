# R04 release-candidate evidence

- Date: 2026-09-10
- Worker: gpt-5.6-sol/high, session 01a08964-e082-7510-99b6-d90ed6094081; actual turn_context verified by parent.
- Parent integration/verification owner: gpt-6-astra/high. Parent persisted this receipt after the worker released its source/receipt lease; author reports and independent parent evidence are distinguished below.
- Worktree: C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r04
- Branch: codex/recovery-v2-r04
- Author base HEAD: 65fc62547630b789ebe430ad24405ee8e50f8706. Parent integrated the exact frozen diff atop430a715c17ffda15f5885ff2df9391d3d93c95a4; the resulting recovery commit is identified by Git history. No hosted candidate exists yet.
- Review: initial Astra/high session01a089be-2e38-7b81-a9c7-45de39b95229 returned two required corrections. Fresh corrected-diff Astra/high session01a089da-1b1b-7070-a7a1-4e8cf7927b32 completed four matched units, separate triage and aggregate PASS, zero findings. Local verification is complete; hosted acceptance remains pending.

## Scope and behavior

Changed paths are .github/workflows/ci.yml and deploy-pages.yml; scripts/ci/releaseCandidate.mjs, releaseCandidate.test.mjs and releaseWorkflow.test.mjs; scripts/checks/pages_freshness.mjs; playwright.config.ts and playwright.product-completion.config.ts; e2e/lobby-layout.spec.ts, portrait-gate.spec.ts, account-progression-summary.spec.ts and live-match-diagnostics.spec.ts; this receipt. No product source, dependency, lockfile or historical migration changed.

The release graph waits for the newest matching ci.yml push/main run at the exact source SHA. A failed or pending newer exact run cannot inherit an older success. It records that run's exact attempt and, after acquiring the Pages concurrency lock, revalidates the bound ID, attempt, source, workflow, event, branch, status and conclusion while also refusing a newer exact-source run. It builds once with the deployment base and public Supabase configuration, records deterministic payload/config digests plus a safe SHA-256 binding of the complete release-candidate metadata bytes, uploads a unique Pages artifact, downloads that exact artifact by ID, verifies it, executes both existing browser suites against extracted bytes without rebuilding, and verifies the payload again. Publish depends on gate, build, candidate-test and freshness; it also rechecks current main under the lock. Pages write and OIDC permissions are confined to publish; the same job has actions:read only for the final CI revalidation. Public deployment metadata is verified after promotion.

The Supabase URL remains public build configuration but is no longer transported as a cross-job output that GitHub may suppress. The safe metadata digest binds the entire provenance record, including `supabaseOrigin`, and is required during transported-candidate verification, after browser execution and against the public metadata response. Candidate browser checks derive the expected public origin and auth-storage key locally from the already digest-verified metadata file. Push-path verification fails when any source/run/payload/base/config/metadata-digest expectation is absent. Rollback keeps its prior trusted-run/artifact authorization and uses an explicit self-verifying rollback mode before emitting only safe digest and identifier outputs.

Manual dispatch is rollback-only: an explicit prior successful trusted Pages push run, matching source SHA, one nonexpired artifact and the reviewed current-main SHA are required. The old tested payload is reuploaded without rebuilding. This mechanism is prepared code, not authorization to run it.

Necessary test seams retain ordinary defaults and all behavioral assertions: explicit candidate URL for manually created portrait contexts, configured backend origin for mocked lobby requests, and configured Supabase auth-storage key for account/diagnostics fixtures. A context proxy allows loopback and fixture-fulfilled requests while unmocked external requests must fail with ERR_PROXY_CONNECTION_FAILED. The general candidate workflow runs two workers; product retains its five viewport projects and one worker.

## Defect and negative evidence

- Historical audit source: 3902cad662aea03cec913d984d17aa9573b89bd0. Pages run34329078394 completed08:27:38Z while CI34329078429 completed08:39:08Z. The prior graph published about11.5 minutes before required CI passed. These are historical API observations, not execution of the changed graph.
- Helper regressions reject changed/added/deleted/renamed payload bytes, incorrect source/run/config bindings, invalid public deploy metadata, symlinks/nonregular entries, failed/pending/wrong-source CI, and untrusted/missing/expired/ambiguous rollback selections.
- Workflow policy tests reject removed dependencies/browser commands, untrusted triggers, alternate artifact selection, a candidate configuration that rebuilds, and removal of the external-network boundary. These are source-policy checks; their textual assertions are not hosted job-execution evidence.
- Fresh review R04-REV-01 reproduced a post-gate race: the original implementation bound only the CI run ID, so a rerun could change the same ID's current attempt after candidate testing. New negative controls model cached attempt-1 success followed by the same run ID at attempt 2 in success, pending, failure and cancelled states; every changed attempt is refused, as is a newer exact-source run.
- Fresh review R04-REV-02 reproduced a provenance bypass: omitting the potentially suppressed expected origin let `verify-meta` accept an origin-tampered record. The RED controls showed both a missing metadata digest and the changed origin exiting 0. The corrected verifier requires the complete safe expectation set and rejects transport or public metadata whose full-record digest changes.
- Candidate browser RED exposed absolute-root portrait navigation and localhost-derived account/diagnostics auth keys. Bounded environment fallbacks corrected those fixtures without changing expected product behavior.
- The first proxy negative control accepted any navigation failure; it was strengthened to prove fixture fulfillment succeeds and the unmocked .invalid request fails specifically at the proxy. Its initial204 fulfilled response aborted navigation by design;200 with a tiny body corrected the control itself.

## Exact local fixture

These values are explicitly synthetic local test provenance, not real GitHub run IDs or production credentials:

- sourceSha: 65fc62547630b789ebe430ad24405ee8e50f8706
- candidateRunId: 4040001
- requiredCiRunId: 3030001
- basePath: /singedTerra/
- supabaseOrigin: https://candidate-test.supabase.co
- publicConfigSha256: d05d59680f55dc8867ffb4fbe7320349001291bf20d452c8a0947f48413f580a
- digestScope: regular-files-v1:exclude=/release-candidate.json
- payloadSha256: d28d8f157d878637ee0bc6c89e1bd3dc84eb3c1845520bc5b01c873b9b0721a6
- candidateMetadataSha256: 09c1156f823396da6b85ca061e50680725f69e0c4a23256cb459453ef1cca133 (safe external binding computed over the exact `release-candidate.json` bytes; it is not embedded into that file)
- extracted site: C:/Users/brenn/AppData/Local/Temp/singedterra-r04-b7009c87561d4280b9301adabcd73cf3/extracted/singedTerra

The author's first final handoff contained corrupted digest/path text. Parent rejected that text and independently reran assertCandidate against the actual extracted payload with the expected digest above, exit0. These values come from the verified artifact metadata, not the corrupted prose.

## Verification and observed limits

| Owner | Command/evidence | Exit/result |
|---|---|---|
| Author | npm ci --ignore-scripts --no-fund | 0; unchanged lock |
| Author | npm run check; npm run test:client; npm run build | 0; client1789 passed; static/build gates passed |
| Author | YAML parse, syntax, freshness policy, git diff --check | 0 |
| Parent | node --test scripts/ci/releaseCandidate.test.mjs scripts/ci/releaseWorkflow.test.mjs | 0;12/12 |
| Author | Initial Python-served full general,16workers | 1;264pass/14skip/67fail |
| Author | Low-worker diagnostic | 45pass/12fail; fixture/config failures separated from transport |
| Author | Corrected Python-served general,2workers | 1;324pass/16skip/5fail; focused reruns alone did not accept the suite |
| Parent | Final-fixture Python-served full general,2workers, exec37418 | 1;323pass/16skip/6fail; log in Temp/recovery-v2-r04-parent-general.log |
| Parent | Raw browser diagnostic20 Quick Duel entries; tracked Quick Duel repeat10 across4operations | 0;20/20 and40/40. Diagnostic only, not full-suite acceptance |
| Parent | Full-suite trace with max-failures1, exec22106 | 1;8pass/2skip/1fail/1interrupted/333not-run. Captured refused lazy dependencies |
| Parent | Vite-served npm run test:e2e -- --workers=2 --grep-invert @live, exec37923 | 0;329pass/16expectedskip,3.1min; Temp/recovery-v2-r04-vite-general.log |
| Author | Product matrix on extracted candidate | 0;81pass/19expected viewport-applicability skips |
| Parent | Product matrix on workflow-equivalent Vite, exec89733 | 0;81pass/19expected viewport-applicability skips,2.8min; Temp/recovery-v2-r04-vite-product.log |
| Parent | assertCandidate and nine served-file byte comparisons | 0; unchanged full payload; HTML/provenance/main JS/CSS and refused dependencies match extraction; exact source/run/config/payload verification repeated after both full browser suites, exit0 |
| Author | Initial fresh-review regressions: `node --test scripts/ci/releaseCandidate.test.mjs scripts/ci/releaseWorkflow.test.mjs` | 1; 11pass/4fail. Missing metadata digest and origin tamper were accepted, attempt-aware helper was absent, and workflow lacked final revalidation |
| Author | Corrected release helper/workflow regressions | 0; 18/18, including complete expectation, metadata tamper, rollback-safe output and same-ID attempt-change negatives |
| Author | `node scripts/checks/pages_freshness.mjs`; Node syntax checks; Python YAML parse; `git diff --check` | 0 after final correction |
| Author | `npm run check` | 0 after the fresh-review correction; full typecheck, deterministic harnesses, workflow freshness policy and Edge CI retry passed |

All Temp paths above are under C:/Users/brenn/AppData/Local/Temp/. Browser environment: E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/, E2E_DENY_EXTERNAL_NETWORK=1, E2E_EXPECTED_BACKEND_ORIGIN=https://candidate-test.supabase.co, E2E_AUTH_STORAGE_KEY=sb-candidate-test-auth-token. The product command is npx playwright test -c playwright.product-completion.config.ts.

## Transport diagnosis and localhost ownership

Parent retained the same Python listener PID15784 throughout the failed runs; observation timeouts were never treated as process termination. A preserved trace at Temp/recovery-v2-r04-full-traces/battlefield-backdrop-autho-d24fe-ing-the-procedural-fallback-desktop-fine/trace.zip shows Geometry-Dh2f_Qqr.js, AbstractRenderer-CpRxSptT.js and Container-Bj9Vf3Dg.js returning net::ERR_CONNECTION_REFUSED while main, mount JS and CSS returned200. They are static dependencies of the lazy mount module, so its import rejects before the semantic root can render. Queue size5 plus simultaneous refusals supports a backlog-pressure inference; no queue-depth measurement was taken.

After every browser diagnostic was terminal, parent reverified and stopped only that exact diagnostic PID, then started the workflow-equivalent Vite preview without rebuilding: PID35800, exec26925, 127.0.0.1:5198, --base /singedTerra/ and --outDir pointing to the exact extraction above. The full general suite then passed. After both full suites and corrected review ended, parent stopped the verified PID35800 and assigned the sole localhost to R03; the R04 extraction remains preserved. These prior R04 handles are terminal, not currently live.

The rejected-import shell also supplies context for existing R10: lifecycle.ts:256 rejects before mount.tsx renders, lifecycle.ts:291 catches and returns uncommitted fallback, while HUD.ts:847 retains its active latch. This product resilience concern stays with R10's independent semantic-readiness scope; R04 did not alter those owners or enlarge timeouts.

## Acceptance boundary and rollback

AC013..016 have implemented source mechanisms and local helper/browser evidence. The first fresh assigned review identified two required corrections; both are corrected, and fresh corrected-diff review and integration checks now pass. Actual hosted execution with repository public configuration and publication remain incomplete. No privileged PR artifact is introduced. A synthetic fixture run does not prove GitHub artifact transport or production deployment.

No push, PR, merge, tag, release, remote settings, backend/schema mutation or production rollback occurred. Merging this workflow into main would enable its automatic Pages path; obtain explicit owner approval accounting for that deployment before proposing a merge. Before promotion, restore/revert only the isolated R04 change through normal review if needed. After promotion, use an explicitly approved compatible prior tested artifact or fix forward; never bypass failed gates or discard unrelated work.

## Parent integrated local verification, 2026-09-10

The fresh reviewer was verified from actual session metadata as Astra/high. Security, auth/crypto, coverage and architecture all completed with explicit no-finding results; no matched unit was omitted or deferred. Independent18/18 helper/workflow tests, freshness, YAML validation and diff checks passed. The two scanner observations at account-progression-summary.spec.ts15–16 are unchanged synthetic account fixtures, openly classified noncredentials. SHA-256 operations use the project's approved build/source provenance allowance; no security primitive or TLS change was introduced.

Parent verified matching baseline blobs and copied all13 files byte-for-byte into integration. Fresh `node --test scripts/ci/releaseCandidate.test.mjs scripts/ci/releaseWorkflow.test.mjs` passed18/18; `npm run check` session68702 exited0; `npm run build` including typecheck exited0. Logs: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r04-integrated-{helpers,check,build}.log`. The complete1817-test client and378-test Edge runs immediately before this integration remain valid for their unchanged source/test surfaces; no rerun is claimed. Full browser evidence above belongs to the preserved exact local fixture, not the combined final recovery candidate.

The corrected integrated CLI verified the preserved artifact with every expected source/run/base/config/payload/raw-metadata binding and passed `verify-meta` with the exact metadata bytes as stdin. The first local CLI invocation exited1 solely because its required Actions output sink was absent; rerunning with a disposable local output file passed both commands. Output fixture: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r04-verify-outputs-f341efbc7d874a3ca4a819dc2c686ed6.txt`. It is a local CLI transport fixture, never hosted evidence or a security marker.

R04 is LOCAL_VERIFIED and ready for governed commit. The genuine security gate may be recorded for this reviewed diff. Hosted transport, production-configuration execution and actual promotion remain unproven and must stay visible in R20; no exception or publication approval is inferred.
