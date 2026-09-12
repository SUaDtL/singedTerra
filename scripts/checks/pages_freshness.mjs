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
  ['g'.repeat(40), good],
  [undefined, good],
  [good, undefined],
]) {
  assert.throws(() => assertCurrentMain(candidate, current));
}
assert.equal(serializeDeployMeta(good, runId), serialized);
assert.doesNotThrow(() => assertDeployMeta(serialized, good, runId));
const oversizedMeta = `${' '.repeat(4096)}${serialized}`;
assert.throws(() => assertDeployMeta(oversizedMeta, good, runId));
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
const ciSource = readFileSync(cli, 'utf8').replace(/\r\n/g, '\n');
assert.match(ciSource, /const MAX_DEPLOY_META_BYTES = 4096;/);
const verifyMode = ciSource.indexOf("if (mode === 'verify')");
const streamLimit = ciSource.indexOf('if (bytesRead > MAX_DEPLOY_META_BYTES)', verifyMode);
const streamAppend = ciSource.indexOf('raw += chunk', verifyMode);
assert.ok(verifyMode >= 0 && streamLimit > verifyMode && streamAppend > streamLimit);
assert.equal(spawnSync(process.execPath, [cli, 'check', good, good]).status, 0);
assert.equal(spawnSync(process.execPath, [cli, 'verify', good, runId], { input: serialized }).status, 0);
assert.notEqual(
  spawnSync(process.execPath, [cli, 'verify', good, runId], { input: oversizedMeta }).status,
  0,
);
for (const args of [
  ['check', good, 'b'.repeat(40)],
  ['check', 'abc1234', good],
  ['check', good, 'A'.repeat(40)],
  ['unknown'],
]) {
  assert.notEqual(spawnSync(process.execPath, [cli, ...args]).status, 0);
}
const secretMarker = 'SUPER_SECRET_RAW_BODY_MARKER';
const malformedVerify = spawnSync(process.execPath, [cli, 'verify', good, runId], {
  input: `{malformed:${secretMarker}`,
  encoding: 'utf8',
});
assert.notEqual(malformedVerify.status, 0);
assert.doesNotMatch(
  `${malformedVerify.stdout}\n${malformedVerify.stderr}`,
  new RegExp(secretMarker),
);
for (const input of [
  `{"sha":"${'b'.repeat(40)}","runId":"${runId}"}\n`,
  `{"sha":"${good}","runId":"${Number(runId) + 1}"}\n`,
]) {
  assert.notEqual(
    spawnSync(process.execPath, [cli, 'verify', good, runId], { input }).status,
    0,
  );
}
const tempDir = mkdtempSync(join(tmpdir(), 'pages-meta-'));
try {
  const output = join(tempDir, 'deploy-meta.json');
  assert.equal(spawnSync(process.execPath, [cli, 'write', output, good, runId]).status, 0);
  assert.equal(readFileSync(output, 'utf8'), serialized);
  for (const args of [
    ['write'],
    ['write', output, 'abc1234', runId],
    ['write', output, good, '0'],
    ['write', join(tempDir, 'missing', 'deploy-meta.json'), good, runId],
  ]) {
    assert.notEqual(spawnSync(process.execPath, [cli, ...args]).status, 0);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

if (!process.argv.includes('--policy-only')) {
  const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8').replace(/\r\n/g, '\n');
  const gateStart = workflow.indexOf('\n  gate:');
  const buildStart = workflow.indexOf('\n  build:');
  const candidateTestStart = workflow.indexOf('\n  candidate-test:');
  const freshnessStart = workflow.indexOf('\n  freshness:');
  const publishStart = workflow.indexOf('\n  publish:');
  const smokeStart = workflow.indexOf('\n  live-smoke:');
  assert.ok(
    gateStart >= 0
      && buildStart > gateStart
      && candidateTestStart > buildStart
      && freshnessStart > candidateTestStart
      && publishStart > freshnessStart
      && smokeStart > publishStart,
  );
  const gate = workflow.slice(gateStart, buildStart);
  const build = workflow.slice(buildStart, candidateTestStart);
  const candidateTest = workflow.slice(candidateTestStart, freshnessStart);
  const freshness = workflow.slice(freshnessStart, publishStart);
  const publish = workflow.slice(publishStart, smokeStart);
  const smoke = workflow.slice(smokeStart);
  const header = workflow.slice(0, gateStart);
  assert.match(header, /on:\n  push:\n    branches: \[main\]\n  workflow_dispatch:\n    inputs:/);
  assert.match(header, /rollback_run_id:[\s\S]*rollback_source_sha:[\s\S]*expected_current_main_sha:[\s\S]*confirmation:/);
  assert.doesNotMatch(header, /pull_request_target|workflow_run/);
  assert.match(header, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(header, /pages: write|id-token: write/);
  assert.equal(workflow.match(/pages: read/g)?.length, 1);
  assert.equal(workflow.match(/pages: write/g)?.length, 1);
  assert.equal(workflow.match(/id-token: write/g)?.length, 1);
  const actionUses = [...workflow.matchAll(/^\s+(?:-\s+)?uses:\s+([^\s#]+)/gm)]
    .map((match) => match[1]);
  assert.ok(actionUses.every((use) => /^[^/@]+\/[^/@]+@[0-9a-f]{40}$/.test(use)));
  assert.match(gate, /releaseCandidate\.mjs gate/);
  assert.match(gate, /required_ci_run_attempt: \$\{\{ steps\.release\.outputs\.required_ci_run_attempt \}\}/);
  assert.match(gate, /actions: read/);
  assert.doesNotMatch(gate, /pages: write|id-token: write/);
  assert.match(build, /permissions:[\s\S]*actions: read[\s\S]*contents: read[\s\S]*pages: read/);
  assert.doesNotMatch(build, /pages: write|id-token: write/);
  assert.equal(workflow.match(/npm run build/g)?.length, 1);
  assert.match(build, /VITE_BASE: \/\$\{\{ github\.event\.repository\.name \}\}\//);
  assert.match(build, /VITE_SUPABASE_URL: \$\{\{ secrets\.VITE_SUPABASE_URL \}\}/);
  assert.match(build, /VITE_SUPABASE_ANON_KEY: \$\{\{ secrets\.VITE_SUPABASE_ANON_KEY \}\}/);
  assert.equal(build.match(/VITE_SUPABASE_ANON_KEY: \$\{\{ secrets\.VITE_SUPABASE_ANON_KEY \}\}/g)?.length, 2);
  assert.match(build, /releaseCandidate\.mjs write client\/dist/);
  assert.match(build, /releaseCandidate\.mjs verify client\/dist/);
  assert.match(build, /name: github-pages-\$\{\{ github\.run_id \}\}/);
  assert.match(build, /retention-days: 30/);
  assert.match(candidateTest, /artifact-ids: \$\{\{ needs\.build\.outputs\.artifact_id \}\}/);
  assert.match(candidateTest, /E2E_DENY_EXTERNAL_NETWORK: '1'/);
  assert.match(candidateTest, /VITE_BASE: \$\{\{ needs\.build\.outputs\.base_path \}\}/);
  assert.match(candidateTest, /npm run test:e2e -- --grep-invert @live --workers=2/);
  assert.match(candidateTest, /playwright test -c playwright\.product-completion\.config\.ts/);
  assert.match(candidateTest, /Prove browser execution did not mutate candidate bytes/);
  assert.match(candidateTest, /CANDIDATE_METADATA_SHA256: \$\{\{ needs\.build\.outputs\.candidate_metadata_sha256 \}\}/);
  assert.doesNotMatch(workflow, /needs\.build\.outputs\.supabase_origin/);
  assert.match(freshness, /permissions:\n      contents: read\n/);
  assert.doesNotMatch(freshness, /pages:|id-token:/);
  assert.match(
    publish,
    /permissions:\n      actions: read\n      contents: read\n      pages: write\n      id-token: write\n/,
  );
  assert.match(smoke, /permissions:\n      contents: read\n/);
  assert.doesNotMatch(smoke, /pages:|id-token:/);
  const checkoutCount = workflow.match(/uses: actions\/checkout@/g)?.length ?? 0;
  const noCredentialCheckouts = workflow.match(/persist-credentials: false/g)?.length ?? 0;
  assert.equal(noCredentialCheckouts, checkoutCount);
  assert.match(build, /path: client\/dist[\s\S]*include-hidden-files: true/);
  assert.match(freshness, /needs: \[gate, candidate-test\]/);
  assert.match(freshness, /name: Verify source approval is still current main/);
  assert.match(publish, /needs: \[gate, build, candidate-test, freshness\]/);
  assert.match(publish, /concurrency:[\s\S]*group: pages/);
  assert.match(
    publish,
    /concurrency:\n      group: pages\n      cancel-in-progress: false\n      queue: max\n/,
  );
  assert.equal(workflow.match(/group: pages/g)?.length, 1);
  assert.doesNotMatch(workflow.slice(0, publishStart), /group: pages/);
  assert.equal(workflow.match(/git\/ref\/heads\/main/g)?.length, 2);
  assert.equal(workflow.match(/pagesFreshness\.mjs check "\$\{\{ needs\.gate\.outputs\.expected_main_sha \}\}" "\$current_sha"/g)?.length, 2);
  assert.match(workflow, /actions\/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d/);
  assert.match(publish, /actions\/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346/);
  assert.match(publish, /artifact_name: github-pages-\$\{\{ github\.run_id \}\}/);
  const inLockGuard = publish.indexOf('name: Verify approved main snapshot after acquiring the deploy lock');
  const ciRevalidation = publish.indexOf('name: Revalidate the bound required CI attempt immediately before promotion');
  const deploy = publish.indexOf('id: deployment');
  const provenance = publish.indexOf('name: Verify public deployment provenance');
  assert.ok(inLockGuard >= 0 && ciRevalidation > inLockGuard && deploy > ciRevalidation && provenance > deploy);
  assert.match(publish, /releaseCandidate\.mjs revalidate-ci[\s\S]*REQUIRED_CI_RUN_ATTEMPT:[^\n]+\n      - id: deployment/);
  const deployUses = publish.indexOf(
    'uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346',
  );
  const deployStepStart = publish.lastIndexOf('\n      - ', deployUses);
  const deployStepEnd = publish.indexOf('\n      - ', deployUses);
  assert.ok(deployUses >= 0 && deployStepStart >= 0 && deployStepEnd > deployUses);
  const deployStep = publish.slice(deployStepStart + 1, deployStepEnd);
  assert.doesNotMatch(deployStep, /^\s+(?:-\s+)?if:/m);
  assert.equal(workflow.match(/uses: actions\/deploy-pages@/g)?.length, 1);
  assert.match(publish, /for attempt in 1 2 3 4 5 6 7 8 9/);
  const provenanceCurl = publish.slice(provenance).match(/if curl ([^\n]+) "\$meta_url" \\/)?.[0];
  assert.ok(provenanceCurl);
  assert.match(provenanceCurl, /--connect-timeout 5(?: |$)/);
  assert.match(provenanceCurl, /--max-time 15(?: |$)/);
  assert.match(provenanceCurl, /--max-filesize 4096(?: |$)/);
  assert.match(provenanceCurl, /--retry 2(?: |$)/);
  assert.match(provenanceCurl, /--retry-delay 1(?: |$)/);
  assert.match(provenanceCurl, /--retry-all-errors(?: |$)/);
  assert.match(provenanceCurl, /--retry-max-time 50(?: |$)/);
  assert.match(publish, /pagesFreshness\.mjs verify "\$CANDIDATE_SOURCE_SHA" "\$CANDIDATE_RUN_ID"/);
  assert.match(publish, /releaseCandidate\.mjs verify-meta/);
  assert.match(publish, /CANDIDATE_METADATA_SHA256: \$\{\{ needs\.build\.outputs\.candidate_metadata_sha256 \}\}/);
  assert.match(smoke, /needs: publish/);
  assert.doesNotMatch(gate, /continue-on-error/);
  assert.doesNotMatch(build, /continue-on-error/);
  assert.doesNotMatch(candidateTest, /continue-on-error/);
  assert.doesNotMatch(freshness, /continue-on-error/);
  assert.doesNotMatch(publish, /continue-on-error/);
  const rootCheck = JSON.parse(readFileSync('package.json', 'utf8')).scripts.check;
  assert.equal(rootCheck.match(/npx tsx scripts\/checks\/pages_freshness\.mjs/g)?.length, 1);
}
