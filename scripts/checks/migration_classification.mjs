// Contract checks for migration history and legacy-table data classification (#125).
// Run: node scripts/checks/migration_classification.mjs [--check all|history|classification] [--base <commit>] [--head <commit>]

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationDirectory = 'supabase/migrations';
const classificationMigration = '011_data_classification_comments.sql';
const defaultBase = 'origin/main';
const defaultHead = 'HEAD';

const requiredStatements = [
  "COMMENT ON TABLE rooms IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.id IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.code IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.seed IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.status IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.options IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.players IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.active_player_index IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.turn IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.winner IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.rematch_room_id IS 'classification: PUBLIC",
  "COMMENT ON COLUMN rooms.created_at IS 'classification: INTERNAL",
  "COMMENT ON TABLE room_actions IS 'classification: PUBLIC",
  "COMMENT ON COLUMN room_actions.id IS 'classification: PUBLIC",
  "COMMENT ON COLUMN room_actions.room_id IS 'classification: PUBLIC",
  "COMMENT ON COLUMN room_actions.seq IS 'classification: PUBLIC",
  "COMMENT ON COLUMN room_actions.player_id IS 'classification: PUBLIC",
  "COMMENT ON COLUMN room_actions.action IS 'classification: PUBLIC",
  "COMMENT ON COLUMN room_actions.created_at IS 'classification: INTERNAL",
  "COMMENT ON TABLE match_scores IS 'classification: PUBLIC",
  "COMMENT ON COLUMN match_scores.id IS 'classification: PUBLIC",
  "COMMENT ON COLUMN match_scores.room_id IS 'classification: PUBLIC",
  "COMMENT ON COLUMN match_scores.winner IS 'classification: PUBLIC",
  "COMMENT ON COLUMN match_scores.rounds IS 'classification: PUBLIC",
  "COMMENT ON COLUMN match_scores.scoreboard IS 'classification: PUBLIC",
  "COMMENT ON COLUMN match_scores.created_at IS 'classification: INTERNAL",
];

const expectedTargets = new Set(requiredStatements.map((statement) => {
  const match = statement.match(/^COMMENT ON (?:TABLE|COLUMN) ([a-z_]+(?:\.[a-z_]+)?)/);
  return match?.[1];
}));

const allowedCommentStatement = /^COMMENT\s+ON\s+(?:TABLE|COLUMN)\s+[a-z_]+(?:\.[a-z_]+)?\s+IS\s+'(?:[^']|'')*'$/i;

function fail(message) {
  throw new Error(`Migration classification check failed: ${message}`);
}

function git(repositoryRoot, args) {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.error) fail(`Git ${args.join(' ')} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    fail(`Git ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout;
}

function isZeroObject(reference) {
  return /^0{40,64}$/.test(reference);
}

function resolveCommit(repositoryRoot, reference, label) {
  if (!reference || isZeroObject(reference)) fail(`${label} commit is required and cannot be the all-zero GitHub sentinel`);
  const commit = git(repositoryRoot, ['rev-parse', '--verify', `${reference}^{commit}`]).trim();
  if (!commit) fail(`${label} commit did not resolve`);
  git(repositoryRoot, ['cat-file', '-e', `${commit}^{commit}`]);
  return commit;
}

function isMigrationSqlPath(path) {
  return new RegExp(`^${migrationDirectory}/[^/]+\\.sql$`).test(path);
}

function lines(output) {
  return output.split(/\r?\n/).filter(Boolean);
}

function migrationInventory(repositoryRoot, base) {
  const inventory = lines(git(repositoryRoot, ['ls-tree', '-r', '--name-only', base, '--', migrationDirectory]))
    .filter(isMigrationSqlPath);
  if (inventory.length === 0) fail(`base ${base} contains no SQL migrations to protect`);
  return new Set(inventory);
}

function parseNameStatus(output, label) {
  return lines(output).map((line) => {
    const fields = line.split('\t');
    if (fields.length < 2 || !fields[0]) fail(`${label} returned an unparseable name-status record: ${line}`);
    return { status: fields[0], paths: fields.slice(1) };
  });
}

function protectedChanges(records, protectedPaths) {
  return records.flatMap(({ status, paths }) => paths
    .filter((path) => protectedPaths.has(path))
    .map((path) => `${status}:${path}`));
}

function comparePaths(repositoryRoot, args, label, protectedPaths) {
  const records = parseNameStatus(git(repositoryRoot, args), label);
  return protectedChanges(records, protectedPaths);
}

