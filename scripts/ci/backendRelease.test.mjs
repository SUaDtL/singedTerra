import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';

import {
  assertDispatchContext,
  assertEnvironmentPolicy,
  assertImportClosure,
  assertPackageReleaseScripts,
  assertWorkflowContract,
  buildReceipt,
  digestFile,
  digestTree,
  loadAndValidateManifest,
  parseFunctionConfig,
  revalidateRequiredCiRun,
  selectRequiredCiRun,
} from './backendRelease.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const root = join(import.meta.dirname, '..', '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'deploy-backend.yml'), 'utf8');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function lfBytes(source) {
  return Buffer.from(source.replaceAll('\r\n', '\n'), 'utf8');
}

function resolveGitTree(repository, source) {
  const args = source === 'index'
    ? ['write-tree']
    : ['rev-parse', `${source}^{tree}`];
  const tree = execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  assert.match(tree, /^[0-9a-f]{40,64}$/, `Git ${source} source did not resolve to a tree object`);
  return tree;
}

function listGitTreeFiles(repository, tree, path) {
  return execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', tree, '--', path], { cwd: repository })
    .toString('utf8').split('\0').filter(Boolean);
}

function readGitTreeFile(repository, tree, path) {
  return execFileSync('git', ['show', `${tree}:${path}`], { cwd: repository });
}

function replaceWorkflowFixture(source, beforeLf, afterLf) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const before = beforeLf.replaceAll('\n', newline);
  const after = afterLf.replaceAll('\n', newline);
  assert.notEqual(before, after, 'workflow fixture mutation must change its target');
  assert.ok(source.includes(before), 'workflow fixture mutation target must exist');
  const candidate = source.replace(before, after);
  assert.notEqual(candidate, source, 'workflow fixture mutation must not be a no-op');
  return candidate;
}

function fixtureTreeDigest(files) {
  const hash = createHash('sha256');
  for (const [relative, source] of Object.entries(files).sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))) {
    const pathBytes = Buffer.from(relative, 'utf8');
    const sourceBytes = lfBytes(source);
    hash.update(`file\0${pathBytes.length}\0`);
    hash.update(pathBytes);
    hash.update(`\0${sourceBytes.length}\0`);
    hash.update(sourceBytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function writeReleaseFixture(directory, newline) {
  const sources = {
    config: '[functions.release_probe]\nverify_jwt = true\n',
    migration: 'select 1;\n',
    functionShared: { 'mod.ts': 'export const shared = 1;\n' },
    verifiedReplayShared: { 'value.ts': 'export const replay = 2;\n' },
    releaseFunction: {
      'index.ts': "import { shared } from '../_shared/mod.ts'\nimport { replay } from '../../../shared/src/value.ts'\nexport { replay, shared }\n",
    },
  };
  const withNewline = (source) => source.replaceAll('\n', newline);
  const writeSources = async (base, files) => {
    for (const [relative, source] of Object.entries(files)) {
      const target = join(directory, base, ...relative.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, withNewline(source), 'utf8');
    }
  };
  await mkdir(join(directory, 'supabase', 'migrations'), { recursive: true });
  await writeFile(join(directory, 'supabase', 'config.toml'), withNewline(sources.config), 'utf8');
  await writeFile(join(directory, 'supabase', 'migrations', '001_init.sql'), withNewline(sources.migration), 'utf8');
  await writeSources('supabase/functions/_shared', sources.functionShared);
  await writeSources('shared/src', sources.verifiedReplayShared);
  await writeSources('supabase/functions/release_probe', sources.releaseFunction);

  const manifest = {
    schemaVersion: 1,
    supabaseCliVersion: '2.105.0',
    config: { path: 'supabase/config.toml', sha256: sha256(lfBytes(sources.config)) },
    functionShared: { path: 'supabase/functions/_shared', sha256: fixtureTreeDigest(sources.functionShared) },
    verifiedReplayShared: { path: 'shared/src', sha256: fixtureTreeDigest(sources.verifiedReplayShared) },
    migrations: [{ path: 'supabase/migrations/001_init.sql', sha256: sha256(lfBytes(sources.migration)) }],
    functions: [{
      name: 'release_probe',
      path: 'supabase/functions/release_probe',
      verifyJwt: true,
      sha256: fixtureTreeDigest(sources.releaseFunction),
    }],
    compatibility: {
      commandProtocolVersions: [1, 2],
      casualCompletionVersions: ['legacy_unvalidated', 1],
      historicalVerifiedTuples: [[1, 1, 3]],
      verifiedTuples: [[2, 2, 4], [3, 3, 4]],
      recoveryClass: 'fix-forward-after-versioned-state',
    },
  };
  const scripts = {
    'deploy:backend:migrations': 'supabase db push --linked --yes',
    'deploy:backend:config': 'supabase config push --yes',
    'deploy:backend:functions': 'supabase functions deploy release_probe --use-api --yes',
    'deploy:backend': 'npm run backend:release:check && npm run deploy:backend:migrations && npm run deploy:backend:config && npm run deploy:backend:functions',
  };
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, scripts, devDependencies: { supabase: '2.105.0' } }), 'utf8');
  await writeFile(join(directory, 'package-lock.json'), JSON.stringify({
    packages: {
      '': { devDependencies: { supabase: '2.105.0' } },
      'node_modules/supabase': { version: '2.105.0' },
    },
  }), 'utf8');
  await writeFile(
    join(directory, 'supabase', 'backend-release-manifest.json'),
    withNewline(`${JSON.stringify(manifest, null, 2)}\n`),
    'utf8',
  );
  return { manifest, sources };
}

