import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const GOVERNANCE_PLAN = /^\.codearbiter\/plans\/[^/]+\.(?:md|json)$/;

function isSafeRepositoryPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('\\')
    && !value.includes('\0')
    && !value.includes('\n')
    && !value.includes('\r')
    && !value.startsWith('./')
    && !value.includes('/../')
    && !value.startsWith('../')
    && !value.includes('//');
}

function isDocsOnlyPath(value) {
  if (!isSafeRepositoryPath(value)) return false;
  if (value === 'README.md') return true;
  if (GOVERNANCE_PLAN.test(value)) return true;
  return value.startsWith('docs/')
    && !value.startsWith('docs/compatibility/')
    && value.endsWith('.md');
}

/**
 * Classifies changed repository paths. An empty or malformed input remains full
 * scope so a missing diff cannot accidentally select the reduced CI lane.
 */
export function classifyPaths(paths) {
  if (!Array.isArray(paths)) {
    return { docsOnly: false, allowedPaths: [], fullCheckPaths: ['<invalid-path-list>'] };
  }

  const allowedPaths = [];
  const fullCheckPaths = [];
  for (const path of paths) {
    if (isDocsOnlyPath(path)) allowedPaths.push(path);
    else fullCheckPaths.push(typeof path === 'string' ? path : '<invalid-path>');
  }

  return {
    docsOnly: paths.length > 0 && fullCheckPaths.length === 0,
    allowedPaths,
    fullCheckPaths,
  };
}

function assertExactCommitRef(name, value, cwd) {
  if (!EXACT_SHA.test(value ?? '')) {
    throw new Error(`${name} must be an exact 40-character commit SHA.`);
  }
  try {
    execFileSync('git', ['rev-parse', '--verify', `${value}^{commit}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(`${name} does not resolve to a commit.`);
  }
}

/**
 * Uses NUL-delimited, rename-disabled Git output so both sides of a rename and
 * every deletion take part in the safety decision.
 */
export function readChangedPaths({ base, head, cwd = process.cwd() }) {
  assertExactCommitRef('CI_BASE_SHA', base, cwd);
  assertExactCommitRef('CI_HEAD_SHA', head, cwd);
  let output;
  try {
    output = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', base, head], {
      cwd,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('Unable to read the base-to-head changed-path set. Full checks are required.');
  }

  const values = output.toString('utf8').split('\0');
  if (values.at(-1) !== '') {
    throw new Error('Git returned a malformed changed-path set. Full checks are required.');
  }
  return values.slice(0, -1);
}

function summarize(result) {
  const scope = result.docsOnly ? 'docs-only' : 'full';
  return [
    '## CI change scope',
    '',
    `- docs_only: \`${result.docsOnly}\``,
    `- scope: \`${scope}\``,
    `- changed paths: ${result.allowedPaths.length + result.fullCheckPaths.length}`,
    `- full-check paths: ${result.fullCheckPaths.length}`,
    `- decision: ${result.docsOnly ? 'reduced docs-only lane is eligible' : 'full checks required'}`,
  ].join('\n');
}

function appendOutputs(result) {
  const summary = summarize(result);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, [
      `docs_only=${result.docsOnly}`,
      `change_scope=${result.docsOnly ? 'docs-only' : 'full'}`,
      'change_scope_summary<<CHANGE_SCOPE_SUMMARY_EOF',
      summary,
      'CHANGE_SCOPE_SUMMARY_EOF',
      '',
    ].join('\n'), 'utf8');
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, 'utf8');
  return summary;
}

export function runCli({ env = process.env, cwd = process.cwd() } = {}) {
  const paths = readChangedPaths({ base: env.CI_BASE_SHA, head: env.CI_HEAD_SHA, cwd });
  const result = classifyPaths(paths);
  const summary = appendOutputs(result);
  process.stdout.write(`docs_only=${result.docsOnly}\n${summary}\n`);
  return result;
}

function reportFailure(error) {
  const result = { docsOnly: false, allowedPaths: [], fullCheckPaths: ['<classification-error>'] };
  try { appendOutputs(result); } catch (outputError) {
    process.stderr.write(`Unable to write fail-closed CI outputs: ${outputError.message}\n`);
  }
  process.stdout.write('docs_only=false\n');
  process.stderr.write(`${error.message}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { runCli(); } catch (error) {
    reportFailure(error);
    process.exitCode = 1;
  }
}