export function checkMigrationHistory(repositoryRoot, { base = defaultBase, head = defaultHead } = {}) {
  const baseCommit = resolveCommit(repositoryRoot, base, 'base');
  const headCommit = resolveCommit(repositoryRoot, head, 'head');
  const protectedPaths = migrationInventory(repositoryRoot, baseCommit);
  const committedChanges = comparePaths(
    repositoryRoot,
    ['diff', '--name-status', '--find-renames', baseCommit, headCommit, '--', migrationDirectory],
    'base/head migration diff',
    protectedPaths,
  );
  const unstagedChanges = comparePaths(
    repositoryRoot,
    ['diff', '--name-status', '--find-renames', 'HEAD', '--', migrationDirectory],
    'worktree migration diff',
    protectedPaths,
  );
  const stagedChanges = comparePaths(
    repositoryRoot,
    ['diff', '--cached', '--name-status', '--find-renames', 'HEAD', '--', migrationDirectory],
    'index migration diff',
    protectedPaths,
  );
  const changed = [...committedChanges, ...unstagedChanges, ...stagedChanges];
  if (changed.length > 0) fail(`base-tree applied migration inventory was changed: ${changed.join(', ')}`);
  return { base: baseCommit, head: headCommit, protectedCount: protectedPaths.size };
}

function sqlStatements(text) {
  const withoutComments = text.replace(/^\s*--.*$/gm, '');
  const statements = [];
  let current = '';
  let inString = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    const next = withoutComments[index + 1];
    if (character === "'") {
      current += character;
      if (inString && next === "'") {
        current += next;
        index += 1;
      } else {
        inString = !inString;
      }
    } else if (character === ';' && !inString) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export function hasOnlyAllowedCommentStatements(text) {
  return sqlStatements(text).every((statement) => allowedCommentStatement.test(statement));
}

export function validateClassificationSql(sql) {
  if (!/^-- Lock profile:/im.test(sql)) fail('migration header must declare the expected lock profile');
  const missing = requiredStatements.filter((statement) => !sql.includes(statement));
  if (missing.length > 0) fail(`${missing.length} required classification comment(s) are missing: ${missing.join(', ')}`);
  if (!hasOnlyAllowedCommentStatements(sql)) fail('migration contains a statement beyond the exact COMMENT ON TABLE/COLUMN allowlist');

  const firstStatementEnd = sql.indexOf('COMMENT ON COLUMN rooms.id');
  const mutationProbes = [
    `${sql.slice(0, firstStatementEnd)} ALTER TABLE rooms ADD COLUMN injected text;${sql.slice(firstStatementEnd)}`,
    `${sql}\nDROP TABLE rooms;`,
    `${sql}\nDO $$\nBEGIN\n  EXECUTE 'DROP TABLE rooms';\nEND\n$$;`,
  ];
  if (mutationProbes.some(hasOnlyAllowedCommentStatements)) fail('SQL allowlist mutation probe was not rejected');

  const actualTargets = [...sql.matchAll(/^COMMENT\s+ON\s+(?:TABLE|COLUMN)\s+([a-z_]+(?:\.[a-z_]+)?)\s+IS\s+/gim)].map((match) => match[1]);
  const unexpectedTargets = actualTargets.filter((target) => !expectedTargets.has(target));
  const duplicateTargets = actualTargets.filter((target, index) => actualTargets.indexOf(target) !== index);
  if (actualTargets.length !== expectedTargets.size || unexpectedTargets.length > 0 || duplicateTargets.length > 0) {
    fail(`migration must contain exactly one comment for each approved legacy target; expected ${expectedTargets.size}, found ${actualTargets.length}`);
  }
  if (/classification:\s*SECRET/i.test(sql)) fail('legacy public tables must not classify any field as SECRET');
  return { requiredCommentCount: requiredStatements.length };
}

export async function checkClassificationMigration(repositoryRoot) {
  const migrationPath = join(repositoryRoot, migrationDirectory, classificationMigration);
  let sql;
  try {
    sql = await readFile(migrationPath, 'utf8');
  } catch (error) {
    fail(`required migration is missing: ${migrationPath}; ${error instanceof Error ? error.message : error}`);
  }
  return validateClassificationSql(sql);
}

function parseArguments(args) {
  const options = { check: 'all', base: defaultBase, head: defaultHead };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check' || argument === '--base' || argument === '--head') {
      const value = args[index + 1];
      if (!value) fail(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  if (!['all', 'history', 'classification'].includes(options.check)) fail(`unsupported check: ${options.check}`);
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.check === 'all' || options.check === 'history') {
    const history = checkMigrationHistory(root, options);
    console.log(`PASS: ${history.protectedCount} base-tree migration(s) unchanged from ${history.base} to ${history.head}.`);
  }
  if (options.check === 'all' || options.check === 'classification') {
    const classification = await checkClassificationMigration(root);
    console.log(`PASS: ${classification.requiredCommentCount} legacy-table classification comments are present and comment-only.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