function ciRun(overrides = {}) {
  return {
    id: 10,
    run_attempt: 1,
    path: '.github/workflows/ci.yml',
    event: 'push',
    head_branch: 'main',
    head_sha: SHA_A,
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  };
}

test('the checked-in backend manifest exactly describes the current release inputs without a circular source SHA', () => {
  const result = loadAndValidateManifest(root);
  assert.equal(result.manifest.schemaVersion, 1);
  assert.equal(result.manifest.supabaseCliVersion, '2.105.0');
  assert.equal(result.manifest.functions.length, 17);
  assert.equal(result.manifest.migrations.at(-1).path, 'supabase/migrations/023_room_lifecycle.sql');
  assert.equal(Object.hasOwn(result.manifest, 'sourceSha'), false);
  assert.match(result.manifestSha256, /^[0-9a-f]{64}$/);
});

test('release source digests are LF and CRLF invariant while remaining mutation sensitive and fail closed', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'singedterra-backend-portability-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const lfFixture = join(fixture, 'lf');
  const crlfFixture = join(fixture, 'crlf');
  await writeReleaseFixture(lfFixture, '\n');
  await writeReleaseFixture(crlfFixture, '\r\n');

  const lfRelease = loadAndValidateManifest(lfFixture);
  const crlfRelease = loadAndValidateManifest(crlfFixture);
  assert.equal(crlfRelease.manifestSha256, lfRelease.manifestSha256);
  assert.equal(crlfRelease.migrationSetSha256, lfRelease.migrationSetSha256);
  assert.equal(crlfRelease.functionSetSha256, lfRelease.functionSetSha256);
  assert.equal(digestTree(join(crlfFixture, 'shared', 'src')), digestTree(join(lfFixture, 'shared', 'src')));
  const lfWorkflow = workflow.replaceAll('\r\n', '\n');
  assert.equal(assertWorkflowContract(lfWorkflow), true);
  assert.equal(assertWorkflowContract(lfWorkflow.replaceAll('\n', '\r\n')), true);

  const framedTree = join(fixture, 'framed-tree');
  await mkdir(framedTree);
  await writeFile(join(framedTree, 'a.ts'), 'x\r\n', 'utf8');
  assert.equal(digestTree(framedTree), fixtureTreeDigest({ 'a.ts': 'x\n' }));

  const mutationCases = [
    ['supabase/config.toml', '\n# changed\n', /config digest/i],
    ['supabase/migrations/001_init.sql', '\n-- changed\n', /migration digest/i],
    ['supabase/functions/release_probe/index.ts', '\n// changed\n', /function digest/i],
    ['supabase/functions/_shared/mod.ts', '\n// changed\n', /function shared tree digest/i],
    ['shared/src/value.ts', '\n// changed\n', /verified replay shared tree digest/i],
  ];
  for (const [relative, mutation, expected] of mutationCases) {
    const target = join(crlfFixture, ...relative.split('/'));
    const original = readFileSync(target);
    await writeFile(target, Buffer.concat([original, Buffer.from(mutation)]));
    assert.throws(() => loadAndValidateManifest(crlfFixture), expected);
    await writeFile(target, original);
  }

  const unsupported = join(crlfFixture, 'shared', 'src', 'payload.bin');
  await writeFile(unsupported, Buffer.from([0, 1, 2]));
  assert.throws(() => loadAndValidateManifest(crlfFixture), /unsupported release source type/i);
  await rm(unsupported);

  const source = join(crlfFixture, 'shared', 'src', 'value.ts');
  const original = readFileSync(source);
  await writeFile(source, Buffer.from([0xff, 0xfe]));
  assert.throws(() => loadAndValidateManifest(crlfFixture), /valid UTF-8/i);
  await writeFile(source, Buffer.from('export const replay = 2;\0\n'));
  assert.throws(() => loadAndValidateManifest(crlfFixture), /NUL byte/i);
  await writeFile(source, 'export const replay = 2;\r', 'utf8');
  assert.throws(() => loadAndValidateManifest(crlfFixture), /bare carriage return/i);
  await writeFile(source, original);

  const bomLfTree = join(fixture, 'bom-lf');
  const bomCrlfTree = join(fixture, 'bom-crlf');
  const noBomTree = join(fixture, 'no-bom');
  await Promise.all([bomLfTree, bomCrlfTree, noBomTree].map((path) => mkdir(path)));
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  await writeFile(join(bomLfTree, 'source.ts'), Buffer.concat([bom, Buffer.from('export {};\n')]));
  await writeFile(join(bomCrlfTree, 'source.ts'), Buffer.concat([bom, Buffer.from('export {};\r\n')]));
  await writeFile(join(noBomTree, 'source.ts'), 'export {};\n', 'utf8');
  assert.equal(digestTree(bomCrlfTree), digestTree(bomLfTree));
  assert.notEqual(digestTree(bomLfTree), digestTree(noBomTree));

  const manifestPath = join(crlfFixture, 'supabase', 'backend-release-manifest.json');
  const manifestSource = readFileSync(manifestPath, 'utf8');
  await writeFile(manifestPath, manifestSource.replace('"schemaVersion": 1', '"schemaVersion": 2'), 'utf8');
  assert.notEqual(digestFile(manifestPath), lfRelease.manifestSha256);
});

