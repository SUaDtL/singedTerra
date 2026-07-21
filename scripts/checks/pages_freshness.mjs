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
  const buildStart = workflow.indexOf('\n  build:');
  const freshnessStart = workflow.indexOf('\n  freshness:');
  const publishStart = workflow.indexOf('\n  publish:');
  const smokeStart = workflow.indexOf('\n  live-smoke:');
  assert.ok(buildStart >= 0 && freshnessStart > buildStart && publishStart > freshnessStart && smokeStart > publishStart);
  const build = workflow.slice(buildStart, freshnessStart);
  const freshness = workflow.slice(freshnessStart, publishStart);
  const publish = workflow.slice(publishStart, smokeStart);
  const smoke = workflow.slice(smokeStart);
  const header = workflow.slice(0, buildStart);
  const triggerStart = header.indexOf('\non:');
  const triggerEnd = header.indexOf('\n# Least-privilege', triggerStart);
  assert.equal(
    header.slice(triggerStart + 1, triggerEnd),
    'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
  );
  assert.match(header, /permissions:\n  contents: read\n  pages: read\n/);
  assert.doesNotMatch(header, /pages: write|id-token: write/);
  assert.equal(workflow.match(/pages: read/g)?.length, 1);
  assert.equal(workflow.match(/pages: write/g)?.length, 1);
  assert.equal(workflow.match(/id-token: write/g)?.length, 1);
  const actionUses = [...workflow.matchAll(/^\s+(?:-\s+)?uses:\s+([^\s#]+)/gm)]
    .map((match) => match[1]);
  assert.deepEqual(actionUses, [
    'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
    'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
    'actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d',
    'actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa',
    'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
    'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
    'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128',
    'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
    'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
    'actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9',
  ]);
  assert.ok(actionUses.every((use) => /^[^/@]+\/[^/@]+@[0-9a-f]{40}$/.test(use)));
  assert.doesNotMatch(build, /\n    permissions:/);
  assert.match(freshness, /permissions:\n      contents: read\n/);
  assert.doesNotMatch(freshness, /pages:|id-token:/);
  assert.match(
    publish,
    /permissions:\n      contents: read\n      pages: write\n      id-token: write\n/,
  );
  assert.match(smoke, /permissions:\n      contents: read\n/);
  assert.doesNotMatch(smoke, /pages:|id-token:/);
  const checkoutCount = workflow.match(/uses: actions\/checkout@/g)?.length ?? 0;
  const noCredentialCheckouts = workflow.match(
    /uses: actions\/checkout@[^\n]+\n        with:\n          persist-credentials: false/g,
  )?.length ?? 0;
  assert.equal(noCredentialCheckouts, checkoutCount);
  const metadata = build.indexOf('name: Write deployment provenance');
  const upload = build.indexOf('actions/upload-pages-artifact@');
  assert.ok(metadata >= 0 && upload > metadata);
  assert.match(build, /pagesFreshness\.mjs write client\/dist\/deploy-meta\.json "\$GITHUB_SHA" "\$GITHUB_RUN_ID"/);
  assert.match(freshness, /needs: build/);
  assert.match(freshness, /name: Verify source is current main/);
  assert.match(publish, /needs: \[build, freshness\]/);
  assert.match(publish, /concurrency:[\s\S]*group: pages/);
  assert.match(
    publish,
    /concurrency:\n      group: pages\n      cancel-in-progress: false\n      queue: max\n/,
  );
  assert.equal(workflow.match(/group: pages/g)?.length, 1);
  assert.doesNotMatch(workflow.slice(0, publishStart), /group: pages/);
  assert.equal(workflow.match(/git\/ref\/heads\/main/g)?.length, 2);
  assert.equal(workflow.match(/pagesFreshness\.mjs check "\$GITHUB_SHA" "\$current_sha"/g)?.length, 2);
  const exactGuardScript = [
    '        run: |',
    '          set -euo pipefail',
    '          current_sha="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq \'.object.sha\')"',
    '          node scripts/ci/pagesFreshness.mjs check "$GITHUB_SHA" "$current_sha"',
  ].join('\n');
  assert.equal(freshness.match(new RegExp(exactGuardScript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length, 1);
  assert.equal(publish.match(new RegExp(exactGuardScript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length, 1);
  assert.match(workflow, /actions\/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d/);
  assert.match(publish, /actions\/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128/);
  const inLockGuard = publish.indexOf('name: Verify source is still current main');
  const deploy = publish.indexOf('id: deployment');
  const provenance = publish.indexOf('name: Verify deployed provenance');
  assert.ok(inLockGuard >= 0 && deploy > inLockGuard && provenance > deploy);
  assert.ok(publish.includes(
    '          node scripts/ci/pagesFreshness.mjs check "$GITHUB_SHA" "$current_sha"\n' +
    '      - id: deployment\n' +
    '        uses: actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5.0.0\n',
  ));
  const deployUses = publish.indexOf(
    'uses: actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128',
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
  assert.match(publish, /pagesFreshness\.mjs verify "\$GITHUB_SHA" "\$GITHUB_RUN_ID"/);
  assert.match(smoke, /needs: publish/);
  assert.doesNotMatch(freshness, /continue-on-error/);
  assert.doesNotMatch(publish, /continue-on-error/);
  const rootCheck = JSON.parse(readFileSync('package.json', 'utf8')).scripts.check;
  assert.equal(rootCheck.match(/npx tsx scripts\/checks\/pages_freshness\.mjs/g)?.length, 1);
}
