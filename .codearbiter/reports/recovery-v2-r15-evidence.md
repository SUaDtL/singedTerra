# R15 evidence — ordinary guest entry and declared browser coverage

- **Task:** R15 — Extend existing browser suites with untouched entry and declared-engine coverage.
- **Base SHA:** `0f708d5d60d06a3732d5e3d7b4d2adc92754f716`
- **Result SHA:** uncommitted lease diff on `codex/recovery-v2-r15`; no commit, remote mutation, or deployment was made.
- **Worker:** `gpt-5.6-terra`, high reasoning; verified session `01a09594-f680-74a2-9d52-ca9b8d924cde`.

## Changed paths

- `e2e/ordinary-guest-journey.spec.ts` — a fresh Playwright fixture context with explicit empty storage follows the normal root entry point. It dismisses the real splash, configures a two-human Foundry local battle through visible controls, requires and dismisses the First Salvo briefing, performs seven legal Baby Missile shots, asserts `Player 2 wins`, and proves Play again restores Player 1's 100 HP / 45-degree / 50-power ready state. It does not use an `?e2e` fixture, remove DOM, write storage, inject engine state, or take account/online actions.
- `.github/workflows/ci.yml` — preserves both existing browser invocations and uploads `test-results/**` and `playwright-report/**` only after either fails, with `actions/upload-artifact@v7.0.1` pinned to its immutable commit.
- `.codearbiter/reports/recovery-v2-r15-evidence.md` — this receipt.

## Coverage and deliberate profile accounting

The configured projects use Chromium only: `desktop-fine`, `pixel-touch`, and `small-window`. The new critical path ran once in `desktop-fine`; `pixel-touch` and `small-window` are explicit skips with their reason reported by Playwright. Those two profiles remain Chromium touch/window emulation coverage from their existing layout journeys; no Firefox, WebKit, Safari, or physical-device coverage is claimed.

The original RED evidence was a coverage inventory gap: prior helpers wrote the First Salvo preference and removed the splash, while adjacent tests used `?e2e` state. It did not establish a product defect. The new test is therefore required to pass on the public path, not to manufacture a failing product assertion.

## Executed evidence

The sole preview was the parent-owned frozen integration artifact at `http://127.0.0.1:5198/` (integration PID `52024`, exec `37098`). Each command below set `E2E_LIVE_URL=http://127.0.0.1:5198/` and `E2E_DENY_EXTERNAL_NETWORK=1` where browser traffic was involved; no build or server was started.

| Command | Exit | Result |
| --- | ---: | --- |
| `npm ci --ignore-scripts --no-fund` | 0 | Restored the existing lockfile's test dependencies only; Playwright browser runtime had already been found installed. |
| `E2E_LIVE_URL=http://127.0.0.1:5198/ E2E_DENY_EXTERNAL_NETWORK=1 npx playwright test e2e/ordinary-guest-journey.spec.ts` | 0 | 1 passed (`desktop-fine`) in 14.5 seconds; 2 deliberate skips (`pixel-touch`, `small-window`). |
| `node -e <CI workflow structural assertions>` | 0 | Confirmed both existing suite commands, `if: failure()`, and the pinned upload-artifact action remain present. |
| `npx tsc --noEmit --pretty false -p client/tsconfig.json` | 0 | Client typecheck completed. |
| `git diff --check` | 0 | No whitespace errors in the leased diff. |

The passing journey emitted local, ignored artifacts:

- `test-results/ordinary-guest-journey-ord-b3091-try-through-public-controls-desktop-fine/ordinary-guest-terminal.png`
- `test-results/ordinary-guest-journey-ord-b3091-try-through-public-controls-desktop-fine/ordinary-guest-retry.png`

## Remaining limits and rollback

No full browser matrix, production build, product-completion suite execution, CI run, remote upload, physical-device test, account action, or online action was run in this lease. CI now retains its two established browser commands and will expose failure artifacts for either. Rollback is deletion of the new journey and failure-artifact step; existing standard and product-completion suites remain independent.

## 2026-09-12 action-pin correction

The initially added artifact action was `actions/upload-artifact@v4.6.2` pinned to `ea165f8d65b6e75b540449e92b4886f43607fa02`. GitHub's release and immutable `action.yml` identify that release as a GitHub-authored action using `node20`. No failing hosted execution of that pin was observed or run in this task. As of 2026-09-12, GitHub's published schedule says Node 24 became the default on 2026-06-16 and Node 20 is removed on 2026-09-23. It does leave the new step on a runtime GitHub tells action users to replace before that removal.

