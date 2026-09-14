import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { classifyPaths, readChangedPaths } from './changeScope.mjs';

const script = fileURLToPath(new URL('./changeScope.mjs', import.meta.url));

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function write(repo, relativePath, contents) {
  const target = join(repo, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
}

async function withRepository(callback) {
  const repo = await mkdtemp(join(tmpdir(), 'singedterra-change-scope-'));
  try {
    git(repo, ['init', '--quiet']);
    git(repo, ['config', 'user.email', 'ci@example.test']);
    git(repo, ['config', 'user.name', 'CI Test']);
    await callback(repo);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

function commit(repo, message) {
  git(repo, ['add', '--all']);
  git(repo, ['commit', '--quiet', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}

test('classifyPaths allows only the documented prose and governance-plan locations', () => {
  const result = classifyPaths([
    'README.md',
    'docs/DEVELOPMENT.md',
    'docs/performance/v3-desktop-diagnostic.md',
    '.codearbiter/plans/ci-efficiency.md',
    '.codearbiter/plans/ci-efficiency.json',
  ]);

  assert.equal(result.docsOnly, true);
  assert.deepEqual(result.fullCheckPaths, []);
});

test('classifyPaths sends runtime documentation and unknown mixed paths to full checks', () => {
  const result = classifyPaths([
    'docs/guide.md',
    'docs/compatibility/st1-work-limits.md',
    'notes/release.md',
  ]);

  assert.equal(result.docsOnly, false);
  assert.deepEqual(result.fullCheckPaths, [
    'docs/compatibility/st1-work-limits.md',
    'notes/release.md',
  ]);
});

test('every runtime family remains full scope alone and when mixed with docs', () => {
  const runtimePaths = [
    'client/src/main.ts',
    'shared/src/engine/GameEngine.ts',
    'supabase/migrations/002_add_rooms.sql',
    'supabase/functions/submit_action/index.ts',
    'e2e/first-salvo.spec.ts',
    'scripts/checks/determinism.mjs',
    '.github/workflows/ci.yml',
    '.github/workflows/deploy-pages.yml',
    '.github/workflows/codeql.yml',
    'scripts/ci/changeScope.mjs',
    'scripts/ci/requiredResult.mjs',
    'package.json',
    'package-lock.json',
    '.nvmrc',
    'tsconfig.base.json',
    'client/vite.config.ts',
    '.codearbiter/contracts/battle-console/ownership/layers.json',
  ];

  for (const runtimePath of runtimePaths) {
    assert.equal(classifyPaths([runtimePath]).docsOnly, false, runtimePath);
    const mixed = classifyPaths(['docs/guide.md', runtimePath]);
    assert.equal(mixed.docsOnly, false, `docs + ${runtimePath}`);
    assert.deepEqual(mixed.fullCheckPaths, [runtimePath]);
  }
});

test('empty, malformed, and traversal-shaped path inputs stay full scope', () => {
  assert.equal(classifyPaths([]).docsOnly, false);
  assert.equal(classifyPaths(null).docsOnly, false);
  for (const unsafePath of [
    'docs/guide.md\n.github/workflows/ci.yml',
    '../docs/guide.md',
    'docs/../client/main.ts',
    './docs/guide.md',
    'docs//guide.md',
    'docs\\guide.md',
  ]) {
    assert.equal(classifyPaths([unsafePath]).docsOnly, false, unsafePath);
  }
});

test('a source-to-docs rename includes the deleted source path and remains full scope', async () => {
  await withRepository(async (repo) => {
    await write(repo, 'client/src/retired.ts', 'export const retired = true;\n');
    const base = commit(repo, 'add runtime source');
    await mkdir(join(repo, 'docs'), { recursive: true });
    git(repo, ['mv', 'client/src/retired.ts', 'docs/retired.md']);
    const head = commit(repo, 'move source into docs');

    const paths = readChangedPaths({ base, head, cwd: repo });
    assert.deepEqual(paths, ['client/src/retired.ts', 'docs/retired.md']);
    assert.equal(classifyPaths(paths).docsOnly, false);
  });
});

test('a deleted runtime file remains full scope', async () => {
  await withRepository(async (repo) => {
    await write(repo, 'shared/src/engine.ts', 'export const alive = true;\n');
    const base = commit(repo, 'add engine');
    await rm(join(repo, 'shared/src/engine.ts'));
    const head = commit(repo, 'delete engine');

    const paths = readChangedPaths({ base, head, cwd: repo });
    assert.deepEqual(paths, ['shared/src/engine.ts']);
    assert.equal(classifyPaths(paths).docsOnly, false);
  });
});

test('a docs-to-source rename includes the added runtime path and remains full scope', async () => {
  await withRepository(async (repo) => {
    await write(repo, 'docs/retired.md', '# retired\n');
    const base = commit(repo, 'add docs');
    await mkdir(join(repo, 'client/src'), { recursive: true });
    git(repo, ['mv', 'docs/retired.md', 'client/src/retired.ts']);
    const head = commit(repo, 'move docs into source');

    const paths = readChangedPaths({ base, head, cwd: repo });
    assert.deepEqual(new Set(paths), new Set(['docs/retired.md', 'client/src/retired.ts']));
    assert.equal(classifyPaths(paths).docsOnly, false);
  });
});

test('missing, zero, and unresolvable exact-shape refs fail closed', async () => {
  await withRepository(async (repo) => {
    await write(repo, 'docs/guide.md', '# guide\n');
    const knownCommit = commit(repo, 'add docs');
    assert.throws(() => readChangedPaths({ base: undefined, head: knownCommit, cwd: repo }), /CI_BASE_SHA/i);
    assert.throws(() => readChangedPaths({ base: '0'.repeat(40), head: knownCommit, cwd: repo }), /CI_BASE_SHA/i);
    assert.throws(() => readChangedPaths({ base: 'f'.repeat(40), head: knownCommit, cwd: repo }), /CI_BASE_SHA/i);
  });
});

test('malformed CI refs fail closed and write docs_only=false', async () => {
  await withRepository(async (repo) => {
    const output = join(repo, 'output.txt');
    const summary = join(repo, 'summary.md');
    const run = spawnSync(process.execPath, [script], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_BASE_SHA: 'not-a-sha',
        CI_HEAD_SHA: 'also-not-a-sha',
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
      },
    });

    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /CI_BASE_SHA/i);
    assert.match(await readFile(output, 'utf8'), /docs_only=false/);
    assert.match(await readFile(summary, 'utf8'), /full checks required/i);
  });
});

test('CLI reports a docs-only disposable Git change to Actions outputs', async () => {
  await withRepository(async (repo) => {
    await write(repo, 'docs/guide.md', '# first\n');
    const base = commit(repo, 'add docs');
    await write(repo, 'docs/guide.md', '# second\n');
    const head = commit(repo, 'update docs');
    const output = join(repo, 'output.txt');
    const summary = join(repo, 'summary.md');

    const run = spawnSync(process.execPath, [script], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, CI_BASE_SHA: base, CI_HEAD_SHA: head, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /docs_only=true/);
    assert.match(await readFile(output, 'utf8'), /docs_only=true/);
    assert.match(await readFile(summary, 'utf8'), /docs-only/i);
  });
});
