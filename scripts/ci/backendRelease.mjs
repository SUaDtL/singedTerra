import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import ts from 'typescript';

const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const FUNCTION_NAME = /^[a-z][a-z0-9_]*$/;
const MIGRATION_PATH = /^supabase\/migrations\/([0-9]{3})_[a-z0-9_]+\.sql$/;
const MANIFEST_PATH = 'supabase/backend-release-manifest.json';
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_API_BYTES = 2 * 1024 * 1024;
const API_VERSION = '2022-11-28';
const WORKFLOW_CONTRACT_SHA256 = '1dbce530a25be805670c241cb7e12ca3d3041b9bfab0b2dcdf925f2b66d993c5';
const RELEASE_SOURCE_EXTENSIONS = new Set(['.json', '.sql', '.toml', '.ts']);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${label} has an invalid shape.`);
}

function assertSha(value, label) {
  if (!FULL_SHA.test(value ?? '')) fail(`Invalid ${label} SHA.`);
}

function assertSha256(value, label) {
  if (!SHA256.test(value ?? '')) fail(`Invalid ${label} digest.`);
}

function assertRunId(value, label) {
  if (!RUN_ID.test(String(value ?? ''))) fail(`Invalid ${label}.`);
}

export function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalSourceBytes(bytes, path) {
  if (!RELEASE_SOURCE_EXTENSIONS.has(extname(path).toLowerCase())) {
    fail(`Unsupported release source type: ${path}`);
  }
  if (bytes.includes(0)) fail(`Release source contains a NUL byte: ${path}`);
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x0d && bytes[index + 1] !== 0x0a) {
      fail(`Release source contains a bare carriage return: ${path}`);
    }
  }
  try {
    UTF8_DECODER.decode(bytes);
  } catch {
    fail(`Release source is not valid UTF-8: ${path}`);
  }
  let crlfCount = 0;
  for (let index = 0; index < bytes.length - 1; index += 1) {
    if (bytes[index] === 0x0d && bytes[index + 1] === 0x0a) crlfCount += 1;
  }
  if (crlfCount === 0) return Buffer.from(bytes);
  const source = Buffer.allocUnsafe(bytes.length - crlfCount);
  let target = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x0d) continue;
    source[target] = bytes[index];
    target += 1;
  }
  return source;
}

export function digestFile(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail(`Release input is a symbolic link: ${path}`);
  if (!stat.isFile()) fail(`Release input is not a regular file: ${path}`);
  return digestBytes(canonicalSourceBytes(readFileSync(path), path));
}

function treeEntries(directory) {
  const absoluteRoot = resolve(directory);
  const rootStat = lstatSync(absoluteRoot);
  if (rootStat.isSymbolicLink()) fail(`Release input is a symbolic link: ${directory}`);
  if (!rootStat.isDirectory()) fail(`Release input is not a directory: ${directory}`);
  const entries = [];
  function walk(current) {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, item.name);
      const rel = relative(absoluteRoot, absolute).split(sep).join('/');
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(`Release input contains a symbolic link: ${rel}`);
      if (stat.isDirectory()) walk(absolute);
      else if (stat.isFile()) entries.push({ absolute, relative: rel });
      else fail(`Release input contains a non-regular entry: ${rel}`);
    }
  }
  walk(absoluteRoot);
  entries.sort((left, right) => Buffer.compare(Buffer.from(left.relative), Buffer.from(right.relative)));
  if (entries.length === 0) fail(`Release input tree is empty: ${directory}`);
  return entries;
}

export function digestTree(directory) {
  const hash = createHash('sha256');
  for (const entry of treeEntries(directory)) {
    const pathBytes = Buffer.from(entry.relative, 'utf8');
    const sourceBytes = canonicalSourceBytes(readFileSync(entry.absolute), entry.absolute);
    hash.update(`file\0${pathBytes.length}\0`);
    hash.update(pathBytes);
    hash.update(`\0${sourceBytes.length}\0`);
    hash.update(sourceBytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function containedBy(path, directory) {
  const rel = relative(resolve(directory), resolve(path));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..');
}

function localImportTarget(importer, specifier) {
  const requested = resolve(dirname(importer), specifier);
  const hasExtension = /\.[A-Za-z0-9]+$/.test(specifier);
  const candidates = hasExtension
    ? [requested]
    : [requested, `${requested}.ts`, `${requested}.tsx`, `${requested}.mts`, join(requested, 'index.ts')];
  const matches = candidates.filter((candidate) => existsSync(candidate));
  if (matches.length !== 1) fail(`Local import must resolve to exactly one file: ${specifier}`);
  const stat = lstatSync(matches[0]);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`Local import is not a regular file: ${specifier}`);
  return matches[0];
}

function pinnedExternalImport(specifier) {
  if (!specifier.startsWith('https://')) return false;
  let url;
  try { url = new URL(specifier); } catch { return false; }
  return !url.username && !url.password && !url.hash && !url.search
    && /@[0-9]+(?:\.[0-9]+){1,2}(?:\/|$)/.test(url.pathname);
}

function moduleSpecifiers(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length > 0) fail(`Cannot parse release import graph: ${path}`);
  if (source.referencedFiles.length || source.typeReferenceDirectives.length || source.libReferenceDirectives.length) {
    fail(`Unsupported triple-slash import mechanism: ${path}`);
  }
  const specifiers = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) fail(`Unsupported nonliteral module specifier: ${path}`);
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) fail(`Unsupported dynamic import: ${path}`);
      specifiers.push(node.arguments[0].text);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      fail(`Unsupported require import mechanism: ${path}`);
    } else if (ts.isImportTypeNode(node)) {
      const literal = node.argument;
      if (!ts.isLiteralTypeNode(literal) || !ts.isStringLiteral(literal.literal)) fail(`Unsupported import type: ${path}`);
      specifiers.push(literal.literal.text);
    } else if (ts.isImportEqualsDeclaration(node)) {
      fail(`Unsupported import alias: ${path}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specifiers;
}

