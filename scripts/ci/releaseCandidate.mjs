import { createHash } from 'node:crypto';
import {
  appendFileSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, relative, resolve, sep } from 'node:path';
import { assertDeployMeta } from './pagesFreshness.mjs';

const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_META_BYTES = 4096;
const MAX_API_BYTES = 2 * 1024 * 1024;
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const CI_WORKFLOW_NAME = 'CI';
const PAGES_WORKFLOW_PATH = '.github/workflows/deploy-pages.yml';
export const DIGEST_SCOPE = 'regular-files-v1:exclude=/release-candidate.json';
const EXCLUDED_ROOT_FILES = new Set(['release-candidate.json']);

function fail(message) {
  throw new Error(message);
}

function assertSha(value, label) {
  if (!FULL_SHA.test(value ?? '')) fail(`Invalid ${label} SHA.`);
}

function assertRunId(value, label) {
  if (!RUN_ID.test(String(value ?? ''))) fail(`Invalid ${label} run ID.`);
}

function assertRunAttempt(value, label) {
  if (!RUN_ID.test(String(value ?? ''))) fail(`Invalid ${label} run attempt.`);
}

function normalizeBasePath(value) {
  if (typeof value !== 'string' || !/^\/[A-Za-z0-9_.-]+\/$/.test(value)) {
    fail('Invalid project-site base path.');
  }
  return value;
}

function normalizeSupabaseOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('Invalid public Supabase URL.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.pathname !== '/'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    fail('Invalid public Supabase URL.');
  }
  return parsed.origin;
}

export function digestPublicConfig({ basePath, supabaseUrl, supabaseAnonKey }) {
  if (typeof supabaseAnonKey !== 'string' || supabaseAnonKey.length === 0) {
    fail('Missing public Supabase anon key.');
  }
  const entries = [
    ['VITE_BASE', normalizeBasePath(basePath)],
    ['VITE_SUPABASE_URL', supabaseUrl],
    ['VITE_SUPABASE_ANON_KEY', supabaseAnonKey],
  ];
  const hash = createHash('sha256');
  for (const [name, value] of entries) {
    const bytes = Buffer.from(value, 'utf8');
    hash.update(`${name}\0${bytes.length}\0`);
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function payloadPaths(root) {
  const absoluteRoot = resolve(root);
  const paths = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const rel = relative(absoluteRoot, absolute).split(sep).join('/');
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(`Candidate payload contains a symbolic link: ${rel}`);
      if (stat.isDirectory()) {
        walk(absolute);
      } else if (stat.isFile()) {
        if (!rel.includes('/') && EXCLUDED_ROOT_FILES.has(rel)) continue;
        paths.push({ absolute, relative: rel, size: stat.size });
      } else {
        fail(`Candidate payload entry is not a regular file: ${rel}`);
      }
    }
  }
  walk(absoluteRoot);
  paths.sort((left, right) => Buffer.compare(
    Buffer.from(left.relative, 'utf8'),
    Buffer.from(right.relative, 'utf8'),
  ));
  if (paths.length === 0) fail('Candidate payload is empty.');
  return paths;
}

