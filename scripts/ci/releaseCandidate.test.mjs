import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

function writeMockFetch(root, responses) {
  const fixturePath = join(root, 'mock-fetch.mjs');
  writeFileSync(fixturePath, [
    "import { appendFileSync } from 'node:fs';",
    '',
    'const responses = new Map(JSON.parse(process.env.MOCK_GITHUB_RESPONSES));',
    'globalThis.fetch = async (url) => {',
    '  const key = String(url);',
    "  appendFileSync(process.env.MOCK_GITHUB_REQUEST_LOG, key + '\\n', 'utf8');",
    '  const response = responses.get(key);',
    "  if (!response) throw new Error('Unexpected GitHub API request: ' + key);",
    '  return new Response(JSON.stringify(response.body), {',
    '    status: response.status ?? 200,',
    "    headers: { 'content-type': 'application/json' },",
    '  });',
    '};',
    '',
  ].join('\n'), 'utf8');
  return fixturePath;
}

function workflowRunFixture(overrides = {}) {
  return {
    id: 34885736323,
    run_attempt: 1,
    workflow_id: 299824706,
    name: 'CI',
    path: '.github/workflows/ci.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    head_sha: SHA_A,
    repository: { full_name: 'owner/repo' },
    head_repository: { full_name: 'owner/repo' },
    ...overrides,
  };
}

function completedWorkflowEvent(run = workflowRunFixture(), overrides = {}) {
  return {
    action: 'completed',
    repository: { full_name: 'owner/repo' },
    workflow_run: run,
    ...overrides,
  };
}

function workflowRunResponses(run, {
  currentRun = run,
  workflow = {
    id: 299824706,
    name: 'CI',
    path: '.github/workflows/ci.yml',
    state: 'active',
  },
  runs = [run],
  mainSha = SHA_A,
} = {}) {
  return [
    ['https://api.github.com/repos/owner/repo/actions/runs/' + run.id, { body: currentRun }],
    ['https://api.github.com/repos/owner/repo/actions/workflows/ci.yml', { body: workflow }],
    ['https://api.github.com/repos/owner/repo/actions/workflows/299824706/runs?event=push&branch=main&head_sha=' + SHA_A + '&per_page=100', {
      body: { workflow_runs: runs },
    }],
    ['https://api.github.com/repos/owner/repo/git/ref/heads/main', {
      body: { object: { sha: mainSha } },
    }],
  ];
}