test('the complete staged Git snapshot has one source identity across LF and CRLF representations', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'singedterra-git-source-portability-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const sourceTree = resolveGitTree(root, 'index');
  const manifestBytes = readGitTreeFile(root, sourceTree, 'supabase/backend-release-manifest.json');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  let rawDifferences = 0;

  for (const entry of [manifest.config, ...manifest.migrations]) {
    const gitBytes = readGitTreeFile(root, sourceTree, entry.path);
    const source = gitBytes.toString('utf8');
    assert.doesNotMatch(source, /\r/, `${entry.path} Git blob is not LF source`);
    const lfPath = join(fixture, 'files', 'lf', ...entry.path.split('/'));
    const crlfPath = join(fixture, 'files', 'crlf', ...entry.path.split('/'));
    await mkdir(dirname(lfPath), { recursive: true });
    await mkdir(dirname(crlfPath), { recursive: true });
    await writeFile(lfPath, gitBytes);
    await writeFile(crlfPath, source.replaceAll('\n', '\r\n'), 'utf8');
    if (!readFileSync(lfPath).equals(readFileSync(crlfPath))) rawDifferences += 1;
    assert.equal(digestFile(lfPath), digestFile(crlfPath), entry.path);
  }

  const trees = [manifest.functionShared, manifest.verifiedReplayShared, ...manifest.functions];
  for (const [index, entry] of trees.entries()) {
    const tracked = listGitTreeFiles(root, sourceTree, entry.path);
    const lfTree = join(fixture, 'trees', String(index), 'lf');
    const crlfTree = join(fixture, 'trees', String(index), 'crlf');
    for (const path of tracked) {
      const gitBytes = readGitTreeFile(root, sourceTree, path);
      const source = gitBytes.toString('utf8');
      assert.doesNotMatch(source, /\r/, `${path} Git blob is not LF source`);
      const relative = path.slice(entry.path.length + 1);
      const lfTarget = join(lfTree, ...relative.split('/'));
      const crlfTarget = join(crlfTree, ...relative.split('/'));
      await mkdir(dirname(lfTarget), { recursive: true });
      await mkdir(dirname(crlfTarget), { recursive: true });
      await writeFile(lfTarget, gitBytes);
      await writeFile(crlfTarget, source.replaceAll('\n', '\r\n'), 'utf8');
      if (!readFileSync(lfTarget).equals(readFileSync(crlfTarget))) rawDifferences += 1;
    }
    assert.equal(digestTree(lfTree), digestTree(crlfTree), entry.path);
  }

  const manifestSource = manifestBytes.toString('utf8').replaceAll('\r\n', '\n');
  const lfManifestPath = join(fixture, 'backend-release-manifest.json');
  const crlfManifestPath = join(fixture, 'backend-release-manifest-crlf.json');
  await writeFile(lfManifestPath, manifestSource, 'utf8');
  await writeFile(crlfManifestPath, manifestSource.replaceAll('\n', '\r\n'), 'utf8');
  assert.equal(digestFile(lfManifestPath), digestFile(crlfManifestPath));
  assert.ok(rawDifferences > 0, 'Actual Git source must exercise at least one raw LF/CRLF difference');
});