export function digestPayload(root) {
  const hash = createHash('sha256');
  for (const entry of payloadPaths(root)) {
    const pathBytes = Buffer.from(entry.relative, 'utf8');
    hash.update(`file\0${pathBytes.length}\0`);
    hash.update(pathBytes);
    hash.update(`\0${entry.size}\0`);
    hash.update(readFileSync(entry.absolute));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function exactMetadata(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_META_BYTES) {
    fail('Invalid release candidate metadata size.');
  }
  let meta;
  try {
    meta = JSON.parse(raw);
  } catch {
    fail('Invalid release candidate metadata.');
  }
  if (!meta || Array.isArray(meta) || typeof meta !== 'object') fail('Invalid release candidate metadata.');
  const expectedKeys = [
    'basePath',
    'candidateRunId',
    'digestScope',
    'payloadSha256',
    'publicConfigSha256',
    'requiredCiRunId',
    'schemaVersion',
    'sourceSha',
    'supabaseOrigin',
  ];
  if (JSON.stringify(Object.keys(meta).sort()) !== JSON.stringify(expectedKeys)) {
    fail('Invalid release candidate metadata shape.');
  }
  if (meta.schemaVersion !== 1 || meta.digestScope !== DIGEST_SCOPE) fail('Invalid release candidate metadata contract.');
  assertSha(meta.sourceSha, 'candidate source');
  assertRunId(meta.candidateRunId, 'candidate');
  assertRunId(meta.requiredCiRunId, 'required CI');
  if (!SHA256.test(meta.payloadSha256) || !SHA256.test(meta.publicConfigSha256)) {
    fail('Invalid release candidate digest.');
  }
  normalizeBasePath(meta.basePath);
  if (normalizeSupabaseOrigin(meta.supabaseOrigin) !== meta.supabaseOrigin) {
    fail('Invalid release candidate Supabase origin.');
  }
  return meta;
}

export function digestCandidateMetadata(raw) {
  exactMetadata(raw);
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function writeCandidateMetadata(root, values) {
  assertSha(values.sourceSha, 'candidate source');
  assertRunId(values.candidateRunId, 'candidate');
  assertRunId(values.requiredCiRunId, 'required CI');
  const basePath = normalizeBasePath(values.basePath);
  const supabaseUrl = values.supabaseUrl;
  const supabaseOrigin = normalizeSupabaseOrigin(supabaseUrl);
  assertDeployMeta(
    readFileSync(join(root, 'deploy-meta.json'), 'utf8'),
    values.sourceSha,
    String(values.candidateRunId),
  );
  const meta = {
    schemaVersion: 1,
    sourceSha: values.sourceSha,
    candidateRunId: String(values.candidateRunId),
    requiredCiRunId: String(values.requiredCiRunId),
    basePath,
    supabaseOrigin,
    publicConfigSha256: digestPublicConfig({
      basePath,
      supabaseUrl,
      supabaseAnonKey: values.supabaseAnonKey,
    }),
    digestScope: DIGEST_SCOPE,
    payloadSha256: digestPayload(root),
  };
  writeFileSync(join(root, 'release-candidate.json'), `${JSON.stringify(meta)}\n`, 'utf8');
  return meta;
}

export function assertCandidate(root, expected = {}) {
  const metadataRaw = readFileSync(join(root, 'release-candidate.json'), 'utf8');
  const meta = exactMetadata(metadataRaw);
  if (expected.candidateMetadataSha256 !== undefined) {
    if (!SHA256.test(expected.candidateMetadataSha256)) fail('Invalid expected candidate metadata digest.');
    if (digestCandidateMetadata(metadataRaw) !== expected.candidateMetadataSha256) {
      fail('Release candidate metadata digest does not match.');
    }
  }
  let deployMeta;
  try {
    deployMeta = readFileSync(join(root, 'deploy-meta.json'), 'utf8');
  } catch {
    fail('Release candidate deployment metadata is missing.');
  }
  assertDeployMeta(deployMeta, meta.sourceSha, meta.candidateRunId);
  for (const [key, label] of [
    ['sourceSha', 'source'],
    ['candidateRunId', 'candidate run'],
    ['requiredCiRunId', 'required CI run'],
    ['basePath', 'base path'],
    ['supabaseOrigin', 'Supabase origin'],
    ['publicConfigSha256', 'public config'],
    ['payloadSha256', 'payload digest'],
  ]) {
    const expectedValue = key === 'supabaseOrigin' && expected[key] !== undefined
      ? normalizeSupabaseOrigin(expected[key])
      : expected[key];
    if (expectedValue !== undefined && String(meta[key]) !== String(expectedValue)) {
      fail(`Release candidate ${label} does not match.`);
    }
  }
  if (digestPayload(root) !== meta.payloadSha256) fail('Release candidate payload digest does not match.');
  return meta;
}

function isExactRun(run, { path, event, branch, sha }) {
  return run
    && String(run.path) === path
    && String(run.event) === event
    && String(run.head_branch) === branch
    && String(run.head_sha) === sha;
}

function hasSameRepository(run, repo) {
  return run?.repository?.full_name === repo
    && run?.head_repository?.full_name === repo;
}

function isTrustedCiRun(run, { repo, sourceSha, workflowId }) {
  return RUN_ID.test(String(run?.id ?? ''))
    && RUN_ID.test(String(run?.run_attempt ?? ''))
    && String(run?.workflow_id) === String(workflowId)
    && hasSameRepository(run, repo)
    && isExactRun(run, {
      path: CI_WORKFLOW_PATH,
      event: 'push',
      branch: 'main',
      sha: sourceSha,
    });
}

function assertTrustedCiRun(run, expected, label) {
  if (!isTrustedCiRun(run, expected)) {
    fail(label + ' is not an exact trusted configured CI run.');
  }
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    fail(label + ' is not successful.');
  }
}

function readWorkflowRunEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (typeof eventPath !== 'string' || eventPath.length === 0) {
    fail('Missing GITHUB_EVENT_PATH.');
  }
  let raw;
  try {
    raw = readFileSync(eventPath, 'utf8');
  } catch {
    fail('GitHub event payload is unreadable.');
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_API_BYTES) fail('GitHub event payload exceeded the safety limit.');
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    fail('GitHub event payload is invalid JSON.');
  }
  if (!event || Array.isArray(event) || typeof event !== 'object') {
    fail('GitHub event payload is invalid.');
  }
  return event;
}