export function assertImportClosure(repositoryRoot, manifest) {
  if (!manifest || !Array.isArray(manifest.functions)
    || !manifest.functionShared?.path || !manifest.verifiedReplayShared?.path) {
    fail('Cannot validate imports from a malformed backend inventory.');
  }
  for (const importMap of ['deno.json', 'deno.jsonc', 'import_map.json']) {
    if (existsSync(join(repositoryRoot, importMap))) fail(`Import maps are unsupported by the backend release manifest: ${importMap}`);
  }
  const roots = [manifest.functionShared.path, manifest.verifiedReplayShared.path, ...manifest.functions.map((entry) => entry.path)]
    .map((path) => resolve(repositoryRoot, path));
  for (const directory of roots.filter((path) => containedBy(path, join(repositoryRoot, 'supabase', 'functions')))) {
    const importMap = treeEntries(directory).find((entry) => /(?:^|\/)(?:deno\.jsonc?|import_map\.json)$/.test(entry.relative));
    if (importMap) fail(`Import maps are unsupported by the backend release manifest: ${importMap.relative}`);
  }
  const pending = manifest.functions.map((entry) => resolve(repositoryRoot, entry.path, 'index.ts'));
  const visited = new Set();
  while (pending.length > 0) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    if (!roots.some((allowed) => containedBy(path, allowed))) fail(`Release import escapes the hashed inventory: ${path}`);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) fail(`Release import is not a regular file: ${path}`);
    visited.add(path);
    for (const specifier of moduleSpecifiers(path)) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const target = localImportTarget(path, specifier);
        if (!roots.some((allowed) => containedBy(target, allowed))) fail(`Release import escapes the hashed inventory: ${specifier}`);
        pending.push(target);
      } else if (!pinnedExternalImport(specifier)) {
        fail(`Unsupported or unpinned external release import: ${specifier}`);
      }
    }
  }
  return { files: [...visited].sort() };
}

function digestRecords(records, keys) {
  const hash = createHash('sha256');
  for (const record of records) {
    for (const key of keys) hash.update(`${key}\0${String(record[key])}\0`);
  }
  return hash.digest('hex');
}

const BASIC_STRING_VALUE = String.raw`"(?:[^"\\\u0000-\u001f\u007f]|\\(?:["\\btnfr]|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}))*"`;
const STRING_ARRAY_VALUE = String.raw`\[\s*(?:${BASIC_STRING_VALUE}(?:\s*,\s*${BASIC_STRING_VALUE})*\s*,?)?\]`;
const CONFIG_ASSIGNMENT = new RegExp(
  String.raw`^\s*([a-z][a-z0-9_]*)\s*=\s*(${BASIC_STRING_VALUE}|${STRING_ARRAY_VALUE}|true|false|[+-]?(?:0|[1-9](?:_?[0-9])*))\s*(?:#.*)?$`,
  'u',
);

