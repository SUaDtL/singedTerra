// Regression coverage for migration history and classification checks.
// Run: node --test scripts/checks/migration_classification.test.mjs

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceScript = join(root, 'scripts', 'checks', 'migration_classification.mjs');
const sourceHelper = join(root, 'scripts', 'checks', 'final-repository-root.mjs');
const sourceClassification = join(root, 'supabase', 'migrations', '011_data_classification_comments.sql');
const ciWorkflow = join(root, '.github', 'workflows', 'ci.yml');
const checkPath = join('scripts', 'checks', 'migration_classification.mjs');
const migrationPath = 'supabase/migrations';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function withFixture(run) {
  const fixture = await mkdtemp(join(tmpdir(), 'singedterra-migration-classification-'));
  assert.equal(relative(tmpdir(), fixture).startsWith('..'), false, 'fixture must be owned by the OS temp directory');
  assert.match(basename(fixture), /^singedterra-migration-classification-/, 'fixture cleanup must stay scoped');
  try {
    await mkdir(join(fixture, 'scripts', 'checks'), { recursive: true });
    await mkdir(join(fixture, migrationPath), { recursive: true });
    await cp(sourceScript, join(fixture, checkPath));
    await cp(sourceHelper, join(fixture, 'scripts', 'checks', 'final-repository-root.mjs'));
    await writeFile(join(fixture, migrationPath, '011_data_classification_comments.sql'), await readFile(sourceClassification, 'utf8'));
    await writeFile(join(fixture, migrationPath, '001_init.sql'), 'SELECT 1;\n');
    await writeFile(join(fixture, migrationPath, '020_verified_deployment_v3.sql'), 'SELECT 20;\n');
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'core.autocrlf', 'false']);
    git(fixture, ['config', 'user.email', 'migration-oracle@example.invalid']);
    git(fixture, ['config', 'user.name', 'Migration Oracle']);
    git(fixture, ['add', '.']);
    git(fixture, ['commit', '--quiet', '-m', 'base migration inventory']);
    return await run({
      fixture,
      base: git(fixture, ['rev-parse', 'HEAD']),
      check: (base, head) => spawnSync(process.execPath, [checkPath, '--check', 'history', '--base', base, '--head', head], {
        cwd: fixture,
        encoding: 'utf8',
      }),
      commit: (message) => {
        git(fixture, ['add', '.']);
        git(fixture, ['commit', '--quiet', '-m', message]);
        return git(fixture, ['rev-parse', 'HEAD']);
      },
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

function expectHistoryRejected(result, label) {
  assert.notEqual(result.status, 0, `${label} must reject an unsafe or unavailable migration comparison`);
}

function malformedCommit(cwd, label) {
  const missingTree = '1'.repeat(40);
  return execFileSync('git', ['hash-object', '--literally', '-t', 'commit', '-w', '--stdin'], {
    cwd,
    encoding: 'utf8',
    input: `tree ${missingTree}\nauthor Migration Oracle <migration-oracle@example.invalid> 0 +0000\ncommitter Migration Oracle <migration-oracle@example.invalid> 0 +0000\n\n${label}\n`,
  }).trim();
}

test('CI compares a pull request base with GitHub\'s verified synthetic merge result and runs the disposable Git suite', async () => {
  const workflow = await readFile(ciWorkflow, 'utf8');
  assert.match(workflow, /PR_HEAD_SHA:\s+\$\{\{ github\.sha \}\}/, 'PR history must use the synthetic merge commit, not the source branch head');
  assert.doesNotMatch(workflow, /PR_HEAD_SHA:\s+\$\{\{ github\.event\.pull_request\.head\.sha \}\}/, 'the source branch head omits base-only changes after divergence');
  assert.match(workflow, /node --test scripts\/checks\/migration_classification\.test\.mjs/, 'the disposable Git regressions must be a required CI step');
});

test('accepts a base-only forward migration when the PR uses the synthetic merge result, but rejects an applied PR edit', async () => {
  await withFixture(async ({ fixture, base, check, commit }) => {
    const defaultBranch = git(fixture, ['branch', '--show-current']);
    git(fixture, ['checkout', '--quiet', '-b', 'base-advance']);
    await writeFile(join(fixture, migrationPath, '021_base_only.sql'), 'SELECT 21;\n');
    const eventBase = commit('base adds forward migration');

    git(fixture, ['checkout', '--quiet', '-b', 'pr-source', base]);
    await writeFile(join(fixture, 'README.md'), 'source branch change\n');
    const sourceHead = commit('PR changes README only');
    git(fixture, ['merge', '--no-ff', '--no-edit', 'base-advance']);
    const syntheticMerge = git(fixture, ['rev-parse', 'HEAD']);
    assert.equal(check(eventBase, syntheticMerge).status, 0, 'the verified merge result must retain base-only forward migration 021');
    expectHistoryRejected(check(eventBase, sourceHead), 'source head without the current base-only migration');

    await writeFile(join(fixture, migrationPath, '020_verified_deployment_v3.sql'), 'SELECT 22;\n');
    const editedMerge = commit('PR edits applied migration 020');
    expectHistoryRejected(check(eventBase, editedMerge), 'synthetic merge with an applied migration edit');
    git(fixture, ['checkout', '--quiet', defaultBranch]);
  });
});

test('reports missing objects and real malformed-object ls-tree/diff failures instead of treating them as empty history', async () => {
  await withFixture(async ({ fixture, base, check }) => {
    const missingObject = check('1111111111111111111111111111111111111111', base);
    expectHistoryRejected(missingObject, 'nonzero missing base object');
    assert.match(missingObject.stderr, /Git rev-parse --verify .*failed/i, 'missing-object diagnostics must identify Git resolution');

    const malformedBase = malformedCommit(fixture, 'malformed base tree');
    const lsTreeFailure = check(malformedBase, base);
    expectHistoryRejected(lsTreeFailure, 'malformed base ls-tree failure');
    assert.match(lsTreeFailure.stderr, /Git ls-tree .*failed/i, 'ls-tree failure must remain visible');

    const malformedHead = malformedCommit(fixture, 'malformed head tree');
    const diffFailure = check(base, malformedHead);
    expectHistoryRejected(diffFailure, 'malformed head diff failure');
    assert.match(diffFailure.stderr, /Git diff .*failed/i, 'diff failure must remain visible');
  });
});

test('rejects an edit to applied migration 020 even though its numeric prefix is outside the old 001-010 filter', async () => {
  await withFixture(async ({ fixture, base, check, commit }) => {
    await writeFile(join(fixture, migrationPath, '020_verified_deployment_v3.sql'), 'SELECT 21;\n');
    const head = commit('edit applied migration 020');
    expectHistoryRejected(check(base, head), 'applied migration 020 edit');
  });
});

test('rejects applied migration edits across a multi-commit range', async () => {
  await withFixture(async ({ fixture, base, check, commit }) => {
    await writeFile(join(fixture, migrationPath, '020_verified_deployment_v3.sql'), 'SELECT 21;\n');
    commit('first edit to applied migration');
    await writeFile(join(fixture, 'README.md'), 'unrelated follow-up\n');
    const head = commit('second unrelated commit');
    expectHistoryRejected(check(base, head), 'multi-commit applied migration edit');
  });
});

test('rejects applied migration edits carried by a merge commit', async () => {
  await withFixture(async ({ fixture, base, check, commit }) => {
    const branch = git(fixture, ['branch', '--show-current']);
    git(fixture, ['checkout', '--quiet', '-b', 'migration-edit']);
    await writeFile(join(fixture, migrationPath, '020_verified_deployment_v3.sql'), 'SELECT 21;\n');
    commit('side branch applied migration edit');
    git(fixture, ['checkout', '--quiet', branch]);
    await writeFile(join(fixture, 'README.md'), 'main branch change\n');
    commit('main branch change');
    git(fixture, ['merge', '--no-ff', '--no-edit', 'migration-edit']);
    const head = git(fixture, ['rev-parse', 'HEAD']);
    expectHistoryRejected(check(base, head), 'merge commit applied migration edit');
  });
});

test('rejects deletion, rename, and both staged and unstaged edits of a base-inventory migration', async (t) => {
  await withFixture(async ({ fixture, base, check, commit }) => {
    await rm(join(fixture, migrationPath, '020_verified_deployment_v3.sql'));
    const deleted = commit('delete applied migration');
    expectHistoryRejected(check(base, deleted), 'applied migration deletion');

    git(fixture, ['checkout', '--quiet', base]);
    git(fixture, ['checkout', '--quiet', '-b', 'rename-migration']);
    git(fixture, ['mv', join(migrationPath, '020_verified_deployment_v3.sql'), join(migrationPath, '021_renamed.sql')]);
    const renamed = commit('rename applied migration');
    expectHistoryRejected(check(base, renamed), 'applied migration rename');

    git(fixture, ['checkout', '--quiet', base]);
    await writeFile(join(fixture, migrationPath, '020_verified_deployment_v3.sql'), 'SELECT 21;\n');
    expectHistoryRejected(check(base, base), 'unstaged applied migration edit');
    git(fixture, ['add', join(migrationPath, '020_verified_deployment_v3.sql')]);
    expectHistoryRejected(check(base, base), 'staged applied migration edit');
    t.diagnostic('The fixture intentionally exercises both worktree and index diffs against the protected base inventory.');
  });
});

test('allows a new forward migration but fails closed when the requested base cannot be resolved', async () => {
  await withFixture(async ({ fixture, base, check, commit }) => {
    await writeFile(join(fixture, migrationPath, '021_forward_only.sql'), 'SELECT 21;\n');
    const head = commit('add forward migration');
    assert.equal(check(base, head).status, 0, 'a new migration absent from the base inventory must remain forward-only');
    expectHistoryRejected(check('0000000000000000000000000000000000000000', head), 'unavailable base');
  });
});

test('a shallow clone with the explicitly fetched base still rejects an applied migration edit', async () => {
  await withFixture(async ({ fixture, base, check: unusedCheck, commit }) => {
    await writeFile(join(fixture, migrationPath, '020_verified_deployment_v3.sql'), 'SELECT 21;\n');
    const head = commit('edit applied migration before shallow clone');
    const cloneParent = await mkdtemp(join(tmpdir(), 'singedterra-migration-shallow-'));
    assert.equal(relative(tmpdir(), cloneParent).startsWith('..'), false, 'shallow fixture must stay under the OS temp directory');
    try {
      const shallow = join(cloneParent, 'checkout');
      git(cloneParent, ['clone', '--quiet', '--depth', '1', `file://${fixture.replaceAll('\\', '/')}`, shallow]);
      git(shallow, ['fetch', '--quiet', '--depth', '1', 'origin', base]);
      const result = spawnSync(process.execPath, [join('scripts', 'checks', 'migration_classification.mjs'), '--check', 'history', '--base', base, '--head', head], {
        cwd: shallow,
        encoding: 'utf8',
      });
      expectHistoryRejected(result, 'shallow checkout with fetched base and edited applied migration');
    } finally {
      await rm(cloneParent, { recursive: true, force: true });
    }
  });
});