function workflowRunBinding(event, repo, sourceSha) {
  if (event.action !== 'completed' || event?.repository?.full_name !== repo) {
    fail('GitHub event is not a completed same-repository workflow run.');
  }
  const run = event.workflow_run;
  assertRunId(run?.id, 'workflow event');
  assertRunAttempt(run?.run_attempt, 'workflow event');
  assertRunId(run?.workflow_id, 'workflow event');
  if (!hasSameRepository(run, repo)
    || String(run.head_sha) !== sourceSha
    || String(run.head_branch) !== 'main'
    || String(run.event) !== 'push'
    || String(run.status) !== 'completed'
    || String(run.conclusion) !== 'success'
    || String(run.path) !== CI_WORKFLOW_PATH) {
    fail('GitHub event does not bind a successful main CI push run to this source.');
  }
  return {
    id: String(run.id),
    attempt: String(run.run_attempt),
    workflowId: String(run.workflow_id),
  };
}

function assertConfiguredWorkflow(workflow, binding) {
  if (String(workflow?.id) !== binding.workflowId
    || workflow?.name !== CI_WORKFLOW_NAME
    || workflow?.path !== CI_WORKFLOW_PATH
    || workflow?.state !== 'active') {
    fail('Configured CI workflow identity changed.');
  }
}

export function selectRequiredCiRun(runs, sourceSha) {
  assertSha(sourceSha, 'required CI source');
  const exact = runs.filter((run) => isExactRun(run, {
    path: '.github/workflows/ci.yml',
    event: 'push',
    branch: 'main',
    sha: sourceSha,
  }));
  const newest = exact.reduce((selected, run) => {
    if (!selected) return run;
    return BigInt(String(run.id)) > BigInt(String(selected.id)) ? run : selected;
  }, undefined);
  if (newest?.status === 'completed' && newest.conclusion === 'success') {
    assertRunAttempt(newest.run_attempt, 'required CI');
    return newest;
  }
  if (newest?.status === 'completed') {
    fail(`Required CI run ${newest.id} concluded ${newest.conclusion}.`);
  }
  fail('Required exact-SHA CI run has not succeeded.');
}

export function revalidateRequiredCiRun(runs, expected, currentRun) {
  assertSha(expected.sourceSha, 'required CI source');
  assertRunId(expected.runId, 'required CI');
  assertRunAttempt(expected.runAttempt, 'required CI');
  const current = currentRun ?? runs.find((run) => String(run?.id) === String(expected.runId));
  if (!current || !isExactRun(current, {
    path: '.github/workflows/ci.yml',
    event: 'push',
    branch: 'main',
    sha: expected.sourceSha,
  }) || String(current.id) !== String(expected.runId)) {
    fail('Bound required CI run identity changed.');
  }
  if (String(current.run_attempt) !== String(expected.runAttempt)) {
    fail('Bound required CI run attempt changed.');
  }
  if (current.status !== 'completed' || current.conclusion !== 'success') {
    fail('Bound required CI run is no longer successful.');
  }
  const newest = selectRequiredCiRun(runs, expected.sourceSha);
  if (String(newest.id) !== String(expected.runId)) {
    fail('Bound required CI run was superseded by another exact-source run.');
  }
  if (String(newest.run_attempt) !== String(expected.runAttempt)) {
    fail('Bound required CI run attempt changed.');
  }
  return newest;
}