export function parseFunctionConfig(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MANIFEST_BYTES) fail('Invalid backend config source.');
  const functions = new Map();
  let current;
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    if (/^\s*\[/.test(line)) {
      const table = line.match(/^\s*\[([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\]\s*(?:#.*)?$/);
      if (!table) {
        fail('Unsupported backend config table syntax; only bare dotted table names are allowed.');
      }
      const segments = table[1].split('.');
      if (segments[0] !== 'functions') {
        current = undefined;
        continue;
      }
      if (segments.length !== 2 || !FUNCTION_NAME.test(segments[1])) {
        fail('Unsupported function config shape; only [functions.name] with verify_jwt is allowed.');
      }
      current = segments[1];
      if (functions.has(current)) fail(`Duplicate function config: ${current}`);
      functions.set(current, undefined);
      continue;
    }
    const key = line.match(/^\s*([a-z][a-z0-9_]*)\s*=/);
    if (!key) {
      fail('Unsupported function config shape; backend config permits only bare assignment keys.');
    }
    const assignment = line.match(CONFIG_ASSIGNMENT);
    if (current) {
      if (key[1] !== 'verify_jwt' || !assignment || !['true', 'false'].includes(assignment[2])) {
        fail(`Unsupported function config field for ${current}.`);
      }
      if (functions.get(current) !== undefined) fail(`Duplicate function verify_jwt setting: ${current}`);
      functions.set(current, assignment[2] === 'true');
      continue;
    }
    if (key[1] === 'functions') {
      fail('Unsupported function config shape; only [functions.name] with verify_jwt is allowed.');
    }
    if (!assignment) {
      fail('Unsupported backend config assignment value; only booleans, integers, double-quoted strings, and single-line string arrays are allowed.');
    }
  }
  for (const [name, verifyJwt] of functions) {
    if (verifyJwt === undefined) fail(`Function config is missing verify_jwt: ${name}`);
  }
  return functions;
}

function assertSortedUnique(values, label) {
  const sorted = [...values].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (new Set(values).size !== values.length || values.some((value, index) => value !== sorted[index])) {
    fail(`${label} must be sorted and unique.`);
  }
}

export function assertPackageReleaseScripts(packageJson, functionNames) {
  const expected = {
    'deploy:backend:migrations': 'supabase db push --linked --yes',
    'deploy:backend:config': 'supabase config push --yes',
    'deploy:backend:functions': `supabase functions deploy ${functionNames.join(' ')} --use-api --yes`,
    'deploy:backend': 'npm run backend:release:check && npm run deploy:backend:migrations && npm run deploy:backend:config && npm run deploy:backend:functions',
  };
  for (const [name, command] of Object.entries(expected)) {
    if (packageJson?.scripts?.[name] !== command) fail(`Package release script does not match the complete release policy: ${name}.`);
  }
  return true;
}

function readJson(path, maximumBytes, label) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > maximumBytes) fail(`Invalid ${label} file.`);
  try {
    const raw = readFileSync(path);
    return { raw, value: JSON.parse(raw.toString('utf8')) };
  } catch {
    fail(`Invalid ${label} JSON.`);
  }
}

export function loadAndValidateManifest(repositoryRoot = root) {
  const manifestFile = join(repositoryRoot, MANIFEST_PATH);
  const { raw, value: manifest } = readJson(manifestFile, MAX_MANIFEST_BYTES, 'backend release manifest');
  exactKeys(manifest, [
    'compatibility', 'config', 'functionShared', 'functions', 'migrations',
    'schemaVersion', 'supabaseCliVersion', 'verifiedReplayShared',
  ], 'backend release manifest');
  if (manifest.schemaVersion !== 1) fail('Unsupported backend release manifest schema.');
  if (!/^2\.[0-9]+\.[0-9]+$/.test(manifest.supabaseCliVersion)) fail('Invalid Supabase CLI version.');

  exactKeys(manifest.config, ['path', 'sha256'], 'config entry');
  if (manifest.config.path !== 'supabase/config.toml') fail('Invalid backend config path.');
  assertSha256(manifest.config.sha256, 'config');
  if (digestFile(join(repositoryRoot, manifest.config.path)) !== manifest.config.sha256) fail('Backend config digest does not match.');

  for (const [entry, label, expectedPath] of [
    [manifest.functionShared, 'function shared tree', 'supabase/functions/_shared'],
    [manifest.verifiedReplayShared, 'verified replay shared tree', 'shared/src'],
  ]) {
    exactKeys(entry, ['path', 'sha256'], label);
    if (entry.path !== expectedPath) fail(`Invalid ${label} path.`);
    assertSha256(entry.sha256, label);
    if (digestTree(join(repositoryRoot, entry.path)) !== entry.sha256) fail(`${label} digest does not match.`);
  }

  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0) fail('Migration inventory is empty.');
  const migrationPaths = manifest.migrations.map((entry) => entry?.path);
  assertSortedUnique(migrationPaths, 'Migration inventory');
  const diskMigrations = readdirSync(join(repositoryRoot, 'supabase', 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.sql'))
    .map((entry) => {
      if (!entry.isFile()) fail(`Migration is not a regular file: ${entry.name}`);
      return `supabase/migrations/${entry.name}`;
    })
    .sort();
  if (JSON.stringify(migrationPaths) !== JSON.stringify(diskMigrations)) fail('Migration inventory has missing or extra entries.');
  let previousVersion = 0;
  for (const entry of manifest.migrations) {
    exactKeys(entry, ['path', 'sha256'], 'migration entry');
    const match = entry.path.match(MIGRATION_PATH);
    if (!match || Number(match[1]) <= previousVersion) fail(`Invalid ordered migration path: ${entry.path}`);
    previousVersion = Number(match[1]);
    assertSha256(entry.sha256, entry.path);
    if (digestFile(join(repositoryRoot, entry.path)) !== entry.sha256) fail(`Migration digest does not match: ${entry.path}`);
  }

  if (!Array.isArray(manifest.functions) || manifest.functions.length === 0) fail('Function inventory is empty.');
  const functionNames = manifest.functions.map((entry) => entry?.name);
  assertSortedUnique(functionNames, 'Function inventory');
  const functionEntries = readdirSync(join(repositoryRoot, 'supabase', 'functions'), { withFileTypes: true });
  const diskFunctions = [];
  for (const entry of functionEntries) {
    if (entry.name === '_shared') {
      if (!entry.isDirectory()) fail('Function shared source is not a directory.');
    } else if (entry.name === '.env.example') {
      if (!entry.isFile()) fail('Function environment example is not a regular file.');
    } else {
      if (!entry.isDirectory() || !FUNCTION_NAME.test(entry.name)) fail(`Invalid function directory: ${entry.name}`);
      diskFunctions.push(entry.name);
    }
  }
  diskFunctions.sort();
  if (JSON.stringify(functionNames) !== JSON.stringify(diskFunctions)) fail('Function inventory has missing or extra entries.');
  const configFunctions = parseFunctionConfig(readFileSync(join(repositoryRoot, manifest.config.path), 'utf8'));
  if (JSON.stringify([...configFunctions.keys()].sort()) !== JSON.stringify(functionNames)) fail('Function config inventory does not match deployable functions.');
  for (const entry of manifest.functions) {
    exactKeys(entry, ['name', 'path', 'sha256', 'verifyJwt'], 'function entry');
    if (!FUNCTION_NAME.test(entry.name) || entry.path !== `supabase/functions/${entry.name}` || typeof entry.verifyJwt !== 'boolean') {
      fail(`Invalid function entry: ${entry.name}`);
    }
    assertSha256(entry.sha256, entry.name);
    if (configFunctions.get(entry.name) !== entry.verifyJwt) fail(`Function JWT policy does not match config: ${entry.name}`);
    if (digestTree(join(repositoryRoot, entry.path)) !== entry.sha256) fail(`Function digest does not match: ${entry.name}`);
  }
  assertImportClosure(repositoryRoot, manifest);

  exactKeys(manifest.compatibility, [
    'casualCompletionVersions', 'commandProtocolVersions', 'historicalVerifiedTuples',
    'recoveryClass', 'verifiedTuples',
  ], 'compatibility policy');
  if (JSON.stringify(manifest.compatibility.commandProtocolVersions) !== '[1,2]'
    || JSON.stringify(manifest.compatibility.casualCompletionVersions) !== '["legacy_unvalidated",1]'
    || JSON.stringify(manifest.compatibility.historicalVerifiedTuples) !== '[[1,1,3]]'
    || JSON.stringify(manifest.compatibility.verifiedTuples) !== '[[2,2,4],[3,3,4]]'
    || manifest.compatibility.recoveryClass !== 'fix-forward-after-versioned-state') {
    fail('Backend compatibility policy does not match the retained contracts.');
  }

  const packageJson = readJson(join(repositoryRoot, 'package.json'), MAX_MANIFEST_BYTES, 'package').value;
  const packageLock = readJson(join(repositoryRoot, 'package-lock.json'), 5 * MAX_MANIFEST_BYTES, 'package lock').value;
  if (packageJson.devDependencies?.supabase !== manifest.supabaseCliVersion
    || packageLock.packages?.['']?.devDependencies?.supabase !== manifest.supabaseCliVersion
    || packageLock.packages?.['node_modules/supabase']?.version !== manifest.supabaseCliVersion) {
    fail('Supabase CLI package and lock pins do not match the backend manifest.');
  }
  assertPackageReleaseScripts(packageJson, functionNames);

  return {
    manifest,
    manifestSha256: digestBytes(canonicalSourceBytes(raw, manifestFile)),
    migrationSetSha256: digestRecords(manifest.migrations, ['path', 'sha256']),
    functionSetSha256: digestRecords(manifest.functions, ['name', 'path', 'verifyJwt', 'sha256']),
  };
}

export function assertCliVersion(actual, expected) {
  if (String(actual).trim() !== expected) fail(`Supabase CLI version mismatch: expected ${expected}, got ${String(actual).trim() || 'missing'}.`);
}

export function assertDispatchContext(context) {
  if (context.eventName !== 'workflow_dispatch') fail('Backend deployment must be manually dispatched.');
  if (!REPOSITORY.test(context.repository ?? '')) fail('Invalid GitHub repository.');
  if (context.ref !== 'refs/heads/main') fail('Backend deployment ref must be main.');
  assertSha(context.sha, 'workflow');
  assertSha(context.candidateSha, 'candidate');
  if (context.sha !== context.candidateSha) fail('Backend candidate must equal the dispatched workflow SHA.');
  const expectedWorkflowRef = `${context.repository}/.github/workflows/deploy-backend.yml@refs/heads/main`;
  if (context.workflowRef !== expectedWorkflowRef) fail('Backend deployment workflow ref must be main.');
  assertSha256(context.expectedManifestSha256, 'expected manifest');
  if (context.expectedManifestSha256 !== context.actualManifestSha256) fail('Backend candidate manifest digest does not match.');
  return { sourceSha: context.sha, manifestSha256: context.actualManifestSha256 };
}

function isExactCiRun(run, sha) {
  return run && run.path === '.github/workflows/ci.yml' && run.event === 'push'
    && run.head_branch === 'main' && run.head_sha === sha;
}

export function selectRequiredCiRun(runs, sourceSha) {
  assertSha(sourceSha, 'required CI source');
  const newest = runs.filter((run) => isExactCiRun(run, sourceSha)).reduce((selected, run) => {
    if (!selected) return run;
    return BigInt(String(run.id)) > BigInt(String(selected.id)) ? run : selected;
  }, undefined);
  if (newest?.status === 'completed' && newest.conclusion === 'success') {
    assertRunId(newest.id, 'required CI run ID');
    assertRunId(newest.run_attempt, 'required CI run attempt');
    return newest;
  }
  if (newest?.status === 'completed') fail(`Required exact-SHA CI run ${newest.id} concluded ${newest.conclusion}.`);
  fail('Required exact-SHA CI run has not succeeded.');
}

export function revalidateRequiredCiRun(runs, expected, currentRun) {
  assertSha(expected.sourceSha, 'required CI source');
  assertRunId(expected.runId, 'required CI run ID');
  assertRunId(expected.runAttempt, 'required CI run attempt');
  if (!currentRun || String(currentRun.id) !== String(expected.runId) || !isExactCiRun(currentRun, expected.sourceSha)) {
    fail('Bound required CI run identity changed.');
  }
  if (String(currentRun.run_attempt) !== String(expected.runAttempt)) fail('Bound required CI run attempt changed.');
  if (currentRun.status !== 'completed' || currentRun.conclusion !== 'success') fail('Bound required CI run is no longer successful.');
  const newest = selectRequiredCiRun(runs, expected.sourceSha);
  if (String(newest.id) !== String(expected.runId)) fail('Bound required CI run was superseded.');
  if (String(newest.run_attempt) !== String(expected.runAttempt)) fail('Bound required CI run attempt changed.');
  return newest;
}

export function assertEnvironmentPolicy(environment) {
  if (environment?.name !== 'production-backend') fail('The production-backend environment is not configured.');
  const rule = environment.protection_rules?.find((candidate) => candidate?.type === 'required_reviewers');
  const reviewers = rule?.reviewers?.map((entry) => entry?.reviewer?.login).filter((login) => typeof login === 'string' && login.length > 0) ?? [];
  if (reviewers.length === 0) fail('The production-backend environment must have a required reviewer.');
  if (typeof rule.prevent_self_review !== 'boolean') fail('The environment self-review policy must be explicit.');
  if (environment.can_admins_bypass !== false) fail('The production-backend environment must disallow administrator bypass.');
  if (environment.deployment_branch_policy?.protected_branches !== true
    || environment.deployment_branch_policy?.custom_branch_policies !== false) {
    fail('The production-backend environment must allow protected branches only.');
  }
  return { reviewers, preventSelfReview: rule.prevent_self_review, adminsCanBypass: environment.can_admins_bypass };
}

function parseWorkflowJobs(raw) {
  const lines = raw.replaceAll('\r\n', '\n').split('\n');
  const jobsLine = lines.findIndex((line) => line === 'jobs:');
  if (jobsLine < 0) fail('Backend workflow is missing its jobs graph.');
  const starts = [];
  for (let index = jobsLine + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^  ([a-z][a-z0-9_]*):\s*$/);
    if (match) starts.push({ id: match[1], index });
  }
  const jobs = new Map();
  for (let position = 0; position < starts.length; position += 1) {
    const start = starts[position];
    const end = starts[position + 1]?.index ?? lines.length;
    const jobLines = lines.slice(start.index + 1, end);
    const topFields = jobLines.flatMap((line) => line.match(/^    ([a-z][a-z0-9_-]*):/)?.slice(1) ?? []);
    const allowed = start.id === 'gate'
      ? ['name', 'runs-on', 'timeout-minutes', 'permissions', 'outputs', 'steps']
      : ['name', 'needs', 'runs-on', 'timeout-minutes', 'permissions', 'environment', 'steps'];
    if (topFields.some((key) => !allowed.includes(key)) || new Set(topFields).size !== topFields.length) {
      fail(`Backend workflow job has unsupported or duplicate graph fields: ${start.id}.`);
    }
    const scalar = (key) => jobLines.find((line) => line.startsWith(`    ${key}:`))?.slice(5 + key.length).trim();
    const stepsLine = jobLines.findIndex((line) => line === '    steps:');
    if (stepsLine < 0) fail(`Backend workflow job has no steps: ${start.id}.`);
    const stepStarts = [];
    for (let index = stepsLine + 1; index < jobLines.length; index += 1) {
      if (/^      - (?:name|uses|run):/.test(jobLines[index])) stepStarts.push(index);
    }
    const steps = stepStarts.map((stepStart, stepPosition) => {
      const stepEnd = stepStarts[stepPosition + 1] ?? jobLines.length;
      const stepLines = jobLines.slice(stepStart, stepEnd);
      const first = stepLines[0].slice(8);
      const field = (key) => {
        if (first.startsWith(`${key}:`)) return first.slice(key.length + 1).trim();
        return stepLines.find((line) => line.startsWith(`        ${key}:`))?.slice(9 + key.length).trim();
      };
      return {
        id: field('id'), name: field('name'), shell: field('shell'),
        condition: stepLines.some((line) => /^        if:/.test(line)), raw: stepLines.join('\n'),
      };
    });
    const stepIds = steps.map((step) => step.id).filter(Boolean);
    if (new Set(stepIds).size !== stepIds.length) fail(`Backend workflow has duplicate step IDs: ${start.id}.`);
    jobs.set(start.id, { needs: scalar('needs'), raw: jobLines.join('\n'), steps });
  }
  if (JSON.stringify([...jobs.keys()]) !== '["gate","deploy"]') fail('Backend workflow must contain only the gate and deploy jobs in order.');
  return jobs;
}

export function assertWorkflowContract(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MANIFEST_BYTES) fail('Invalid backend workflow source.');
  if (!/\bon:\s*\r?\n\s+workflow_dispatch:/m.test(raw)) fail('Backend workflow must be manual-only.');
  if (/\n\s+(?:push|pull_request):/.test(raw)) fail('Backend workflow cannot run from an automatic source event.');
  if (/\bcontinue-on-error\s*:/i.test(raw)) fail('Backend workflow cannot continue after a failed gate or preflight.');
  const deployJob = raw.indexOf('\n  deploy:');
  if (/^    env:/m.test(raw)) fail('Backend workflow cannot expose production credentials at job scope.');
  const firstSecret = raw.indexOf('${{ secrets.');
  if (firstSecret < deployJob) fail('Production credentials are referenced before the protected environment job.');
  const jobs = parseWorkflowJobs(raw);
  const gate = jobs.get('gate');
  const deploy = jobs.get('deploy');
  if (gate.needs !== undefined || deploy.needs !== 'gate') fail('Backend deploy job must depend only on the gate job.');
  if (!deploy.raw.includes('    environment:\n      name: production-backend')) fail('Backend workflow is missing the protected environment contract.');
  const gateCheckout = raw.indexOf('ref: ${{ github.sha }}');
  const firstHeadCheck = raw.indexOf('$(git rev-parse HEAD)');
  const firstInstall = raw.indexOf('npm ci --ignore-scripts');
  if (gateCheckout < 0 || firstHeadCheck < gateCheckout || firstInstall < firstHeadCheck) {
    fail('Backend workflow must verify the immutable dispatch checkout before repository-owned code runs.');
  }
  const deployCheckout = raw.indexOf('ref: ${{ needs.gate.outputs.source_sha }}', deployJob);
  const deployHeadCheck = raw.indexOf('$(git rev-parse HEAD)', deployJob);
  const deployInstall = raw.indexOf('npm ci --ignore-scripts', deployJob);
  if (deployCheckout < deployJob || deployHeadCheck < deployCheckout || deployInstall < deployHeadCheck) {
    fail('Backend workflow must verify the approved checkout before repository-owned code runs.');
  }
  if (!gate.steps.some((step) => step.raw.includes('node scripts/ci/backendRelease.mjs gate'))
    || !deploy.steps.some((step) => step.raw.includes('node scripts/ci/backendRelease.mjs revalidate'))) {
    fail('Backend workflow is missing release gate revalidation.');
  }
  if (!raw.includes('name: production-backend') || !raw.includes('configured_reviewers') || !raw.includes('admins_can_bypass')) {
    fail('Backend workflow is missing the protected environment contract.');
  }
  const revalidateIndex = deploy.steps.findIndex((step) => step.id === 'revalidate'
    && step.raw.includes('node scripts/ci/backendRelease.mjs revalidate'));
  const firstCredentialIndex = deploy.steps.findIndex((step) => step.raw.includes('${{ secrets.'));
  if (revalidateIndex < 0 || firstCredentialIndex < 0 || firstCredentialIndex <= revalidateIndex) {
    fail('Production credential steps must run after approval-time revalidation.');
  }
  if (raw.includes('version: latest') || raw.includes('deploy_migrations:') || raw.includes('deploy_functions:')) {
    fail('Backend workflow contains an unpinned or partial deployment path.');
  }
  for (const phase of ['deploy:backend:migrations', 'deploy:backend:config', 'deploy:backend:functions']) {
    if (!raw.includes(`npm run ${phase}`)) fail(`Backend workflow is missing ${phase}.`);
  }
  const orderedIds = ['revalidate', 'configuration', 'link', 'management_before', 'migrations_before',
    'migration_dry_run', 'functions_before', 'migrations', 'config', 'functions'];
  let previous = -1;
  for (const id of orderedIds) {
    const index = deploy.steps.findIndex((step) => step.id === id);
    if (index <= previous || deploy.steps[index].condition) fail(`Backend workflow has an unsafe execution graph at step: ${id}.`);
    previous = index;
  }
  for (const [id, command] of [
    ['migrations', 'npm run deploy:backend:migrations'],
    ['config', 'npm run deploy:backend:config'],
    ['functions', 'npm run deploy:backend:functions'],
  ]) {
    if (!deploy.steps.find((step) => step.id === id)?.raw.includes(command)) fail(`Backend mutation step is invalid: ${id}.`);
  }
  for (const id of ['migrations_before', 'migration_dry_run', 'functions_before']) {
    const step = deploy.steps.find((candidate) => candidate.id === id);
    if (step.shell !== 'bash' || step.raw.includes('| tee') || !step.raw.includes('set -euo pipefail')) {
      fail(`Backend read-only preflight is not fail-closed: ${id}.`);
    }
  }
  if (!raw.includes('backend-release-receipt-${{ github.run_id }}-${{ github.run_attempt }}')) {
    fail('Backend workflow does not retain an attempt-bound receipt.');
  }
  const normalizedWorkflow = raw.replaceAll('\r\n', '\n');
  if (digestBytes(normalizedWorkflow) !== WORKFLOW_CONTRACT_SHA256) {
    fail('Backend workflow differs from the closed reviewed execution contract.');
  }
  return true;
}

