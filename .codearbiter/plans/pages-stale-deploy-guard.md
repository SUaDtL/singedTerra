# Stale Pages Deployment Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Status:** APPROVED — user approved 2026-07-20.

**Goal:** Fail closed before a stale Pages run can deploy and prove which commit the live site serves.

**Architecture:** A pure dependency-free SHA comparator owns the policy. The Pages workflow runs `build → freshness → publish`; stale runs fail before entering the publish queue, publish rechecks `main` after acquiring concurrency and before deployment, and the deployed sentinel is verified before that lock is released.

**Tech Stack:** Node ES modules, existing npm harness chain, GitHub Actions, GitHub CLI, GitHub Pages, Playwright; no new dependency.

## Global Constraints

- Both candidate and current SHAs must be lowercase 40-character hexadecimal strings.
- Any API, parsing, validation, or equality failure blocks deployment.
- A pre-queue check rejects known-stale runs; an in-lock check closes the race before deployment.
- `deploy-meta.json` contains only string-valued `sha` and `runId` keys and is capped at 4096 bytes
  by both curl and the stdin verifier.
- Provenance curl uses exactly two retries, a one-second retry delay, all-error retries, and a
  50-second aggregate retry window in addition to its per-transfer timeouts.
- Only the `publish` job owns `pages` concurrency with `queue: max`; freshness runs before that queue.
- Workflow defaults are read-only; only `publish` receives Pages write and OIDC authority.
- Every checkout disables credential persistence because no job performs authenticated Git writes.
- No new action publisher, permission, secret, deployment target, package, or lockfile change.
- Historical pre-fix runs are not claimed as retroactively governed.
- codeArbiter owns commits; task workers do not commit independently.

## File map

- Create `scripts/ci/pagesFreshness.mjs`: SHA comparison, exact sentinel policy, and CLI modes.
- Create `scripts/checks/pages_freshness.mjs`: policy matrix and workflow-order contract.
- Modify `package.json`: append the new harness to `npm run check`.
- Modify `.github/workflows/deploy-pages.yml`: metadata, two HEAD guards, and live provenance check.
- Modify sprint spec/plan status and append decisions/receipts to `.codearbiter/sprint-log.md`.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | Pure freshness policy and mutation-sensitive harness | — | focused harness RED/GREEN | ACCEPTED |
| T2 | Two-stage workflow guard and provenance sentinel | T1 | workflow contract plus full suite | ACCEPTED |
| T3 | Review closure, commit, PR, and green CI | T2 | commit/PR gates and hosted checks | PENDING |

---

### Task 1: Pure freshness policy and harness

**Files:**

- Create: `scripts/ci/pagesFreshness.mjs`
- Create: `scripts/checks/pages_freshness.mjs`

**Interfaces:**

- Produces `assertCurrentMain(candidateSha, currentMainSha): void`.
- Produces `serializeDeployMeta(sha, runId): string` with one exact two-key JSON object and newline.
- Produces `assertDeployMeta(rawJson, expectedSha, expectedRunId): void`.
- CLI `check`, `write`, and `verify` modes reuse those exports; `verify` reads JSON from stdin.
- T2 invokes the same CLI surfaces covered by the focused harness.

- [ ] **Step 1: Write the failing policy and workflow-contract harness**

Create `scripts/checks/pages_freshness.mjs` with table-driven assertions for exact match, mismatch,
short SHA, uppercase/non-hex SHA, and missing input. Read `.github/workflows/deploy-pages.yml` and
assert the `build → freshness → publish` dependency graph, publish-only concurrency, metadata before
upload, provenance verification inside publish after deploy, and visual smoke after publish.

Use this structure (the import is the intentional RED seam):