test('Git source portability reads staged additions and deletions from one coherent snapshot', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'singedterra-git-staged-snapshot-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(join(fixture, 'tree'), { recursive: true });
  await writeFile(join(fixture, 'tree', 'deleted.ts'), 'export const deleted = true;\n', 'utf8');
  await writeFile(join(fixture, 'tree', 'kept.ts'), 'export const kept = true;\n', 'utf8');
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: fixture });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: fixture });
  execFileSync('git', ['config', 'user.email', 'release-test@example.invalid'], { cwd: fixture });
  execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: fixture });
  execFileSync('git', ['add', '--', 'tree'], { cwd: fixture });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: fixture });

  await writeFile(join(fixture, 'tree', 'added.ts'), 'export const added = true;\n', 'utf8');
  execFileSync('git', ['add', '--', 'tree/added.ts'], { cwd: fixture });
  execFileSync('git', ['rm', '--', 'tree/deleted.ts'], { cwd: fixture });

  const tracked = execFileSync('git', ['ls-files', '--', 'tree'], { cwd: fixture, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  assert.ok(tracked.includes('tree/added.ts'), 'staged addition must be in the source inventory');
  assert.ok(!tracked.includes('tree/deleted.ts'), 'staged deletion must be absent from the source inventory');
  const stagedTree = resolveGitTree(fixture, 'index');
  assert.deepEqual(listGitTreeFiles(fixture, stagedTree, 'tree'), tracked);
  assert.equal(readGitTreeFile(fixture, stagedTree, 'tree/added.ts').toString('utf8'), 'export const added = true;\n');

  const headTree = resolveGitTree(fixture, 'HEAD');
  assert.deepEqual(listGitTreeFiles(fixture, headTree, 'tree'), ['tree/deleted.ts', 'tree/kept.ts']);
  assert.equal(readGitTreeFile(fixture, headTree, 'tree/deleted.ts').toString('utf8'), 'export const deleted = true;\n');
});

test('the checked-in workflow satisfies every credential and mutation gate', () => {
  assert.equal(assertWorkflowContract(workflow), true);
});

test('function config rejects alternate deployment inputs outside the default hashed entrypoint', () => {
  assert.equal(parseFunctionConfig('[functions.submit_action]\nverify_jwt = false\n').get('submit_action'), false);
  for (const field of ['entrypoint = "../outside.ts"', 'import_map = "../outside.json"', 'static_files = ["../outside.txt"]']) {
    assert.throws(() => parseFunctionConfig(`[functions.submit_action]\nverify_jwt = false\n${field}\n`), /unsupported function config field/i);
  }
  assert.throws(() => parseFunctionConfig('[functions.submit_action]\nverify_jwt = false\n[functions.submit_action.env]\nFILE = "../outside"\n'), /unsupported function config shape/i);
  assert.throws(() => parseFunctionConfig('functions.submit_action.entrypoint = "../outside.ts"\n'), /unsupported function config shape/i);
  assert.throws(() => parseFunctionConfig('functions = { submit_action = { entrypoint = "../outside.ts" } }\n'), /unsupported function config shape/i);
});

test('function config rejects every table and key form outside its closed bare-name subset', () => {
  const validFunction = '[functions.submit_action]\nverify_jwt = false\n';
  const unsupported = [
    '["funct\\u0069ons".submit_action.env]\nFILE = "../outside"\n',
    '["functions".submit_action]\nverify_jwt = false\n',
    '[functions."submit_action"]\nverify_jwt = false\n',
    '[functions.submit_action.env]\nFILE = "../outside"\n',
    '[[functions.submit_action]]\nverify_jwt = false\n',
    '"functions".submit_action.env = {}\n',
    'functions.submit_action.env = {}\n',
  ];
  for (const source of unsupported) {
    assert.throws(() => parseFunctionConfig(validFunction + source), /unsupported (?:backend config|function config)/i);
  }
});