async function githubJson(path, token) {
  if (!token) fail('Missing GitHub token.');
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': API_VERSION },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) fail(`GitHub API request failed with status ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_API_BYTES) fail('GitHub API response exceeded the safety limit.');
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail('GitHub API returned invalid JSON.'); }
}

async function currentMainSha(repository, token) {
  const body = await githubJson(`/repos/${repository}/git/ref/heads/main`, token);
  assertSha(body?.object?.sha, 'current main');
  return body.object.sha;
}

async function ciRuns(repository, sourceSha, token) {
  const query = new URLSearchParams({ event: 'push', head_sha: sourceSha, per_page: '20' });
  const body = await githubJson(`/repos/${repository}/actions/workflows/ci.yml/runs?${query}`, token);
  return Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
}

function writeOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) fail('Missing GITHUB_OUTPUT.');
  for (const [key, value] of Object.entries(values)) {
    if (String(value).includes('\n')) fail('Invalid multiline workflow output.');
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, 'utf8');
  }
}

function installedCliVersion() {
  const executable = join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
  const stat = statSync(executable);
  if (!stat.isFile()) fail('The lock-pinned Supabase CLI is not installed.');
  return execFileSync(process.execPath, [executable, '--version'], { encoding: 'utf8' }).trim();
}

async function gate(revalidate = false) {
  assertWorkflowContract(readFileSync(join(root, '.github', 'workflows', 'deploy-backend.yml'), 'utf8'));
  const release = loadAndValidateManifest(root);
  assertCliVersion(installedCliVersion(), release.manifest.supabaseCliVersion);
  const context = assertDispatchContext({
    eventName: process.env.GITHUB_EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
    workflowRef: process.env.GITHUB_WORKFLOW_REF,
    candidateSha: process.env.CANDIDATE_SHA,
    expectedManifestSha256: process.env.CANDIDATE_MANIFEST_SHA256,
    actualManifestSha256: release.manifestSha256,
  });
  const checkoutHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (checkoutHead !== context.sourceSha) fail('Checked-out backend source does not match the dispatched candidate.');
  const token = process.env.GITHUB_TOKEN;
  if (await currentMainSha(process.env.GITHUB_REPOSITORY, token) !== context.sourceSha) fail('Backend candidate is no longer current main.');
  const [runs, environment] = await Promise.all([
    ciRuns(process.env.GITHUB_REPOSITORY, context.sourceSha, token),
    githubJson(`/repos/${process.env.GITHUB_REPOSITORY}/environments/production-backend`, token),
  ]);
  const policy = assertEnvironmentPolicy(environment);
  const ci = revalidate
    ? revalidateRequiredCiRun(runs, {
      sourceSha: context.sourceSha,
      runId: process.env.REQUIRED_CI_RUN_ID,
      runAttempt: process.env.REQUIRED_CI_RUN_ATTEMPT,
    }, await githubJson(`/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.REQUIRED_CI_RUN_ID}`, token))
    : selectRequiredCiRun(runs, context.sourceSha);
  writeOutputs({
    source_sha: context.sourceSha,
    manifest_sha256: context.manifestSha256,
    migration_set_sha256: release.migrationSetSha256,
    function_set_sha256: release.functionSetSha256,
    required_ci_run_id: ci.id,
    required_ci_run_attempt: ci.run_attempt,
    configured_reviewers: policy.reviewers.join(','),
    prevent_self_review: policy.preventSelfReview,
    admins_can_bypass: policy.adminsCanBypass,
    supabase_cli_version: release.manifest.supabaseCliVersion,
  });
}

