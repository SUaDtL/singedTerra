import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertCandidate,
  authorizeRollback,
  digestPublicConfig,
  digestPayload,
  selectRequiredCiRun,
  writeCandidateMetadata,
} from './releaseCandidate.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const DIGEST_SCOPE = 'regular-files-v1:exclude=/release-candidate.json';
const BASE_PATH = '/singedTerra/';
const SUPABASE_URL = 'https://example.supabase.co';
const SUPABASE_ANON_KEY = 'test-public-anon-key';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'singedterra-candidate-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<main>candidate</main>\n');
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log("candidate")\n');
  writeFileSync(join(root, 'deploy-meta.json'), `{"sha":"${SHA_A}","runId":"101"}\n`);
  return root;
}

function writeMeta(root) {
  return writeCandidateMetadata(root, {
    sourceSha: SHA_A,
    candidateRunId: '101',
    requiredCiRunId: '202',
    basePath: BASE_PATH,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  });
}

function metadataDigest(raw) {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function verifyPublishedMetadata(raw, overrides = {}) {
  return spawnSync(process.execPath, ['scripts/ci/releaseCandidate.mjs', 'verify-meta'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: raw,
    env: {
      ...process.env,
      CANDIDATE_SOURCE_SHA: SHA_A,
      CANDIDATE_RUN_ID: '101',
      REQUIRED_CI_RUN_ID: '202',
      CANDIDATE_PAYLOAD_SHA256: JSON.parse(raw).payloadSha256,
      PUBLIC_CONFIG_SHA256: JSON.parse(raw).publicConfigSha256,
      CANDIDATE_BASE_PATH: BASE_PATH,
      CANDIDATE_METADATA_SHA256: '',
      ...overrides,
    },
  });
}

function runCandidateMode(mode, root, env) {
  return spawnSync(process.execPath, ['scripts/ci/releaseCandidate.mjs', mode, root], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('payload digest is deterministic and excludes only its self-referential provenance record', () => {
  const root = fixture();
  try {
    const first = digestPayload(root);
    writeFileSync(join(root, 'release-candidate.json'), '{"ignored":true}\n');
    assert.equal(digestPayload(root), first);
    assert.match(first, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('candidate verification detects changed, added, deleted, and renamed payload bytes', () => {
  for (const mutate of [
    (root) => writeFileSync(join(root, 'index.html'), '<main>changed</main>\n'),
    (root) => writeFileSync(join(root, 'extra.txt'), 'extra\n'),
    (root) => rmSync(join(root, 'assets', 'app.js')),
    (root) => {
      const body = readFileSync(join(root, 'assets', 'app.js'));
      rmSync(join(root, 'assets', 'app.js'));
      writeFileSync(join(root, 'assets', 'renamed.js'), body);
    },
  ]) {
    const root = fixture();
    try {
      writeMeta(root);
      mutate(root);
      assert.throws(() => assertCandidate(root, {
        sourceSha: SHA_A,
        candidateRunId: '101',
        requiredCiRunId: '202',
      }), /digest/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('candidate metadata is exact, source-bound, and non-circular', () => {
  const root = fixture();
  try {
    const meta = writeMeta(root);
    assert.equal(meta.publicConfigSha256, digestPublicConfig({
      basePath: BASE_PATH,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
    }));
    assert.notEqual(meta.publicConfigSha256, digestPublicConfig({
      basePath: BASE_PATH,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: `${SUPABASE_ANON_KEY}-changed`,
    }));
    assert.deepEqual(Object.keys(meta).sort(), [
      'basePath',
      'candidateRunId',
      'digestScope',
      'payloadSha256',
      'publicConfigSha256',
      'requiredCiRunId',
      'schemaVersion',
      'sourceSha',
      'supabaseOrigin',
    ]);
    assert.equal(meta.digestScope, DIGEST_SCOPE);
    assert.doesNotThrow(() => assertCandidate(root, {
      sourceSha: SHA_A,
      candidateRunId: '101',
      requiredCiRunId: '202',
    }));
    assert.throws(() => assertCandidate(root, {
      sourceSha: SHA_B,
      candidateRunId: '101',
      requiredCiRunId: '202',
    }), /source/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('candidate verification binds required public deploy metadata', () => {
  for (const deployMeta of [
    null,
    '{malformed',
    `{"sha":"${SHA_B}","runId":"101"}\n`,
    `{"sha":"${SHA_A}","runId":"999"}\n`,
  ]) {
    const root = fixture();
    try {
      writeMeta(root);
      if (deployMeta === null) rmSync(join(root, 'deploy-meta.json'));
      else writeFileSync(join(root, 'deploy-meta.json'), deployMeta);
      assert.throws(() => assertCandidate(root, {
        sourceSha: SHA_A,
        candidateRunId: '101',
        requiredCiRunId: '202',
      }), /deployment metadata|invalid|digest|main|served Pages/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('production configuration is explicit and transport expectations are enforced', () => {
  const root = fixture();
  try {
    assert.throws(() => writeCandidateMetadata(root, {
      sourceSha: SHA_A,
      candidateRunId: '101',
      requiredCiRunId: '202',
    }), /base path|Supabase|anon key/i);
    const meta = writeMeta(root);
    assert.throws(() => assertCandidate(root, {
      basePath: '/other/',
      supabaseOrigin: SUPABASE_URL,
      publicConfigSha256: meta.publicConfigSha256,
    }), /base path/i);
    assert.throws(() => assertCandidate(root, {
      basePath: BASE_PATH,
      supabaseOrigin: 'https://other.supabase.co',
      publicConfigSha256: meta.publicConfigSha256,
    }), /Supabase origin/i);
    assert.throws(() => assertCandidate(root, {
      basePath: BASE_PATH,
      supabaseOrigin: SUPABASE_URL,
      publicConfigSha256: 'f'.repeat(64),
    }), /public config/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('published metadata requires a complete externally bound expectation set', () => {
  const root = fixture();
  try {
    writeMeta(root);
    const raw = readFileSync(join(root, 'release-candidate.json'), 'utf8');
    const result = verifyPublishedMetadata(raw);
    assert.notEqual(result.status, 0, 'verify-meta accepted metadata without its transport digest');
    assert.match(result.stderr, /metadata digest|required release expectation/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('published metadata digest binds the public Supabase origin when direct origin output is suppressed', () => {
  const root = fixture();
  try {
    writeMeta(root);
    const raw = readFileSync(join(root, 'release-candidate.json'), 'utf8');
    const expectedDigest = metadataDigest(raw);
    assert.equal(verifyPublishedMetadata(raw, {
      CANDIDATE_METADATA_SHA256: expectedDigest,
    }).status, 0);

    const tampered = `${JSON.stringify({
      ...JSON.parse(raw),
      supabaseOrigin: 'https://other.supabase.co',
    })}\n`;
    const changed = verifyPublishedMetadata(tampered, {
      CANDIDATE_METADATA_SHA256: expectedDigest,
    });
    assert.notEqual(changed.status, 0, 'verify-meta accepted a changed origin with the build-bound digest');
    assert.match(changed.stderr, /metadata digest/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('transport verification rejects metadata tampering through the safe metadata digest', () => {
  const root = fixture();
  try {
    writeMeta(root);
    const path = join(root, 'release-candidate.json');
    const raw = readFileSync(path, 'utf8');
    const expectedDigest = metadataDigest(raw);
    writeFileSync(path, `${JSON.stringify({
      ...JSON.parse(raw),
      supabaseOrigin: 'https://other.supabase.co',
    })}\n`);
    assert.throws(() => assertCandidate(root, {
      sourceSha: SHA_A,
      candidateRunId: '101',
      requiredCiRunId: '202',
      candidateMetadataSha256: expectedDigest,
    }), /metadata digest/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('transport verification requires every safe cross-job expectation', () => {
  const root = fixture();
  const outputRoot = mkdtempSync(join(tmpdir(), 'singedterra-output-'));
  try {
    const meta = writeMeta(root);
    const metadataRaw = readFileSync(join(root, 'release-candidate.json'), 'utf8');
    const env = {
      CANDIDATE_SOURCE_SHA: SHA_A,
      CANDIDATE_RUN_ID: '101',
      REQUIRED_CI_RUN_ID: '202',
      CANDIDATE_PAYLOAD_SHA256: meta.payloadSha256,
      PUBLIC_CONFIG_SHA256: meta.publicConfigSha256,
      CANDIDATE_BASE_PATH: BASE_PATH,
      CANDIDATE_METADATA_SHA256: metadataDigest(metadataRaw),
      GITHUB_OUTPUT: join(outputRoot, 'verify-output.txt'),
    };
    assert.equal(runCandidateMode('verify', root, env).status, 0);
    for (const name of [
      'CANDIDATE_SOURCE_SHA',
      'CANDIDATE_RUN_ID',
      'REQUIRED_CI_RUN_ID',
      'CANDIDATE_PAYLOAD_SHA256',
      'PUBLIC_CONFIG_SHA256',
      'CANDIDATE_BASE_PATH',
      'CANDIDATE_METADATA_SHA256',
    ]) {
      const missing = { ...env, [name]: '' };
      const result = runCandidateMode('verify', root, missing);
      assert.notEqual(result.status, 0, `verify accepted missing ${name}`);
      assert.match(result.stderr, /missing required release expectation/i);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('rollback verification preserves the selected tested artifact and emits only safe bindings', () => {
  const root = fixture();
  const outputRoot = mkdtempSync(join(tmpdir(), 'singedterra-output-'));
  try {
    const meta = writeMeta(root);
    const output = join(outputRoot, 'rollback-output.txt');
    const result = runCandidateMode('verify-rollback', root, {
      CANDIDATE_SOURCE_SHA: SHA_A,
      CANDIDATE_RUN_ID: '101',
      GITHUB_OUTPUT: output,
    });
    assert.equal(result.status, 0, result.stderr);
    const values = readFileSync(output, 'utf8');
    assert.match(values, new RegExp(`payload_sha256=${meta.payloadSha256}`));
    assert.match(values, new RegExp(`public_config_sha256=${meta.publicConfigSha256}`));
    assert.match(values, /candidate_metadata_sha256=[0-9a-f]{64}/);
    assert.doesNotMatch(values, /supabase_origin|example\.supabase\.co|anon/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('symlinks and non-regular payload entries fail closed', (t) => {
  const root = fixture();
  try {
    try {
      symlinkSync(join(root, 'index.html'), join(root, 'linked.html'));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EPERM') {
        t.skip('symlink creation is unavailable on this host');
        return;
      }
      throw error;
    }
    assert.throws(() => digestPayload(root), /regular file|symbolic link/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('only a successful exact-SHA push/main CI run is accepted', () => {
  const valid = {
    id: 9,
    event: 'push',
    head_branch: 'main',
    head_sha: SHA_A,
    path: '.github/workflows/ci.yml',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
  };
  assert.equal(selectRequiredCiRun([valid], SHA_A).id, 9);
  assert.equal(selectRequiredCiRun([
    { ...valid, id: 8, conclusion: 'failure' },
    valid,
  ], SHA_A).id, 9);
  assert.throws(() => selectRequiredCiRun([
    valid,
    { ...valid, id: 10, status: 'in_progress', conclusion: null },
  ], SHA_A), /has not succeeded/i);
  assert.throws(() => selectRequiredCiRun([
    valid,
    { ...valid, id: 10, conclusion: 'failure' },
  ], SHA_A), /concluded failure/i);
  for (const changed of [
    { head_sha: SHA_B },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { path: '.github/workflows/other.yml' },
    { status: 'in_progress', conclusion: null },
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
  ]) {
    assert.throws(() => selectRequiredCiRun([{ ...valid, ...changed }], SHA_A));
  }
});

test('publish revalidation binds the exact current attempt and refuses replacement evidence', async () => {
  const valid = {
    id: 9,
    event: 'push',
    head_branch: 'main',
    head_sha: SHA_A,
    path: '.github/workflows/ci.yml',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
  };
  const module = await import('./releaseCandidate.mjs');
  assert.equal(typeof module.revalidateRequiredCiRun, 'function', 'publish revalidation helper is missing');
  const expected = { sourceSha: SHA_A, runId: '9', runAttempt: '1' };
  assert.equal(module.revalidateRequiredCiRun([valid], expected).id, 9);
  for (const changed of [
    { run_attempt: 2, status: 'completed', conclusion: 'success' },
    { run_attempt: 2, status: 'in_progress', conclusion: null },
    { run_attempt: 2, status: 'completed', conclusion: 'failure' },
    { run_attempt: 2, status: 'completed', conclusion: 'cancelled' },
  ]) {
    assert.throws(() => module.revalidateRequiredCiRun(
      [valid],
      expected,
      { ...valid, ...changed },
    ));
  }
  assert.throws(() => module.revalidateRequiredCiRun([
    valid,
    { ...valid, id: 10 },
  ], expected), /superseded/i);
});

test('rollback accepts only an exact successful trusted Pages run and live artifact', () => {
  const run = {
    id: 303,
    event: 'push',
    head_branch: 'main',
    head_sha: SHA_A,
    path: '.github/workflows/deploy-pages.yml',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
  };
  const artifact = { id: 404, name: 'github-pages-303', expired: false };
  assert.deepEqual(authorizeRollback(run, [artifact], {
    sourceSha: SHA_A,
    runId: '303',
  }), artifact);
  for (const [changedRun, changedArtifacts] of [
    [{ ...run, event: 'pull_request' }, [artifact]],
    [{ ...run, head_branch: 'feature' }, [artifact]],
    [{ ...run, head_sha: SHA_B }, [artifact]],
    [{ ...run, path: '.github/workflows/ci.yml' }, [artifact]],
    [{ ...run, conclusion: 'failure' }, [artifact]],
    [run, [{ ...artifact, expired: true }]],
    [run, [{ ...artifact, name: 'github-pages' }]],
    [run, []],
  ]) {
    assert.throws(() => authorizeRollback(changedRun, changedArtifacts, {
      sourceSha: SHA_A,
      runId: '303',
    }));
  }
});