test('function config closes every assignment over the supported single-line value grammar', () => {
  const valid = String.raw`project_id = "project#fragment" # the hash in the string is not a comment
enabled = true
port = 54321
minimum_password_length = +8
schemas = ["public", "quoted\"hash#value", "slash\\value"] # trailing comment
empty = []

[functions.submit_action]
verify_jwt = false # function policy comment
`;
  const functions = parseFunctionConfig(valid);
  assert.deepEqual([...functions], [['submit_action', false]]);

  const forgedBasic = String.raw`[auth.email.template.confirmation]
subject = """
[functions.submit_action]
verify_jwt = false # """
`;
  const forgedLiteral = String.raw`[auth.email.template.confirmation]
subject = '''
[functions.submit_action]
verify_jwt = false # '''
`;
  for (const source of [forgedBasic, forgedLiteral]) {
    assert.throws(() => parseFunctionConfig(source), /unsupported backend config assignment value/i);
  }

  const commentOnlyHeader = String.raw`subject = "safe # [functions.not_a_table]" # [functions.also_not_a_table]
verify_jwt = false
`;
  assert.deepEqual([...parseFunctionConfig(commentOnlyHeader)], []);

  const unsupportedAssignments = [
    'enabled = true trailing\n',
    'port = 54.321\n',
    "project_id = 'literal strings are outside the release subset'\n",
    'project_id = "unsupported\\qescape"\n',
    'schemas = ["public", 7]\n',
    'schemas = ["unsupported\\qescape"]\n',
    'schemas = [\n  "public",\n]\n',
    'enabled = true # accepted comment\ntrailing text\n',
  ];
  for (const source of unsupportedAssignments) {
    assert.throws(() => parseFunctionConfig(source), /unsupported (?:backend|function) config/i);
  }
});

test('package release scripts reject partial or implicit function deployment', () => {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const functionNames = loadAndValidateManifest(root).manifest.functions.map(({ name }) => name);
  assert.equal(assertPackageReleaseScripts(packageJson, functionNames), true);
  assert.throws(() => assertPackageReleaseScripts({
    ...packageJson,
    scripts: { ...packageJson.scripts, 'deploy:backend:functions': 'supabase functions deploy --use-api --yes' },
  }, functionNames), /complete release policy/i);
});

test('the actual config release script passes noninteractive confirmation to an isolated CLI seam', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'singedterra-config-command-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const output = join(fixture, 'arguments.json');
  const probe = join(fixture, 'probe.cjs');
  const bin = join(fixture, 'node_modules', '.bin');
  await mkdir(bin, { recursive: true });
  await writeFile(probe, "require('node:fs').writeFileSync(process.env.PROBE_OUTPUT, JSON.stringify(process.argv.slice(2)))\n");
  if (process.platform === 'win32') {
    await writeFile(join(bin, 'supabase.cmd'), `@echo off\r\n"${process.execPath}" "%FAKE_SUPABASE_PROBE%" %*\r\n`);
  } else {
    const executable = join(bin, 'supabase');
    await writeFile(executable, `#!/bin/sh\nexec "${process.execPath}" "$FAKE_SUPABASE_PROBE" "$@"\n`);
    await chmod(executable, 0o755);
  }
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  await writeFile(join(fixture, 'package.json'), JSON.stringify({
    private: true,
    scripts: { 'probe-config': packageJson.scripts['deploy:backend:config'] },
  }));
  const npmCli = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].find((path) => path && basename(path) === 'npm-cli.js' && existsSync(path) && lstatSync(path).isFile());
  assert.ok(npmCli, 'a fixed npm CLI entrypoint is required for the command seam');
  const result = spawnSync(process.execPath, [npmCli, '--ignore-scripts', 'run', 'probe-config'], {
    cwd: fixture,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, FAKE_SUPABASE_PROBE: probe, PROBE_OUTPUT: output },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), ['config', 'push', '--yes']);
});

