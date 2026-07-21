# Stale Pages Deployment Guard Sprint Spec

> Status: **APPROVED — user approved 2026-07-20**
> Date: 2026-07-20
> Tracks: GitHub issue #104

## Goal

Prevent a rerun or manual dispatch whose source SHA is no longer `main` HEAD from publishing an
older client bundle over the current GitHub Pages site, and make the deployed commit independently
observable after publication.

## Why this is next

This failure has already rolled production back while every repository check remained green. It is
more valuable than the next small UI fix because it can silently undo any already-merged player
repair. Issue #108, issue #120, and the coordinated Vite/Vitest migration remain independent later
sprints.

The current workflow serializes Pages runs and performs a visual live smoke, but it never compares
the run SHA with current `main` and the smoke has no commit-provenance oracle.

The dependency-maintenance pass completed before this implementation: current `main` now uses
`actions/configure-pages` v6 and `actions/deploy-pages` v5, with an exact-SHA Pages deployment and
live HTML/asset smoke proven after each merge. This sprint preserves those versions and adds the
freshness/provenance policy around them.

## Design decision

Use two fail-closed HEAD checks plus a deployed provenance sentinel:

1. The build uses the dependency-free policy helper to write `client/dist/deploy-meta.json`
   containing only the exact 40-character `GITHUB_SHA` and decimal-string `GITHUB_RUN_ID` before
   artifact upload.
2. After `build`, a separate `freshness` job queries the GitHub API for `main` HEAD using the existing
   `GITHUB_TOKEN` and `contents: read` permission. This rejects already-stale runs before they can
   enter the deployment queue.
3. A dependency-free Node helper validates both SHAs and exits nonzero on malformed input or any
   mismatch. API, parse, or network failure also blocks deployment.
4. Only the `publish` job enters `pages` concurrency, with `queue: max` and
   `cancel-in-progress: false`. It requires both `build` and `freshness`. After
   acquiring the concurrency lock, it queries `main` HEAD again and applies the same comparator
   immediately before `actions/deploy-pages`. This closes the race where `main` advances after the
   pre-queue check.
5. While still holding the lock, `publish` fetches `deploy-meta.json` with run-ID and attempt cache
   busters. Curl caps the response at 4096 bytes, and the shared CLI independently stops reading
   standard input once it exceeds 4096 bytes. Each curl uses two retries with a one-second delay and
   a 50-second aggregate retry window. A bounded loop retries network, size, parse, SHA, and run-ID
   mismatches; the shared helper requires the exact two-key sentinel before the job can complete.
6. The existing Playwright visual smoke runs after `publish`.

Moving concurrency from the workflow level to `publish` is required. GitHub retains at most one
pending member of a concurrency group, so a stale rerun must fail freshness before it can displace a
legitimate pending current deployment. The second check inside `publish` is also required: job
ordering is not a transaction, so the pre-queue result alone cannot prove that the run is still
current when its serialized deployment begins.

### Historical-run limitation

GitHub reruns use the workflow definition and `GITHUB_SHA` from the original run. Therefore this
change governs every run created after it lands, but it cannot inject a guard into already-created
pre-fix runs. GitHub permits reruns for 30 days. The PR must not claim retroactive protection:

- issue #104 remains referenced rather than automatically closed while any pre-guard run is still
  rerunnable;
- deleting historical runs is an optional destructive cleanup requiring separate explicit approval;
- absent deletion, the residual window expires naturally 30 days after the last pre-guard run.

## Alternatives rejected

**Pre-queue check only:** rejects known-stale runs cheaply, but leaves a time-of-check/time-of-use
window if `main` advances while the publish job is waiting or being scheduled.

**In-lock check only:** closes the deployment race, but lets stale reruns enter the concurrency group
where GitHub can replace the single legitimate pending member. The cheap pre-queue check prevents
that queue interference.

**Always check out current `main`:** an old rerun would publish current bytes, but its run metadata
would falsely attribute those bytes to the old event SHA and hide provenance errors.

**Split producer and `workflow_run` controller:** this centralizes deployment policy but adds a
second workflow, artifact permission plumbing, and a broader trust surface without governing old
combined runs.

**Detect and auto-repair after deployment:** a sentinel-only repair loop exposes stale bytes before
detection and requires Actions-write permission. The sentinel remains defense in depth, not the
primary control.

## SMARTS decision

