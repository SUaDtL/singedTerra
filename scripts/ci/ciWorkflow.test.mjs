import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8').replace(/\r\n/g, '\n');
const pages = readFileSync('.github/workflows/deploy-pages.yml', 'utf8').replace(/\r\n/g, '\n');

function job(source, id) {
  const found = source.match(new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [A-Za-z_][A-Za-z0-9_-]*:|$)`));
  assert.ok(found, `Missing job ${id}`);
  return found[1];
}

function assertWorkflow(source) {
  assert.match(source, /on:\n  pull_request:\n  push:\n    branches: \[main\]/);
  assert.doesNotMatch(source, /paths-ignore:|pull_request_target|continue-on-error/);
  const scope = job(source, 'scope');
  assert.match(scope, /PR_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(scope, /PR_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(scope, /PUSH_BASE_SHA: \$\{\{ github\.event\.before \}\}/);
  assert.match(scope, /PUSH_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(scope, /Unsupported CI event/);
  assert.match(scope, /node --test scripts\/checks\/manual_baseline\.test\.mjs/);
  assert.match(scope, /migration_classification\.mjs --check history --base "\$base" --head "\$head"/);
  assert.match(scope, /CI_BASE_SHA="\$base" CI_HEAD_SHA="\$head" node scripts\/ci\/changeScope\.mjs/);
  for (const [id, name, work] of [
    ['check', 'typecheck · harnesses · build', 'check-work'],
    ['edge', 'edge function tests (deno)', 'edge-work'],
    ['e2e', 'e2e · rendering guardrails', 'browser'],
  ]) {
    const gate = job(source, id);
    assert.ok(gate.includes(`name: ${name}\n`));
    assert.ok(gate.includes(`needs: [scope, ${work}]`));
    assert.match(gate, /if: always\(\)/);
    assert.match(gate, /run: node scripts\/ci\/requiredResult\.mjs/);
    assert.match(gate, /SCOPE_RESULT: \$\{\{ needs\.scope\.result \}\}/);
    assert.match(gate, /DOCS_ONLY: \$\{\{ needs\.scope\.outputs\.docs_only \}\}/);
    assert.ok(gate.includes(`WORK_RESULT: \u0024{{ needs.${work}.result }}`));
    assert.match(job(source, work), /needs: scope\n    if: needs\.scope\.outputs\.docs_only == 'false'/);
  }
  const browser = job(source, 'browser');
  assert.match(browser, /fail-fast: false/);
  assert.match(browser, /lane: \[core-1, core-2, product\]/);
  for (const shard of [1, 2]) {
    assert.ok(browser.includes(`if: matrix.lane == 'core-${shard}'\n        run: npm run test:e2e -- --shard=${shard}/2 --workers=2`));
  }
  assert.match(browser, /if: matrix\.lane == 'product'\n        run: npx playwright test -c playwright\.product-completion\.config\.ts/);
  assert.match(browser, /name: playwright-\$\{\{ matrix\.lane \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.equal(source.match(/uses: actions\/checkout@/g)?.length, source.match(/persist-credentials: false/g)?.length);
}

function assertCandidateMatrix(source) {
  const candidate = job(source, 'candidate-test');
  assert.match(candidate, /fail-fast: false/);
  assert.match(candidate, /lane: \[core-1, core-2, product\]/);
  for (const shard of [1, 2]) {
    assert.ok(candidate.includes(`core-${shard}) npm run test:e2e -- --grep-invert @live --workers=2 --shard=${shard}/2 ;;`));
  }
  assert.match(candidate, /product\) npx playwright test -c playwright\.product-completion\.config\.ts ;;/);
  assert.match(candidate, /BROWSER_LANE: \$\{\{ matrix\.lane \}\}/);
  const checks = [...candidate.matchAll(/node scripts\/ci\/releaseCandidate\.mjs verify client\/dist/g)];
  assert.equal(checks.length, 2);
  const execute = candidate.indexOf('case "$BROWSER_LANE"');
  assert.ok(checks[0].index < execute && checks[1].index > execute);
  assert.match(candidate, /artifact-ids: \$\{\{ needs\.build\.outputs\.artifact_id \}\}/);
  assert.match(candidate, /E2E_DENY_EXTERNAL_NETWORK: '1'/);
  assert.match(job(source, 'freshness'), /needs: \[gate, candidate-test\]/);
  assert.match(job(source, 'publish'), /needs: \[gate, build, candidate-test, freshness\]/);
}

test('every required check validates classified work and the complete browser matrix', () => assertWorkflow(ci));
test('removed classification, result validation, shards and optionalized work are rejected', () => {
  for (const [from, to] of [
    ['if: always()', 'if: success()'],
    ['needs: [scope, browser]', 'needs: [scope]'],
    ['node scripts/ci/requiredResult.mjs', 'echo skipped'],
    ["if: needs.scope.outputs.docs_only == 'false'", "if: false"],
    ['--shard=2/2', '--shard=1/2'],
    ['lane: [core-1, core-2, product]', 'lane: [core-1, product]'],
    ['--check history', '--check inventory'],
    ['CI_BASE_SHA="$base"', 'CI_BASE_SHA=""'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['WORK_RESULT: ${{ needs.browser.result }}', 'WORK_RESULT: success'],
  ]) assert.throws(() => assertWorkflow(ci.replace(from, to)), from);
});
test('all candidate shards prove the same bytes before and after execution', () => assertCandidateMatrix(pages));
test('candidate matrix rejects omitted coverage or digest verification', () => {
  for (const [from, to] of [
    ['lane: [core-1, core-2, product]', 'lane: [core-1, product]'],
    ['--shard=2/2', '--shard=1/2'],
    ['product) npx playwright test', 'product) echo skipped'],
    ['node scripts/ci/releaseCandidate.mjs verify client/dist', 'echo verified'],
    ["E2E_DENY_EXTERNAL_NETWORK: '1'", "E2E_DENY_EXTERNAL_NETWORK: '0'"],
    ['artifact-ids: ${{ needs.build.outputs.artifact_id }}', 'name: arbitrary'],
    ['needs: [gate, candidate-test]', 'needs: [gate]'],
  ]) assert.throws(() => assertCandidateMatrix(pages.replaceAll(from, to)), from);
});