const workflowRejections = [
  ['automatic trigger', workflow.replace('  workflow_dispatch:', '  workflow_dispatch:\n  push:'), /automatic source event/i],
  ['mutable gate checkout', workflow.replace('ref: ${{ github.sha }}', 'ref: refs/heads/main'), /immutable dispatch checkout/i],
  ['gate code before HEAD verification', workflow.replace('$(git rev-parse HEAD)', '$(git status --porcelain)'), /immutable dispatch checkout/i],
  ['mutable approved checkout', workflow.replace('ref: ${{ needs.gate.outputs.source_sha }}', 'ref: refs/heads/main'), /approved checkout/i],
  ['approved code before HEAD verification', (() => {
    const prefix = workflow.slice(0, workflow.indexOf('\n  deploy:'));
    const deploy = workflow.slice(workflow.indexOf('\n  deploy:')).replace('$(git rev-parse HEAD)', '$(git status --porcelain)');
    return prefix + deploy;
  })(), /approved checkout/i],
  ['missing approval-time revalidation', workflow.replace('node scripts/ci/backendRelease.mjs revalidate', 'echo skipped-revalidation'), /gate revalidation/i],
  ['revalidation command success suffix', workflow.replace('node scripts/ci/backendRelease.mjs revalidate', 'node scripts/ci/backendRelease.mjs revalidate || true'), /closed reviewed execution contract/i],
  ['continue-on-error revalidation', workflow.replace('        id: revalidate', '        id: revalidate\n        continue-on-error: true'), /cannot continue/i],
  ['conditional revalidation', workflow.replace('        id: revalidate', '        id: revalidate\n        if: always()'), /unsafe execution graph/i],
  ['detached deploy dependency', workflow.replace('    needs: gate', '    needs: []'), /depend only on the gate/i],
  ['credential step before revalidation', workflow.replace('      - name: Revalidate source, manifest, CLI and exact CI attempt after approval', '      - name: Premature production credential\n        run: echo unsafe\n        env:\n          EARLY_SECRET: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n      - name: Revalidate source, manifest, CLI and exact CI attempt after approval'), /after approval-time revalidation/i],
  ['masked preflight pipeline failure', workflow.replace(' > "$RUNNER_TEMP/migrations-before.json"', ' | tee "$RUNNER_TEMP/migrations-before.json"'), /preflight is not fail-closed/i],
  ['migration-list success suffix', workflow.replace('supabase migration list --linked --output json >', 'supabase migration list --linked --output json || true >'), /closed reviewed execution contract/i],
  ['extra credentialed mutation before preflight', workflow.replace('      - name: Read config metadata before mutation', '      - name: Premature migration mutation\n        id: premature_migrations\n        run: npm run deploy:backend:migrations\n        env:\n          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}\n      - name: Read config metadata before mutation'), /closed reviewed execution contract/i],
  ['missing protected environment', workflow.replace('name: production-backend', 'name: production'), /protected environment/i],
  ['missing administrator-bypass evidence', workflow.replaceAll('admins_can_bypass', 'omitted_admin_policy'), /protected environment/i],
  ['job-scoped production credentials', () => replaceWorkflowFixture(
    workflow,
    '    environment:\n      name: production-backend',
    '    env:\n      PLACEHOLDER: unsafe\n    environment:\n      name: production-backend',
  ), /job scope/i],
  ['credential reference before protected job', workflow.replace('    outputs:', '    unsafe: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n    outputs:'), /before the protected environment/i],
  ['latest CLI selector', workflow.replace('node-version-file: .nvmrc', 'node-version-file: .nvmrc\n          version: latest'), /unpinned or partial/i],
  ['partial migration selector', workflow.replace('      candidate_sha:', '      deploy_migrations:\n      candidate_sha:'), /unpinned or partial/i],
  ['missing migration phase', workflow.replace('npm run deploy:backend:migrations', 'echo skipped-migrations'), /deploy:backend:migrations/i],
  ['missing config phase', workflow.replace('npm run deploy:backend:config', 'echo skipped-config'), /deploy:backend:config/i],
  ['implicit function inventory', workflow.replace('npm run deploy:backend:functions', 'supabase functions deploy --use-api --yes'), /deploy:backend:functions/i],
  ['unbound receipt name', workflow.replace('backend-release-receipt-${{ github.run_id }}-${{ github.run_attempt }}', 'backend-release-receipt'), /attempt-bound receipt/i],
];

for (const [boundary, candidate, expected] of workflowRejections) {
  test(`workflow contract rejects ${boundary}`, () => {
    const rejectedSource = typeof candidate === 'function' ? candidate() : candidate;
    assert.notEqual(rejectedSource, workflow, `${boundary} fixture mutation must not be a no-op`);
    assert.throws(() => assertWorkflowContract(rejectedSource), expected);
  });
}