```js
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertCurrentMain,
  assertDeployMeta,
  serializeDeployMeta,
} from '../ci/pagesFreshness.mjs';

const good = 'a'.repeat(40);
const runId = '29793872670';
const serialized = `{"sha":"${good}","runId":"${runId}"}\n`;
assert.doesNotThrow(() => assertCurrentMain(good, good));
for (const [candidate, current] of [
  ['a'.repeat(40), 'b'.repeat(40)],
  ['abc1234', good],
  ['A'.repeat(40), good],
  [undefined, good],
  [good, undefined],
]) {
  assert.throws(() => assertCurrentMain(candidate, current));
}
assert.equal(serializeDeployMeta(good, runId), serialized);
assert.doesNotThrow(() => assertDeployMeta(serialized, good, runId));
for (const raw of [
  '{}',
  'not-json',
  `{"sha":"${good}","runId":"0"}`,
  `{"sha":"${good}","runId":"${runId}","extra":true}`,
  `{"sha":"${'b'.repeat(40)}","runId":"${runId}"}`,
]) {
  assert.throws(() => assertDeployMeta(raw, good, runId));
}

const cli = resolve('scripts/ci/pagesFreshness.mjs');
assert.equal(spawnSync(process.execPath, [cli, 'check', good, good]).status, 0);
assert.equal(spawnSync(process.execPath, [cli, 'verify', good, runId], { input: serialized }).status, 0);
const tempDir = mkdtempSync(join(tmpdir(), 'pages-meta-'));
try {
  const output = join(tempDir, 'deploy-meta.json');
  assert.equal(spawnSync(process.execPath, [cli, 'write', output, good, runId]).status, 0);
  assert.equal(readFileSync(output, 'utf8'), serialized);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

if (!process.argv.includes('--policy-only')) {
  const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
  const buildStart = workflow.indexOf('\n  build:');
  const freshnessStart = workflow.indexOf('\n  freshness:');
  const publishStart = workflow.indexOf('\n  publish:');
  const smokeStart = workflow.indexOf('\n  live-smoke:');
  assert.ok(buildStart >= 0 && freshnessStart > buildStart && publishStart > freshnessStart && smokeStart > publishStart);
  const build = workflow.slice(buildStart, freshnessStart);
  const freshness = workflow.slice(freshnessStart, publishStart);
  const publish = workflow.slice(publishStart, smokeStart);
  const metadata = build.indexOf('name: Write deployment provenance');
  const upload = build.indexOf('actions/upload-pages-artifact@');
  assert.ok(metadata >= 0 && upload > metadata);
  assert.match(build, /pagesFreshness\.mjs write client\/dist\/deploy-meta\.json "\$GITHUB_SHA" "\$GITHUB_RUN_ID"/);
  assert.match(freshness, /needs: build/);
  assert.match(freshness, /name: Verify source is current main/);
  assert.match(publish, /needs: \[build, freshness\]/);
  assert.match(publish, /concurrency:[\s\S]*group: pages/);
  assert.equal(workflow.match(/group: pages/g)?.length, 1);
  assert.doesNotMatch(workflow.slice(0, publishStart), /group: pages/);
  assert.equal(workflow.match(/git\/ref\/heads\/main/g)?.length, 2);
  assert.equal(workflow.match(/pagesFreshness\.mjs check "\$GITHUB_SHA" "\$current_sha"/g)?.length, 2);
  assert.match(workflow, /actions\/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d/);
  assert.match(publish, /actions\/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128/);
  const inLockGuard = publish.indexOf('name: Verify source is still current main');
  const deploy = publish.indexOf('id: deployment');
  const provenance = publish.indexOf('name: Verify deployed provenance');
  assert.ok(inLockGuard >= 0 && deploy > inLockGuard && provenance > deploy);
  assert.match(publish, /for attempt in 1 2 3 4 5 6 7 8 9/);
  assert.match(publish, /pagesFreshness\.mjs verify "\$GITHUB_SHA" "\$GITHUB_RUN_ID"/);
  assert.match(workflow.slice(smokeStart), /needs: publish/);
  assert.doesNotMatch(freshness, /continue-on-error/);
  assert.doesNotMatch(publish, /continue-on-error/);
}
```

- [ ] **Step 2: Run the focused harness and prove RED**

```powershell
npx tsx scripts/checks/pages_freshness.mjs
```

Expected: nonzero because `scripts/ci/pagesFreshness.mjs` does not exist.

- [ ] **Step 3: Implement the minimal provenance policy and CLI**

Create `scripts/ci/pagesFreshness.mjs` with exact SHA/run-ID validation, equality checks, exact
two-key metadata serialization, and `check`, `write`, and stdin-based `verify` CLI modes. Diagnostics
must abbreviate SHAs and never print tokens or response bodies.