function runWorkflowRunGate(event, responses, overrides = {}, mode = 'gate') {
  const root = mkdtempSync(join(tmpdir(), 'singedterra-workflow-run-gate-'));
  const eventPath = join(root, 'event.json');
  const outputPath = join(root, 'output.txt');
  const requestLog = join(root, 'requests.txt');
  writeFileSync(eventPath, JSON.stringify(event) + '\n');
  writeFileSync(requestLog, '');
  const mockFetch = writeMockFetch(root, responses);
  const result = spawnSync(process.execPath, [
    '--import', pathToFileURL(mockFetch).href,
    'scripts/ci/releaseCandidate.mjs',
    mode,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'workflow_run',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: SHA_A,
      GITHUB_RUN_ID: '555',
      GITHUB_TOKEN: randomUUID(),
      MOCK_GITHUB_RESPONSES: JSON.stringify(responses),
      MOCK_GITHUB_REQUEST_LOG: requestLog,
      ...overrides,
    },
  });
  return {
    result,
    output: existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '',
    requests: readFileSync(requestLog, 'utf8').trim().split('\n').filter(Boolean),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('gate accepts only a refetched, current, exact completed CI workflow_run event', () => {
  const run = workflowRunFixture();
  const responses = [
    ['https://api.github.com/repos/owner/repo/actions/runs/' + run.id, { body: run }],
    ['https://api.github.com/repos/owner/repo/actions/workflows/ci.yml', {
      body: {
        id: 299824706,
        name: 'CI',
        path: '.github/workflows/ci.yml',
        state: 'active',
      },
    }],
    ['https://api.github.com/repos/owner/repo/actions/workflows/299824706/runs?event=push&branch=main&head_sha=' + SHA_A + '&per_page=100', {
      body: { workflow_runs: [run] },
    }],
    ['https://api.github.com/repos/owner/repo/git/ref/heads/main', {
      body: { object: { sha: SHA_A } },
    }],
  ];
  const invocation = runWorkflowRunGate({
    action: 'completed',
    repository: { full_name: 'owner/repo' },
    workflow_run: run,
  }, responses);
  try {
    assert.equal(invocation.result.status, 0, invocation.result.stderr);
    assert.deepEqual(invocation.requests, responses.map(([url]) => url));
    assert.match(invocation.output, /source_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
    assert.match(invocation.output, /required_ci_run_id=34885736323/);
    assert.match(invocation.output, /required_ci_run_attempt=1/);
  } finally {
    invocation.cleanup();
  }
});

test('workflow_run gate rejects malformed or untrusted event payloads before any API call', () => {
  const runMutations = [
    { id: '0' },
    { run_attempt: '0' },
    { workflow_id: '0' },
    { path: '.github/workflows/other.yml' },
    { head_branch: 'feature' },
    { head_sha: SHA_B },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { repository: { full_name: 'fork/repo' } },
    { head_repository: { full_name: 'fork/repo' } },
    { event: 'workflow_dispatch' },
  ];
  const cases = [
    {},
    completedWorkflowEvent(workflowRunFixture(), { action: 'requested' }),
    completedWorkflowEvent(workflowRunFixture(), { repository: { full_name: 'fork/repo' } }),
    ...runMutations.map((mutation) => completedWorkflowEvent(workflowRunFixture(mutation))),
  ];
  for (const event of cases) {
    const invocation = runWorkflowRunGate(event, []);
    try {
      assert.notEqual(invocation.result.status, 0, 'gate accepted an untrusted workflow event');
      assert.deepEqual(invocation.requests, [], 'untrusted event made a GitHub API request');
    } finally {
      invocation.cleanup();
    }
  }
  const wrongSnapshot = runWorkflowRunGate(completedWorkflowEvent(), [], { GITHUB_SHA: SHA_B });
  try {
    assert.notEqual(wrongSnapshot.result.status, 0);
    assert.deepEqual(wrongSnapshot.requests, []);
  } finally {
    wrongSnapshot.cleanup();
  }
});

test('workflow_run gate rejects refetched identity, newest-run, and current-main drift', () => {
  const run = workflowRunFixture();
  const event = completedWorkflowEvent(run);
  const apiRunMutations = [
    { id: 34885736324 },
    { run_attempt: 2 },
    { workflow_id: 7 },
    { path: '.github/workflows/other.yml' },
    { head_branch: 'feature' },
    { head_sha: SHA_B },
    { repository: { full_name: 'fork/repo' } },
    { head_repository: { full_name: 'fork/repo' } },
    { status: 'in_progress' },
    { conclusion: 'failure' },
  ];
  for (const mutation of apiRunMutations) {
    const invocation = runWorkflowRunGate(event, workflowRunResponses(run, {
      currentRun: workflowRunFixture(mutation),
    }));
    try {
      assert.notEqual(invocation.result.status, 0, 'gate accepted a mutated refetched CI run');
      assert.equal(invocation.output, '');
      assert.equal(invocation.requests.length, 2, 'refetched-run failure retried or continued');
    } finally {
      invocation.cleanup();
    }
  }
  for (const mutation of [
    { name: 'Other' },
    { path: '.github/workflows/other.yml' },
    { state: 'disabled_manually' },
  ]) {
    const invocation = runWorkflowRunGate(event, workflowRunResponses(run, {
      workflow: {
        id: 299824706,
        name: 'CI',
        path: '.github/workflows/ci.yml',
        state: 'active',
        ...mutation,
      },
    }));
    try {
      assert.notEqual(invocation.result.status, 0, 'gate accepted a changed configured workflow');
      assert.equal(invocation.output, '');
      assert.equal(invocation.requests.length, 2);
    } finally {
      invocation.cleanup();
    }
  }
  const newerBadRuns = [
    workflowRunFixture({ id: 34885736324, repository: { full_name: 'fork/repo' } }),
    workflowRunFixture({ id: 34885736324, workflow_id: 7 }),
  ];
  for (const newer of newerBadRuns) {
    const invocation = runWorkflowRunGate(event, workflowRunResponses(run, {
      runs: [run, newer],
    }));
    try {
      assert.notEqual(invocation.result.status, 0, 'gate accepted a newer malformed exact-source run');
      assert.equal(invocation.output, '');
      assert.equal(invocation.requests.length, 3);
    } finally {
      invocation.cleanup();
    }
  }
  for (const { responses, requests } of [
    {
      responses: [['https://api.github.com/repos/owner/repo/actions/runs/' + run.id, { status: 500, body: {} }]],
      requests: 1,
    },
    {
      responses: workflowRunResponses(run, { runs: null }).slice(0, 3),
      requests: 3,
    },
  ]) {
    const invocation = runWorkflowRunGate(event, responses);
    try {
      assert.notEqual(invocation.result.status, 0, 'gate accepted failed or incomplete API evidence');
      assert.equal(invocation.output, '');
      assert.equal(invocation.requests.length, requests, 'gate retried a failed API request');
    } finally {
      invocation.cleanup();
    }
  }
  const currentMainChanged = runWorkflowRunGate(event, workflowRunResponses(run, { mainSha: SHA_B }));
  try {
    assert.notEqual(currentMainChanged.result.status, 0);
    assert.equal(currentMainChanged.output, '');
    assert.equal(currentMainChanged.requests.length, 4);
  } finally {
    currentMainChanged.cleanup();
  }
});

test('final CI revalidation is restricted to and rechecks the triggering workflow_run', () => {
  const run = workflowRunFixture();
  const event = completedWorkflowEvent(run);
  const responses = workflowRunResponses(run).slice(0, 3);
  const invocation = runWorkflowRunGate(event, responses, {
    CANDIDATE_SOURCE_SHA: SHA_A,
    REQUIRED_CI_RUN_ID: String(run.id),
    REQUIRED_CI_RUN_ATTEMPT: String(run.run_attempt),
  }, 'revalidate-ci');
  try {
    assert.equal(invocation.result.status, 0, invocation.result.stderr);
    assert.deepEqual(invocation.requests, responses.map(([url]) => url));
  } finally {
    invocation.cleanup();
  }
  const baseEnv = {
    CANDIDATE_SOURCE_SHA: SHA_A,
    REQUIRED_CI_RUN_ID: String(run.id),
    REQUIRED_CI_RUN_ATTEMPT: String(run.run_attempt),
  };
  for (const overrides of [
    { REQUIRED_CI_RUN_ID: '34885736324' },
    { REQUIRED_CI_RUN_ATTEMPT: '2' },
  ]) {
    const changed = runWorkflowRunGate(event, responses, { ...baseEnv, ...overrides }, 'revalidate-ci');
    try {
      assert.notEqual(changed.result.status, 0, 'revalidation accepted changed recorded CI identity');
      assert.equal(changed.output, '');
      assert.equal(changed.requests.length, 3);
    } finally {
      changed.cleanup();
    }
  }
  const changedAttempt = runWorkflowRunGate(event, workflowRunResponses(run, {
    currentRun: workflowRunFixture({ run_attempt: 2 }),
  }).slice(0, 3), baseEnv, 'revalidate-ci');
  try {
    assert.notEqual(changedAttempt.result.status, 0);
    assert.equal(changedAttempt.output, '');
    assert.equal(changedAttempt.requests.length, 2);
  } finally {
    changedAttempt.cleanup();
  }
  for (const conclusion of ['failure', null]) {
    const newest = workflowRunFixture({
      id: 34885736324,
      status: conclusion === null ? 'in_progress' : 'completed',
      conclusion,
    });
    const changedNewest = runWorkflowRunGate(event, workflowRunResponses(run, {
      runs: [run, newest],
    }).slice(0, 3), baseEnv, 'revalidate-ci');
    try {
      assert.notEqual(changedNewest.result.status, 0);
      assert.equal(changedNewest.output, '');
      assert.equal(changedNewest.requests.length, 3);
    } finally {
      changedNewest.cleanup();
    }
  }
  const wrongEnvironmentSource = runWorkflowRunGate(event, responses, {
    ...baseEnv,
    GITHUB_SHA: SHA_B,
  }, 'revalidate-ci');
  try {
    assert.notEqual(
      wrongEnvironmentSource.result.status,
      0,
      'revalidation accepted an event source that differed from GITHUB_SHA',
    );
    assert.equal(wrongEnvironmentSource.output, '');
    assert.deepEqual(wrongEnvironmentSource.requests, []);
  } finally {
    wrongEnvironmentSource.cleanup();
  }
  const pushInvocation = runWorkflowRunGate(event, [], {
    GITHUB_EVENT_NAME: 'push',
    CANDIDATE_SOURCE_SHA: SHA_A,
    REQUIRED_CI_RUN_ID: String(run.id),
    REQUIRED_CI_RUN_ATTEMPT: String(run.run_attempt),
  }, 'revalidate-ci');
  try {
    assert.notEqual(pushInvocation.result.status, 0);
    assert.deepEqual(pushInvocation.requests, []);
  } finally {
    pushInvocation.cleanup();
  }
});

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
    repository: { full_name: 'owner/repo' },
    head_repository: { full_name: 'owner/repo' },
  };
  const artifact = { id: 404, name: 'github-pages-303', expired: false };
  assert.deepEqual(authorizeRollback(run, [artifact], {
    sourceSha: SHA_A,
    runId: '303',
    repository: 'owner/repo',
  }), artifact);
  assert.deepEqual(authorizeRollback({ ...run, event: 'workflow_run' }, [artifact], {
    sourceSha: SHA_A,
    runId: '303',
    repository: 'owner/repo',
  }), artifact);
  for (const [changedRun, changedArtifacts] of [
    [{ ...run, event: 'pull_request' }, [artifact]],
    [{ ...run, head_branch: 'feature' }, [artifact]],
    [{ ...run, head_sha: SHA_B }, [artifact]],
    [{ ...run, path: '.github/workflows/ci.yml' }, [artifact]],
    [{ ...run, conclusion: 'failure' }, [artifact]],
    [{ ...run, repository: { full_name: 'fork/repo' } }, [artifact]],
    [{ ...run, head_repository: { full_name: 'fork/repo' } }, [artifact]],
    [run, [{ ...artifact, expired: true }]],
    [run, [{ ...artifact, name: 'github-pages' }]],
    [run, []],
  ]) {
    assert.throws(() => authorizeRollback(changedRun, changedArtifacts, {
      sourceSha: SHA_A,
      runId: '303',
      repository: 'owner/repo',
    }));
  }
});