async function managementSnapshot() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!token || !/^[a-z]{20}$/.test(projectRef ?? '')) fail('Missing or invalid production project credentials.');
  const request = async (path) => {
    const response = await fetch(`https://api.supabase.com/v1${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) fail(`Supabase Management API request failed with status ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_API_BYTES) fail('Supabase Management API response exceeded the safety limit.');
    JSON.parse(bytes.toString('utf8'));
    return digestBytes(bytes);
  };
  const [projectSha256, authConfigSha256, postgrestConfigSha256] = await Promise.all([
    request(`/projects/${projectRef}`),
    request(`/projects/${projectRef}/config/auth`),
    request(`/projects/${projectRef}/postgrest`),
  ]);
  process.stdout.write(`${JSON.stringify({ projectRef, projectSha256, authConfigSha256, postgrestConfigSha256 })}\n`);
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(?:secret|token|password|authorization|api_?key)/i.test(key)) output[key] = '[redacted]';
    else output[key] = sanitize(item);
  }
  return output;
}

function observation(path) {
  if (!path || !existsSync(path)) return null;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_API_BYTES) fail('Invalid release observation file.');
  const raw = readFileSync(path);
  try {
    return { kind: 'json', value: sanitize(JSON.parse(raw.toString('utf8'))) };
  } catch {
    return { kind: 'text-digest', bytes: raw.length, sha256: digestBytes(raw) };
  }
}