```js
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FULL_SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9][0-9]*$/;
const short = (value) => FULL_SHA.test(value ?? '') ? value.slice(0, 12) : '<invalid>';

function assertSha(value, label) {
  if (!FULL_SHA.test(value ?? '')) throw new Error(`Invalid ${label} SHA.`);
}

function assertRunId(value) {
  if (!RUN_ID.test(value ?? '')) throw new Error('Invalid Pages run ID.');
}

export function assertCurrentMain(candidateSha, currentMainSha) {
  assertSha(candidateSha, 'source');
  assertSha(currentMainSha, 'main');
  if (candidateSha !== currentMainSha) {
    throw new Error(
      `Refusing stale Pages deploy: run ${short(candidateSha)} != main ${short(currentMainSha)}.`,
    );
  }
}

export function serializeDeployMeta(sha, runId) {
  assertSha(sha, 'deployment');
  assertRunId(runId);
  return `${JSON.stringify({ sha, runId })}\n`;
}

export function assertDeployMeta(rawJson, expectedSha, expectedRunId) {
  assertSha(expectedSha, 'expected deployment');
  assertRunId(expectedRunId);
  let meta;
  try {
    meta = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid Pages deployment metadata.');
  }
  if (!meta || Array.isArray(meta) || typeof meta !== 'object') {
    throw new Error('Invalid Pages deployment metadata.');
  }
  const keys = Object.keys(meta).sort();
  if (keys.length !== 2 || keys[0] !== 'runId' || keys[1] !== 'sha') {
    throw new Error('Invalid Pages deployment metadata shape.');
  }
  if (typeof meta.sha !== 'string' || typeof meta.runId !== 'string') {
    throw new Error('Invalid Pages deployment metadata types.');
  }
  assertCurrentMain(meta.sha, expectedSha);
  assertRunId(meta.runId);
  if (meta.runId !== expectedRunId) throw new Error('Served Pages run ID does not match.');
}

async function main([mode, ...args]) {
  if (mode === 'check') return assertCurrentMain(args[0], args[1]);
  if (mode === 'write') {
    if (!args[0]) throw new Error('Missing Pages metadata output path.');
    return writeFileSync(args[0], serializeDeployMeta(args[1], args[2]), 'utf8');
  }
  if (mode === 'verify') {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    return assertDeployMeta(raw, args[0], args[1]);
  }
  throw new Error('Unknown Pages freshness command.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Pages freshness check failed.');
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run the focused policy cases**

```powershell
npx tsx scripts/checks/pages_freshness.mjs --policy-only
```

Expected: policy, serialization, and CLI cases pass while workflow-contract assertions remain red.

- [ ] **Step 5: Request task review**

Reviewer must reject token-bearing diagnostics, permissive malformed-input behavior, or a harness
that reimplements rather than imports the production policy. The root `npm run check` command remains
unchanged and green until Task 2 makes the workflow assertions pass.

---

### Task 2: Two-stage Pages freshness topology and provenance sentinel

**Files:**

- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `scripts/checks/pages_freshness.mjs`
- Modify: `scripts/ci/pagesFreshness.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes all three policy exports through the `check`, `write`, and `verify` CLI modes.
- Produces `client/dist/deploy-meta.json` with exact string-valued `sha` and `runId` keys.
- Publish verifies the deployed sentinel before releasing concurrency; Playwright runs afterward.

- [ ] **Step 1: Confirm workflow-contract RED**

Run the Task 1 harness without `--policy-only`.

Expected: failure naming the first absent workflow marker.

- [ ] **Step 2: Write artifact metadata before upload**

Add a named build step immediately before `actions/upload-pages-artifact` that uses the shared CLI
to validate `GITHUB_SHA` and write the exact compact sentinel.

```yaml
      - name: Write deployment provenance
        run: node scripts/ci/pagesFreshness.mjs write client/dist/deploy-meta.json "$GITHUB_SHA" "$GITHUB_RUN_ID"
```

- [ ] **Step 3: Add the fail-closed freshness job**

Create `freshness` with `needs: build`:

1. check out the triggering revision with the existing pinned checkout action;
2. resolve current `main` HEAD with `gh api` under `GH_TOKEN: ${{ github.token }}`;
3. run `node scripts/ci/pagesFreshness.mjs check "$GITHUB_SHA" "$current_sha"`.

Use `set -euo pipefail`. Do not add `continue-on-error` or a fallback SHA. The job must finish before
any run enters `pages` concurrency.

```yaml
  freshness:
    name: verify current main
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - name: Verify source is current main
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          current_sha="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')"
          node scripts/ci/pagesFreshness.mjs check "$GITHUB_SHA" "$current_sha"
```

- [ ] **Step 4: Move concurrency to publish and recheck freshness inside it**