export function authorizeRollback(run, artifacts, expected) {
  assertSha(expected.sourceSha, 'rollback source');
  assertRunId(expected.runId, 'rollback Pages');
  if (!REPOSITORY.test(expected.repository ?? '')) fail('Invalid rollback repository.');
  if (String(run?.id) !== String(expected.runId) || !isExactRun(run, {
    path: PAGES_WORKFLOW_PATH,
    event: run?.event,
    branch: 'main',
    sha: expected.sourceSha,
  }) || !['push', 'workflow_run'].includes(run?.event)
    || !hasSameRepository(run, expected.repository)
    || run.status !== 'completed' || run.conclusion !== 'success') {
    fail('Rollback source is not an exact successful same-repository Pages release run.');
  }
  const name = `github-pages-${expected.runId}`;
  const matches = artifacts.filter((artifact) => artifact.name === name && artifact.expired === false);
  if (matches.length !== 1) fail('Rollback artifact is missing, expired, or ambiguous.');
  return matches[0];
}

async function githubJson(path, token) {
  if (!token) fail('Missing GitHub token.');
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) fail(`GitHub API request failed with status ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_API_BYTES) fail('GitHub API response exceeded the safety limit.');
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('GitHub API returned invalid JSON.');
  }
}

async function currentMainSha(repo, token) {
  const ref = await githubJson(`/repos/${repo}/git/ref/heads/main`, token);
  assertSha(ref?.object?.sha, 'current main');
  return ref.object.sha;
}

async function verifiedWorkflowRun(repo, token, sourceSha) {
  const event = readWorkflowRunEvent();
  const binding = workflowRunBinding(event, repo, sourceSha);
  const currentRun = await githubJson(`/repos/${repo}/actions/runs/${binding.id}`, token);
  const workflow = await githubJson(`/repos/${repo}/actions/workflows/ci.yml`, token);
  assertConfiguredWorkflow(workflow, binding);
  const expected = { repo, sourceSha, workflowId: binding.workflowId };
  assertTrustedCiRun(currentRun, expected, 'Refetched configured CI run');
  if (String(currentRun.id) !== binding.id || String(currentRun.run_attempt) !== binding.attempt) {
    fail('Refetched configured CI run identity or attempt changed.');
  }
  const query = new URLSearchParams({
    event: 'push',
    branch: 'main',
    head_sha: sourceSha,
    per_page: '100',
  });
  const body = await githubJson(
    `/repos/${repo}/actions/workflows/${binding.workflowId}/runs?${query}`,
    token,
  );
  const newest = selectRequiredCiRun(
    Array.isArray(body?.workflow_runs) ? body.workflow_runs : [],
    sourceSha,
  );
  assertTrustedCiRun(newest, expected, 'Newest configured CI run');
  if (String(newest.id) !== binding.id || String(newest.run_attempt) !== binding.attempt) {
    fail('Configured CI run was superseded or rerun after the event.');
  }
  return { binding, currentRun, newest };
}

function requireEnvironment(names) {
  const values = {};
  for (const name of names) {
    const value = process.env[name];
    if (typeof value !== 'string' || value.length === 0) fail(`Missing required release expectation: ${name}.`);
    values[name] = value;
  }
  return values;
}

function writeOutputs(values) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) fail('Missing GITHUB_OUTPUT.');
  for (const [key, value] of Object.entries(values)) {
    if (String(value).includes('\n')) fail('Invalid multiline workflow output.');
    appendFileSync(output, `${key}=${value}\n`, 'utf8');
  }
}

async function gate() {
  const event = process.env.GITHUB_EVENT_NAME;
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!REPOSITORY.test(repo ?? '')) fail('Invalid GitHub repository.');
  if (process.env.GITHUB_REF !== 'refs/heads/main') fail('Release workflows must run from main.');
  if (event === 'workflow_run') {
    const sourceSha = process.env.GITHUB_SHA;
    assertSha(sourceSha, 'release source');
    const ci = await verifiedWorkflowRun(repo, token, sourceSha);
    if (await currentMainSha(repo, token) !== sourceSha) fail('Release source is no longer current main.');
    writeOutputs({
      source_sha: sourceSha,
      candidate_run_id: process.env.GITHUB_RUN_ID,
      required_ci_run_id: ci.binding.id,
      required_ci_run_attempt: ci.binding.attempt,
      expected_main_sha: sourceSha,
      rollback_artifact_id: '',
    });
    return;
  }
  if (event !== 'workflow_dispatch' || process.env.ROLLBACK_CONFIRMATION !== 'ROLLBACK') {
    fail('Manual execution is reserved for an explicitly confirmed rollback.');
  }
  const runId = process.env.ROLLBACK_RUN_ID;
  const sourceSha = process.env.ROLLBACK_SOURCE_SHA;
  const expectedMainSha = process.env.EXPECTED_CURRENT_MAIN_SHA;
  assertRunId(runId, 'rollback Pages');
  assertSha(sourceSha, 'rollback source');
  assertSha(expectedMainSha, 'approved current main');
  if (await currentMainSha(repo, token) !== expectedMainSha) fail('Current main changed after rollback approval.');
  const [run, artifactBody] = await Promise.all([
    githubJson(`/repos/${repo}/actions/runs/${runId}`, token),
    githubJson(`/repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`, token),
  ]);
  const artifact = authorizeRollback(run, artifactBody?.artifacts ?? [], {
    sourceSha,
    runId,
    repository: repo,
  });
  writeOutputs({
    source_sha: sourceSha,
    candidate_run_id: runId,
    required_ci_run_id: '',
    required_ci_run_attempt: '',
    expected_main_sha: expectedMainSha,
    rollback_artifact_id: artifact.id,
  });
}

async function revalidateCi() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!REPOSITORY.test(repo ?? '')) fail('Invalid GitHub repository.');
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_run' || process.env.GITHUB_REF !== 'refs/heads/main') {
    fail('Required CI revalidation is only valid for a trusted completed CI workflow run.');
  }
  const expected = requireEnvironment([
    'CANDIDATE_SOURCE_SHA',
    'REQUIRED_CI_RUN_ID',
    'REQUIRED_CI_RUN_ATTEMPT',
  ]);
  const workflowSourceSha = process.env.GITHUB_SHA;
  assertSha(workflowSourceSha, 'workflow revalidation source');
  if (workflowSourceSha !== expected.CANDIDATE_SOURCE_SHA) {
    fail('Workflow revalidation source does not match the candidate source.');
  }
  const ci = await verifiedWorkflowRun(repo, token, expected.CANDIDATE_SOURCE_SHA);
  if (ci.binding.id !== expected.REQUIRED_CI_RUN_ID
    || ci.binding.attempt !== expected.REQUIRED_CI_RUN_ATTEMPT) {
    fail('Bound required CI run identity or attempt changed.');
  }
}

async function readStdin() {
  let body = '';
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, 'utf8');
    if (bytes > MAX_META_BYTES) fail('Invalid release candidate metadata size.');
    body += chunk;
  }
  return body;
}

async function main([mode, root]) {
  if (mode === 'gate') return gate();
  if (mode === 'revalidate-ci') return revalidateCi();
  if (mode === 'write') {
    const meta = writeCandidateMetadata(root, {
      sourceSha: process.env.CANDIDATE_SOURCE_SHA,
      candidateRunId: process.env.CANDIDATE_RUN_ID,
      requiredCiRunId: process.env.REQUIRED_CI_RUN_ID,
      basePath: process.env.VITE_BASE,
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY,
    });
    const metadataRaw = readFileSync(join(root, 'release-candidate.json'), 'utf8');
    writeOutputs({
      payload_sha256: meta.payloadSha256,
      public_config_sha256: meta.publicConfigSha256,
      candidate_metadata_sha256: digestCandidateMetadata(metadataRaw),
      base_path: meta.basePath,
    });
    return;
  }
  if (mode === 'verify') {
    const required = requireEnvironment([
      'CANDIDATE_SOURCE_SHA',
      'CANDIDATE_RUN_ID',
      'REQUIRED_CI_RUN_ID',
      'CANDIDATE_PAYLOAD_SHA256',
      'PUBLIC_CONFIG_SHA256',
      'CANDIDATE_BASE_PATH',
      'CANDIDATE_METADATA_SHA256',
    ]);
    const hasRawPublicConfig = [
      process.env.VITE_BASE,
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY,
    ].some((value) => value !== undefined);
    const hasCompleteRawPublicConfig = [
      process.env.VITE_BASE,
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY,
    ].every((value) => typeof value === 'string' && value.length > 0);
    if (hasRawPublicConfig && !hasCompleteRawPublicConfig) fail('Incomplete raw public configuration expectations.');
    const expectedPublicConfig = hasRawPublicConfig
      ? digestPublicConfig({
        basePath: process.env.VITE_BASE,
        supabaseUrl: process.env.VITE_SUPABASE_URL,
        supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY,
      })
      : required.PUBLIC_CONFIG_SHA256;
    if (
      expectedPublicConfig !== required.PUBLIC_CONFIG_SHA256
    ) fail('Expected public configuration digest does not match its inputs.');
    const meta = assertCandidate(root, {
      sourceSha: required.CANDIDATE_SOURCE_SHA,
      candidateRunId: required.CANDIDATE_RUN_ID,
      requiredCiRunId: required.REQUIRED_CI_RUN_ID,
      payloadSha256: required.CANDIDATE_PAYLOAD_SHA256,
      publicConfigSha256: expectedPublicConfig,
      basePath: required.CANDIDATE_BASE_PATH,
      candidateMetadataSha256: required.CANDIDATE_METADATA_SHA256,
    });
    const projectRef = new URL(meta.supabaseOrigin).hostname.split('.')[0];
    if (!/^[a-z0-9-]+$/.test(projectRef)) fail('Invalid Supabase project reference.');
    writeOutputs({
      required_ci_run_id: meta.requiredCiRunId,
      payload_sha256: meta.payloadSha256,
      public_config_sha256: meta.publicConfigSha256,
      base_path: meta.basePath,
      auth_storage_key: `sb-${projectRef}-auth-token`,
      candidate_metadata_sha256: required.CANDIDATE_METADATA_SHA256,
    });
    return;
  }
  if (mode === 'verify-rollback') {
    const required = requireEnvironment(['CANDIDATE_SOURCE_SHA', 'CANDIDATE_RUN_ID']);
    const meta = assertCandidate(root, {
      sourceSha: required.CANDIDATE_SOURCE_SHA,
      candidateRunId: required.CANDIDATE_RUN_ID,
    });
    const metadataRaw = readFileSync(join(root, 'release-candidate.json'), 'utf8');
    writeOutputs({
      required_ci_run_id: meta.requiredCiRunId,
      payload_sha256: meta.payloadSha256,
      public_config_sha256: meta.publicConfigSha256,
      base_path: meta.basePath,
      candidate_metadata_sha256: digestCandidateMetadata(metadataRaw),
    });
    return;
  }
  if (mode === 'verify-meta') {
    const required = requireEnvironment([
      'CANDIDATE_SOURCE_SHA',
      'CANDIDATE_RUN_ID',
      'REQUIRED_CI_RUN_ID',
      'CANDIDATE_PAYLOAD_SHA256',
      'PUBLIC_CONFIG_SHA256',
      'CANDIDATE_BASE_PATH',
      'CANDIDATE_METADATA_SHA256',
    ]);
    const raw = await readStdin();
    const meta = exactMetadata(raw);
    if (digestCandidateMetadata(raw) !== required.CANDIDATE_METADATA_SHA256) {
      fail('Published candidate metadata digest does not match.');
    }
    for (const [key, expected] of [
      ['sourceSha', required.CANDIDATE_SOURCE_SHA],
      ['candidateRunId', required.CANDIDATE_RUN_ID],
      ['requiredCiRunId', required.REQUIRED_CI_RUN_ID],
      ['payloadSha256', required.CANDIDATE_PAYLOAD_SHA256],
      ['publicConfigSha256', required.PUBLIC_CONFIG_SHA256],
      ['basePath', required.CANDIDATE_BASE_PATH],
    ]) {
      if (String(meta[key]) !== expected) fail(`Published candidate ${key} does not match.`);
    }
    return;
  }
  fail('Unknown release candidate command.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Release candidate check failed.');
    process.exitCode = 1;
  });
}