test('job-scoped credential mutation is effective and rejected for LF and CRLF workflow sources', () => {
  const lfWorkflow = workflow.replaceAll('\r\n', '\n');
  for (const newline of ['\n', '\r\n']) {
    const source = lfWorkflow.replaceAll('\n', newline);
    const candidate = replaceWorkflowFixture(
      source,
      '    environment:\n      name: production-backend',
      '    env:\n      PLACEHOLDER: unsafe\n    environment:\n      name: production-backend',
    );
    assert.notEqual(candidate, source);
    assert.throws(() => assertWorkflowContract(candidate), /job scope/i);
  }
});

test('manual dispatch is bound to the main-hosted workflow, exact candidate and reviewed manifest digest', () => {
  const context = {
    eventName: 'workflow_dispatch',
    repository: 'SUaDtL/singedTerra',
    ref: 'refs/heads/main',
    sha: SHA_A,
    workflowRef: 'SUaDtL/singedTerra/.github/workflows/deploy-backend.yml@refs/heads/main',
    candidateSha: SHA_A,
    expectedManifestSha256: 'c'.repeat(64),
    actualManifestSha256: 'c'.repeat(64),
  };
  assert.deepEqual(assertDispatchContext(context), { sourceSha: SHA_A, manifestSha256: 'c'.repeat(64) });
  assert.throws(() => assertDispatchContext({ ...context, candidateSha: SHA_B }), /candidate/i);
  assert.throws(() => assertDispatchContext({ ...context, workflowRef: context.workflowRef.replace('main', 'topic') }), /workflow ref/i);
  assert.throws(() => assertDispatchContext({ ...context, expectedManifestSha256: 'd'.repeat(64) }), /manifest/i);
});

test('only the newest exact main-push CI run can authorize deployment', () => {
  assert.equal(selectRequiredCiRun([ciRun()], SHA_A).id, 10);
  assert.throws(() => selectRequiredCiRun([ciRun({ head_sha: SHA_B })], SHA_A), /has not succeeded/i);
  assert.throws(() => selectRequiredCiRun([
    ciRun(),
    ciRun({ id: 11, conclusion: 'failure' }),
  ], SHA_A), /concluded failure/i);
});

test('approval-time revalidation rejects a changed attempt or superseding run', () => {
  const expected = { sourceSha: SHA_A, runId: '10', runAttempt: '1' };
  assert.equal(revalidateRequiredCiRun([ciRun()], expected, ciRun()).id, 10);
  assert.throws(() => revalidateRequiredCiRun([ciRun({ run_attempt: 2 })], expected, ciRun({ run_attempt: 2 })), /attempt changed/i);
  assert.throws(() => revalidateRequiredCiRun([ciRun(), ciRun({ id: 11 })], expected, ciRun()), /superseded/i);
});

test('production credentials require a reviewer-protected environment restricted to protected branches', () => {
  const environment = {
    name: 'production-backend',
    protection_rules: [{
      type: 'required_reviewers',
      prevent_self_review: false,
      reviewers: [{ type: 'User', reviewer: { login: 'verified-maintainer' } }],
    }],
    can_admins_bypass: false,
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
  };
  assert.deepEqual(assertEnvironmentPolicy(environment), {
    reviewers: ['verified-maintainer'],
    preventSelfReview: false,
    adminsCanBypass: false,
  });
  assert.throws(() => assertEnvironmentPolicy({ ...environment, protection_rules: [] }), /required reviewer/i);
  assert.throws(() => assertEnvironmentPolicy({ ...environment, deployment_branch_policy: null }), /protected branches/i);
  assert.throws(() => assertEnvironmentPolicy({ ...environment, protection_rules: [{
    ...environment.protection_rules[0], prevent_self_review: undefined,
  }] }), /self-review policy/i);
  assert.throws(() => assertEnvironmentPolicy({ ...environment, can_admins_bypass: true }), /administrator bypass/i);
});