export function buildReceipt(environment = process.env) {
  const required = [
    'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_ACTOR',
    'CANDIDATE_MANIFEST_SHA256', 'REQUIRED_CI_RUN_ID', 'REQUIRED_CI_RUN_ATTEMPT',
    'MIGRATION_SET_SHA256', 'FUNCTION_SET_SHA256', 'SUPABASE_CLI_VERSION',
  ];
  for (const name of required) if (!environment[name]) fail(`Missing receipt field: ${name}.`);
  assertSha(environment.GITHUB_SHA, 'receipt source');
  for (const name of ['CANDIDATE_MANIFEST_SHA256', 'MIGRATION_SET_SHA256', 'FUNCTION_SET_SHA256']) {
    assertSha256(environment[name], name);
  }
  for (const name of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'REQUIRED_CI_RUN_ID', 'REQUIRED_CI_RUN_ATTEMPT']) {
    assertRunId(environment[name], name);
  }
  return {
    schemaVersion: 1,
    sourceSha: environment.GITHUB_SHA,
    manifestSha256: environment.CANDIDATE_MANIFEST_SHA256,
    run: { id: environment.GITHUB_RUN_ID, attempt: environment.GITHUB_RUN_ATTEMPT, actor: environment.GITHUB_ACTOR },
    requiredCi: { id: environment.REQUIRED_CI_RUN_ID, attempt: environment.REQUIRED_CI_RUN_ATTEMPT },
    supabaseCliVersion: environment.SUPABASE_CLI_VERSION,
    migrationSetSha256: environment.MIGRATION_SET_SHA256,
    functionSetSha256: environment.FUNCTION_SET_SHA256,
    environmentPolicy: {
      name: 'production-backend',
      configuredReviewers: String(environment.CONFIGURED_REVIEWERS ?? '').split(',').filter(Boolean),
      preventSelfReview: environment.PREVENT_SELF_REVIEW === 'true',
      adminsCanBypass: environment.ADMINS_CAN_BYPASS === 'true',
    },
    compatibility: {
      commandProtocolVersions: [1, 2],
      casualCompletionVersions: ['legacy_unvalidated', 1],
      historicalVerifiedTuples: [[1, 1, 3]],
      verifiedTuples: [[2, 2, 4], [3, 3, 4]],
      recoveryClass: 'fix-forward-after-versioned-state',
    },
    phaseOutcomes: {
      gate: 'success',
      environmentApproval: 'approved',
      revalidate: environment.REVALIDATE_OUTCOME ?? 'unknown',
      configuration: environment.CONFIGURATION_OUTCOME ?? 'unknown',
      link: environment.LINK_OUTCOME ?? 'unknown',
      managementBefore: environment.MANAGEMENT_BEFORE_OUTCOME ?? 'unknown',
      migrationsBefore: environment.MIGRATIONS_BEFORE_OUTCOME ?? 'unknown',
      migrationDryRun: environment.MIGRATION_DRY_RUN_OUTCOME ?? 'unknown',
      functionsBefore: environment.FUNCTIONS_BEFORE_OUTCOME ?? 'unknown',
      migrations: environment.MIGRATIONS_OUTCOME ?? 'unknown',
      config: environment.CONFIG_OUTCOME ?? 'unknown',
      functions: environment.FUNCTIONS_OUTCOME ?? 'unknown',
      managementAfter: environment.MANAGEMENT_AFTER_OUTCOME ?? 'unknown',
      migrationsAfter: environment.MIGRATIONS_AFTER_OUTCOME ?? 'unknown',
      functionsAfter: environment.FUNCTIONS_AFTER_OUTCOME ?? 'unknown',
    },
    observations: {
      managementBefore: observation(environment.MANAGEMENT_BEFORE_PATH),
      migrationsBefore: observation(environment.MIGRATIONS_BEFORE_PATH),
      migrationDryRun: observation(environment.MIGRATION_DRY_RUN_PATH),
      functionsBefore: observation(environment.FUNCTIONS_BEFORE_PATH),
      managementAfter: observation(environment.MANAGEMENT_AFTER_PATH),
      migrationsAfter: observation(environment.MIGRATIONS_AFTER_PATH),
      functionsAfter: observation(environment.FUNCTIONS_AFTER_PATH),
    },
  };
}

function validateManifestCommand() {
  assertWorkflowContract(readFileSync(join(root, '.github', 'workflows', 'deploy-backend.yml'), 'utf8'));
  const release = loadAndValidateManifest(root);
  process.stdout.write(`${JSON.stringify({
    manifestSha256: release.manifestSha256,
    migrationSetSha256: release.migrationSetSha256,
    functionSetSha256: release.functionSetSha256,
    supabaseCliVersion: release.manifest.supabaseCliVersion,
  })}\n`);
}

async function main() {
  const [command, ...extra] = process.argv.slice(2);
  if (extra.length > 0) fail('Unexpected backend release arguments.');
  if (command === 'validate-manifest') validateManifestCommand();
  else if (command === 'gate') await gate(false);
  else if (command === 'revalidate') await gate(true);
  else if (command === 'management-snapshot') await managementSnapshot();
  else if (command === 'receipt') process.stdout.write(`${JSON.stringify(buildReceipt(), null, 2)}\n`);
  else fail('Usage: backendRelease <validate-manifest|gate|revalidate|management-snapshot|receipt>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