| Lens | Two HEAD checks + sentinel | Pre-queue check only | In-lock check only |
|---|---|---|---|
| Scalable | Strong. Two constant-time reads protect each future Pages run. | Strong. One constant-time read protects each run. | Strong. One constant-time read protects each run. |
| Maintainable | Strong. One comparator serves both explicit policy checkpoints. | Adequate. Simpler topology hides a race between jobs. | Adequate. Simpler topology permits stale queue interference. |
| Available | Strong. Stale runs fail before queueing and again before mutation. | Adequate. A delayed run can publish after `main` advances. | Adequate. Stale runs can displace a valid pending publish. |
| Reliable | Strong. Queue safety and in-lock equality jointly prevent retrograde publication. | Weak. Time-of-check/time-of-use can publish stale bytes. | Adequate. Deployment is current, but queue ordering can drop valid work. |
| Testable | Strong. Structural assertions prove both checks bracket the concurrency boundary. | Adequate. Pure policy is testable; scheduling race remains unprovable. | Adequate. In-lock ordering is testable; queue interference remains. |
| Securable | Strong. Both reads use the existing least-privilege token. | Strong. One least-privilege read adds no trust surface. | Strong. One least-privilege read adds no trust surface. |

Recommendation: two HEAD checks plus sentinel. Strength: **strong**. Reliable and Available dominate;
one extra read closes the race without adding permission, dependency, or publisher surface.

## Architecture and boundaries

### Pure provenance policy

Create `scripts/ci/pagesFreshness.mjs` with:

```js
export function assertCurrentMain(candidateSha, currentMainSha) {}
export function serializeDeployMeta(sha, runId) {}
export function assertDeployMeta(rawJson, expectedSha, expectedRunId) {}
```

SHA inputs must match `/^[0-9a-f]{40}$/`; run IDs must match `/^[1-9][0-9]*$/`. Exact equality
returns normally. Serialization emits exactly `{ "sha": string, "runId": string }` plus one newline.
Verification rejects malformed JSON, missing or extra keys, wrong types, invalid values, or either
mismatch. Errors contain abbreviated SHAs and generic metadata diagnostics only, never a token or API
response body. CLI `check`, `write`, and `verify` modes reuse these exports and exit nonzero on failure;
`verify` reads the served JSON from standard input.

### Workflow contract

`deploy-pages.yml` retains existing triggers, serialized publishing, build, Pages environment, and
visual smoke. Its default token is limited to `contents: read` and `pages: read`; only `publish`
receives `contents: read`, `pages: write`, and `id-token: write`, and every checkout disables
credential persistence. It adds only:

- metadata creation before `actions/upload-pages-artifact`;
- a `freshness` job with a pinned checkout, current-HEAD query, and comparator after `build`;
- job-level `queue: max` concurrency on `publish`, which requires both `build` and `freshness`;
- a second current-HEAD query and comparison inside `publish`, immediately before deployment;
- a cache-busted, 4096-byte-capped metadata fetch and comparator after deploy while `publish` still
  holds the lock.

No new dependency, action publisher, permission, secret, environment, deploy target, or backend
operation is introduced.

## Acceptance criteria

### AC-1: exact current HEAD is allowed

The pure helper accepts two identical lowercase 40-character Git SHAs and exits zero.

### AC-2: stale or malformed input fails closed

The helper exits nonzero for different SHAs, short SHAs, non-hex input, missing input, and a malformed
current-head response. Either HEAD query failing, returning malformed data, or finding a mismatch
prevents the deploy action from running.

### AC-3: guard ordering is structural

A harness proves freshness depends on `build`, `publish` depends on freshness, only `publish` owns
`pages` concurrency with `queue: max`, the second guard is inside `publish` before `deploy-pages`, no guard uses
`continue-on-error`, and provenance verification occurs before the publish job releases its lock and
before the visual live smoke.

### AC-4: deployed provenance is exact

`deploy-meta.json` contains only the run SHA and decimal-string run ID. The publish job fetches it in
  a bounded cache-busted loop with a 4096-byte curl cap and 50-second aggregate retry window; the CLI
  independently rejects standard input over 4096 bytes and requires both values to match `GITHUB_SHA`
  and `GITHUB_RUN_ID` before releasing concurrency. Playwright runs only after publish succeeds.

### AC-5: existing deployment behavior is preserved

Push-to-main and manual triggers remain. Serialized publication remains. Pages write and OIDC
authority are scoped to `publish`; build receives only the read access required by checkout and
`configure-pages`. Existing build, artifact, deployment, and visual live-smoke behavior remains.

### AC-6: verification

Fresh verification before commit and PR:

```powershell
npm run check
npm run test:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

Dependency review is not required. CI/deploy security review and PR coverage review are mandatory.
The PR references #104 and stays open until all available PR checks are green. It never merges or
deploys.

## Error handling

- Either GitHub API check failing, returning empty output, or returning a malformed SHA blocks deployment.
- A missing, stale, malformed, extra-keyed, wrong-run, or cache-poisoned metadata response is retried
  for a fixed bound and then fails the publish job.
- Error output abbreviates SHAs and does not print `GITHUB_TOKEN`, headers, or response bodies.
- The guard never falls back to the triggering SHA when current HEAD cannot be established.

## Non-goals

- Deleting historical workflow runs.
- Auto-merging or deploying the sprint PR.
- Adding Actions-write permission or an automatic redeploy loop.
- Changing Pages hosting, the Supabase backend, Vite configuration, or application behavior.
- Further dependency upgrades or package-lock changes.
