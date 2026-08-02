// Contract: the hosted Edge test job retries transient dependency-fetch outages
// without turning a persistent test failure green.
//
// Run: npx tsx scripts/checks/edge_ci_retry.mjs

import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const retryScript = 'scripts/ci/run-edge-tests.sh';

assert.match(workflow, /name: Run Edge tests with bounded retry/);
assert.match(workflow, /run: bash scripts\/ci\/run-edge-tests\.sh/);
assert.doesNotMatch(
  workflow,
  /^\s*(?:- )?run: deno test --allow-env supabase\/functions\//m,
);

function toBashPath(path) {
  return path
    .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`)
    .replaceAll('\\', '/');
}

function runScenario(failuresBeforeSuccess) {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'singedterra-edge-retry-'));
  const countFile = join(fixtureDir, 'count');
  const fakeDeno = join(fixtureDir, 'deno');
  const bashCountFile = toBashPath(countFile);

  writeFileSync(fakeDeno, `#!/usr/bin/env bash
count=0
if [ -f '${bashCountFile}' ]; then count=$(cat '${bashCountFile}'); fi
count=$((count + 1))
printf '%s' "$count" > '${bashCountFile}'
if [ "$count" -le ${failuresBeforeSuccess} ]; then
  echo "error: Import 'https://esm.sh/example' failed: 522" >&2
  exit 1
fi
exit 0
`);
  chmodSync(fakeDeno, 0o755);

  try {
    const result = spawnSync('bash', [retryScript], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        EDGE_TEST_RETRY_DELAY_SECONDS: '0',
        PATH: `${fixtureDir}${delimiter}${process.env.PATH ?? ''}`,
      },
    });
    if (!existsSync(countFile)) {
      throw new Error(
        `Fake deno was not invoked (status=${result.status}).\n${result.stdout}\n${result.stderr}`,
      );
    }
    const attempts = Number.parseInt(readFileSync(countFile, 'utf8'), 10);
    return { attempts, status: result.status, stderr: result.stderr };
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
}

assert.deepEqual(runScenario(0), { attempts: 1, status: 0, stderr: '' });

const recovered = runScenario(1);
assert.equal(recovered.status, 0);
assert.equal(recovered.attempts, 2);
assert.match(recovered.stderr, /522/);

const persistent = runScenario(99);
assert.equal(persistent.status, 1);
assert.equal(persistent.attempts, 3);
assert.match(persistent.stderr, /522/);

console.log('PASS: Edge CI succeeds immediately, recovers once, and preserves three failures.');
