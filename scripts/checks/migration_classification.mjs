// Contract check for the legacy-table data-classification migration (#125).
// Run: node scripts/checks/migration_classification.mjs

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationPath = join(root, 'supabase', 'migrations', '011_data_classification_comments.sql');

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

function hasOnlyAllowedCommentStatements(text) {
  return sqlStatements(text).every((statement) => allowedCommentStatement.test(statement));
}

let sql;
try {
  sql = await readFile(migrationPath, 'utf8');
} catch (error) {
  console.error(`FAIL: required migration is missing: ${migrationPath}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const changedMigrationPaths = new Set();
for (const gitArgs of [
  ['diff', '--name-only', 'HEAD', '--', 'supabase/migrations'],
  ['diff', '--name-only', 'HEAD^', 'HEAD', '--', 'supabase/migrations'],
]) {
  try {
    for (const path of execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)) {
      changedMigrationPaths.add(path.replaceAll('\\', '/'));
    }
  } catch {
    // A shallow/unborn checkout may not have HEAD^; the working-tree check still applies.
  }
}
const modifiedAppliedMigrations = [...changedMigrationPaths].filter((path) => /\/0(?:0[1-9]|10)_.*\.sql$/i.test(path));
if (modifiedAppliedMigrations.length > 0) {
  console.error(`FAIL: applied migration(s) were modified: ${modifiedAppliedMigrations.join(', ')}`);
  process.exit(1);
}

if (!/^-- Lock profile:/im.test(sql)) {
  console.error('FAIL: migration header must declare the expected lock profile');
  process.exit(1);
}

const missing = requiredStatements.filter((statement) => !sql.includes(statement));
if (missing.length > 0) {
  console.error(`FAIL: ${missing.length} required classification comment(s) are missing`);
  for (const statement of missing) console.error(`  - ${statement}`);
  process.exit(1);
}

if (!hasOnlyAllowedCommentStatements(sql)) {
  console.error('FAIL: migration contains a statement beyond the exact COMMENT ON TABLE/COLUMN allowlist');
  process.exit(1);
}

const firstStatementEnd = sql.indexOf('COMMENT ON COLUMN rooms.id');
const mutationProbes = [
  {
    label: 'same-line trailing ALTER',
    sql: `${sql.slice(0, firstStatementEnd)} ALTER TABLE rooms ADD COLUMN injected text;${sql.slice(firstStatementEnd)}`,
  },
  { label: 'standalone DROP', sql: `${sql}\nDROP TABLE rooms;` },
  {
    label: 'multiline dynamic DROP',
    sql: `${sql}\nDO $$\nBEGIN\n  EXECUTE 'DROP TABLE rooms';\nEND\n$$;`,
  },
];
const acceptedMutationProbes = mutationProbes.filter(({ sql: probe }) => hasOnlyAllowedCommentStatements(probe));
if (acceptedMutationProbes.length > 0) {
  console.error('FAIL: SQL allowlist mutation probe(s) were not rejected');
  for (const { label } of acceptedMutationProbes) console.error(`  - ${label}`);
  process.exit(1);
}

const actualTargets = [...sql.matchAll(/^COMMENT\s+ON\s+(?:TABLE|COLUMN)\s+([a-z_]+(?:\.[a-z_]+)?)\s+IS\s+/gim)].map((match) => match[1]);
const unexpectedTargets = actualTargets.filter((target) => !expectedTargets.has(target));
const duplicateTargets = actualTargets.filter((target, index) => actualTargets.indexOf(target) !== index);
if (actualTargets.length !== expectedTargets.size || unexpectedTargets.length > 0 || duplicateTargets.length > 0) {
  console.error('FAIL: migration must contain exactly one comment for each approved legacy table/column target');
  if (unexpectedTargets.length > 0) console.error(`  unexpected: ${unexpectedTargets.join(', ')}`);
  if (duplicateTargets.length > 0) console.error(`  duplicate: ${duplicateTargets.join(', ')}`);
  console.error(`  expected ${expectedTargets.size} targets, found ${actualTargets.length}`);
  process.exit(1);
}

if (/classification:\s*SECRET/i.test(sql)) {
  console.error('FAIL: legacy public tables must not classify any field as SECRET');
  process.exit(1);
}

console.log(`PASS: ${requiredStatements.length} legacy-table classification comments are present and migration is comment-only.`);