The step now uses the official current release, `actions/upload-artifact@v7.0.1`, pinned to `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`. The official release page marks v7.0.1 as Latest and its commit as GitHub-verified; `git ls-remote https://github.com/actions/upload-artifact.git refs/tags/v7.0.1` resolved the same immutable commit. Its `action.yml` declares `runs.using: node24`; its package metadata declares `node >=24`; and its repository license is MIT. This is an action reference only: no package manifest, lockfile, installed dependency, or third-party runtime bundle was changed. The existing CI job remains GitHub-hosted `ubuntu-latest`; no self-hosted runner compatibility was exercised.

The failure-only condition, `test-results/**` and `playwright-report/**` paths, `if-no-files-found: warn`, workflow `contents: read` permission, hidden-file exclusion (the action's default remains `false`), and both browser commands are unchanged.
The pre-existing immutable pins for checkout, setup-node, and cache are unchanged. This correction opened no browser, preview server, background process, or remote workflow run.

| Correction command | Exit | Result |
| --- | ---: | --- |
| `git ls-remote https://github.com/actions/upload-artifact.git refs/tags/v7.0.1` | 0 | Resolved `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`. |
| `node --test scripts/ci/releaseCandidate.test.mjs scripts/ci/releaseWorkflow.test.mjs` | 0 | 18/18 existing release-workflow assertions passed again after the pin correction. |
| `node -e <R15 artifact-step structural assertions>` | 0 | Confirmed the v7.0.1 immutable pin, failure-only condition, artifact name, both paths, warn behavior, `contents: read`, hidden-file exclusion, and both browser commands. |
| `python <ca-codex>/hooks/preview.py secrets` | 0 | `[]`; no secret finding in the leased diff. |
| `git diff --check` | 0 | No whitespace errors in the leased diff. |

Official evidence: <https://github.com/actions/upload-artifact/releases/tag/v7.0.1>; <https://raw.githubusercontent.com/actions/upload-artifact/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/action.yml>; <https://raw.githubusercontent.com/actions/upload-artifact/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/LICENSE>; <https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/>.

## Independent review and parent integration

Fresh corrected reviewer `01a095b9-5f6c-7d60-95c8-61128eb8eaa6` was verified as `gpt-5.6-sol/high`. All three raw units completed, followed by separate finding triage and aggregation: PASS, zero findings. The reviewer verified all three frozen hashes, official action tag/metadata/license, failure-artifact policy, 18/18 release-policy regressions, state-free secrets scan `[]`, whitespace, and all three declared Playwright instances. Browser evidence reuses the prior independent exact-test-source run; changing only the CI pin does not establish a new hosted execution.

Parent copied both corrected paths byte-identically after checking the original integration and new frozen hashes; the guest test hash remains unchanged. Earlier parent browser session49003 exited0 with one desktop pass14.6s/two deliberate profile skips against the bound0f708d5 artifact; release regressions18/18 and fullcheck66083 exited0. The current parent candidate additionally includes R07, whose separate browser fixture corrections and error-contract checks remain in progress. At that point no R15 commit, hosted upload or deployment had occurred.

## Parent governed commits and latest guest proof

CI commit `3f72a01b53c553e1cd27a8214f925f274e121332` and test commit `1814c4eab27f42d43b07faa5a40381bb986e3cfa` landed with hooks enabled. Exact selective staging kept other recovery work separate. Before commits, fresh release-policy18/18 and complete new-step assertions exited0 (222bdd), configured secrets scan reported22 already classified synthetic R07 fixtures and no R15 credential, full staged source/diff and whitespace were checked. Prior full integrated check33187 and typecheck/build were terminal0; no application source changed between that proof and these R15 commits. No standalone lint is configured. No provenance worklist or new set-asides.

Fresh parent browser8111 exited0 (076528):1desktop pass14.6s,2explicit profile skips. Served/disk index bytes matched9e20ba72f8063617ca07164b20878231a4a5286d458f16a7733be679c5e48fa6 on the sole integration Vite PID72444. This artifact included the prior R07 source; it does not prove the later R07 status-aware correction. Artifacts: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r15-commit-artifacts`. No hosted failure upload or production execution occurred. Remaining dirty files are known R07, R05 and parent evidence work, not unexpected changes.

The final combined candidate general browser run14256 exited0 with333passes and18deliberate profile skips, including the untouched ordinary guest journey. The rebuilt artifact indexSHA14869f2fb381b84584f12513d9f1c64a955a5c5967ee9221636708cee402e4ff stayed byte-identical after the suite. Final combined coverage1875tests,enginecheck,build/typecheck,Edge393 and realPostgres gates passed. R15 local AC053–056 are accepted. Hosted upload evidence remains distinct and unclaimed.