test('the real gate entrypoint fails closed before network access for a non-manual event', () => {
  const release = loadAndValidateManifest(root);
  const result = spawnSync(process.execPath, ['scripts/ci/backendRelease.mjs', 'gate'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_REPOSITORY: 'SUaDtL/singedTerra',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: SHA_A,
      GITHUB_WORKFLOW_REF: 'SUaDtL/singedTerra/.github/workflows/deploy-backend.yml@refs/heads/main',
      CANDIDATE_SHA: SHA_A,
      CANDIDATE_MANIFEST_SHA256: release.manifestSha256,
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be manually dispatched/i);
  assert.doesNotMatch(result.stderr, /GitHub API request/i);
});

test('the workflow shell stops after a failed piped preflight before a mutation marker', () => {
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', 'false | cat; echo MUTATION_REACHED'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /MUTATION_REACHED/);
});

test('the import graph accepts contained inputs and rejects escapes and unsupported resolution', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'singedterra-import-closure-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(join(fixture, 'supabase', 'functions', 'f'), { recursive: true });
  await mkdir(join(fixture, 'supabase', 'functions', '_shared'), { recursive: true });
  await mkdir(join(fixture, 'shared', 'src'), { recursive: true });
  await writeFile(join(fixture, 'supabase', 'functions', '_shared', 'mod.ts'), 'export const value = 1\n');
  await writeFile(join(fixture, 'shared', 'src', 'value.ts'), 'export const shared = 1\n');
  await writeFile(join(fixture, 'outside.ts'), 'export const outside = 1\n');
  const entrypoint = join(fixture, 'supabase', 'functions', 'f', 'index.ts');
  const inventory = {
    functions: [{ name: 'f', path: 'supabase/functions/f' }],
    functionShared: { path: 'supabase/functions/_shared' },
    verifiedReplayShared: { path: 'shared/src' },
  };
  await writeFile(entrypoint, "import { value } from '../_shared/mod.ts'\nimport { shared } from '../../../shared/src/value.ts'\nexport { value, shared }\n");
  assert.equal(assertImportClosure(fixture, inventory).files.length, 3);
  await writeFile(entrypoint, "import { outside } from '../../../outside.ts'\nexport { outside }\n");
  assert.throws(() => assertImportClosure(fixture, inventory), /escapes the hashed inventory/i);
  await writeFile(entrypoint, "const path = './local.ts'\nawait import(path)\n");
  assert.throws(() => assertImportClosure(fixture, inventory), /unsupported dynamic import/i);
  await writeFile(entrypoint, "import value from 'https://example.com/latest.ts'\nexport { value }\n");
  assert.throws(() => assertImportClosure(fixture, inventory), /unpinned external/i);
  await writeFile(join(fixture, 'supabase', 'functions', 'f', 'deno.json'), '{"imports":{}}\n');
  assert.throws(() => assertImportClosure(fixture, inventory), /import maps are unsupported/i);
  assert.throws(() => assertImportClosure(fixture, { functions: 'malformed' }), /malformed backend inventory/i);
});

test('tree digests reject symbolic links instead of following undeclared content', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'singedterra-backend-release-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await writeFile(join(fixture, 'source.ts'), 'export const value = 1;\n');
  try {
    await symlink(join(fixture, 'source.ts'), join(fixture, 'alias.ts'), 'file');
  } catch (error) {
    t.skip(`symbolic links unavailable in this environment: ${error.code ?? error.message}`);
    return;
  }
  assert.throws(() => digestTree(fixture), /symbolic link/i);
});

test('release receipts bind the source and phase evidence while redacting credential-shaped fields', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'singedterra-backend-receipt-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const observation = join(fixture, 'functions.json');
  await writeFile(observation, JSON.stringify([{ name: 'submit_action', version: 7, access_token: 'never-record-me' }]));
  const receipt = buildReceipt({
    GITHUB_SHA: SHA_A,
    GITHUB_RUN_ID: '21',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_ACTOR: 'verified-maintainer',
    CANDIDATE_MANIFEST_SHA256: 'c'.repeat(64),
    REQUIRED_CI_RUN_ID: '20',
    REQUIRED_CI_RUN_ATTEMPT: '1',
    MIGRATION_SET_SHA256: 'd'.repeat(64),
    FUNCTION_SET_SHA256: 'e'.repeat(64),
    SUPABASE_CLI_VERSION: '2.105.0',
    CONFIGURED_REVIEWERS: 'verified-maintainer',
    PREVENT_SELF_REVIEW: 'false',
    ADMINS_CAN_BYPASS: 'false',
    FUNCTIONS_BEFORE_PATH: observation,
    FUNCTIONS_OUTCOME: 'success',
    MIGRATION_DRY_RUN_OUTCOME: 'success',
  });
  assert.equal(receipt.sourceSha, SHA_A);
  assert.equal(receipt.phaseOutcomes.functions, 'success');
  assert.equal(receipt.phaseOutcomes.migrationDryRun, 'success');
  assert.equal(receipt.observations.functionsBefore.value[0].access_token, '[redacted]');
});