Rename the deploy job to `publish`, with `needs: [build, freshness]`, job-scoped
`contents: read`, `pages: write`, and `id-token: write`, and job-level
`concurrency: { group: pages, cancel-in-progress: false, queue: max }`. Keep the workflow default at
`contents: read` plus `pages: read`. After the job acquires that lock, check
out the run revision and query `main` HEAD again. Invoke the comparator immediately before
`actions/deploy-pages`; do not reuse the pre-queue job's result. After deployment, fetch
`deploy-meta.json` in a bounded loop with run-ID and attempt cache busters. Cap curl and the CLI's
  incremental standard-input reader at 4096 bytes. Use exactly two retries, a one-second delay,
  all-error retries, and a 50-second aggregate retry window. Pipe every HTTP-200 body to the shared
  `verify` mode so semantic staleness is retried as well as network failure. Make the existing visual
  smoke depend on `publish`.

```yaml
  publish:
    name: deploy to Pages
    needs: [build, freshness]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    concurrency:
      group: pages
      cancel-in-progress: false
      queue: max
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    outputs:
      page_url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - name: Verify source is still current main
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          current_sha="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')"
          node scripts/ci/pagesFreshness.mjs check "$GITHUB_SHA" "$current_sha"
      - id: deployment
        uses: actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5.0.0
      - name: Verify deployed provenance
        env:
          PAGE_URL: ${{ steps.deployment.outputs.page_url }}
        run: |
          set -euo pipefail
          for attempt in 1 2 3 4 5 6 7 8 9; do
            meta_url="${PAGE_URL%/}/deploy-meta.json?run=${GITHUB_RUN_ID}&attempt=${attempt}"
            if curl --fail --silent --show-error --connect-timeout 5 --max-time 15 --max-filesize 4096 --retry 2 --retry-delay 1 --retry-max-time 50 --retry-all-errors "$meta_url" \
              | node scripts/ci/pagesFreshness.mjs verify "$GITHUB_SHA" "$GITHUB_RUN_ID"; then
              exit 0
            fi
            if [ "$attempt" -eq 9 ]; then
              echo "Deployed provenance did not converge after 9 attempts." >&2
              exit 1
            fi
            sleep 2
          done
```

Change the live-smoke dependency and URL reference exactly:

```yaml
  live-smoke:
    needs: publish
    runs-on: ubuntu-latest
    steps:
      # Retain the current checkout, Node, cache, and Playwright install steps.
      - name: Live render smoke
        run: npm run test:e2e -- --grep @live --project=pixel-touch
        env:
          E2E_LIVE_URL: ${{ needs.publish.outputs.page_url }}
```

- [ ] **Step 5: Run focused tests to GREEN**

```powershell
npx tsx scripts/checks/pages_freshness.mjs
```

Expected: all policy and workflow-order assertions pass.

- [ ] **Step 6: Wire the green harness into the deterministic check chain**

Append `&& npx tsx scripts/checks/pages_freshness.mjs` to the root `check` script in `package.json`,
then run `npm run check` once to prove the new root command includes the harness and remains green.

- [ ] **Step 7: Run the full verification matrix**

```powershell
npm run check
npm run test:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

Expected: every command exits 0; only normal Windows line-ending warnings are allowed.

- [ ] **Step 8: Request task review and mandatory CI/deploy security review**

Review must cover trigger preservation, least privilege, SHA/action pinning, token non-disclosure,
both fail-closed checkpoints, time-of-check/time-of-use closure, step ordering, and the documented
historical-run limitation.

---

### Task 3: Landing gates and green pull request

**Files:**

- Modify: `.codearbiter/specs/pages-stale-deploy-guard.md`
- Modify: `.codearbiter/plans/pages-stale-deploy-guard.md`
- Append only: `.codearbiter/sprint-log.md`

**Interfaces:**

- Consumes T2's reviewed diff and fresh verification receipts.
- Produces one governed commit and one open PR referencing #104.

- [ ] **Step 1: Run whole-diff review and PR coverage audit**

Zero Critical/Important or CRITICAL/HIGH findings may remain. Fixes require focused reruns and one
complete final matrix.

- [ ] **Step 2: Append SMARTS and verification receipts**

Record selection rationale, approach decision, RED/GREEN evidence, review outcomes, and the residual
legacy-run window without editing prior sprint-log lines.

- [ ] **Step 3: Run `$ca-commit`**

Stage exact paths only. Classification is `ci`. Secret scan, full suite, behavioral proof, diff
review, and CI/deploy security review must all pass.

- [ ] **Step 4: Run `$ca-pr`**

Open a PR that references #104 without auto-closing it while a pre-guard run remains rerunnable.
Do not merge or deploy.

- [ ] **Step 5: Run `$ca-watch`**

Watch all available PR checks to green. The Pages deployment workflow does not execute on PRs, so
the handoff must explicitly reserve live provenance acceptance for a later main deployment.
