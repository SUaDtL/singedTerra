// Contract check for the legacy-table data-classification migration (#125).
// Run: node scripts/checks/migration_classification.mjs

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

const forbiddenExecutableSql = /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/i;

let sql;
try {
  sql = await readFile(migrationPath, 'utf8');
} catch (error) {
  console.error(`FAIL: required migration is missing: ${migrationPath}`);
  console.error(error instanceof Error ? error.message : error);
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

const executableLines = sql
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('--'));
if (executableLines.some((line) => forbiddenExecutableSql.test(line) && !/^COMMENT\s+ON\s+(?:TABLE|COLUMN)\b/i.test(line))) {
  console.error('FAIL: migration contains executable schema/data/privilege SQL beyond COMMENT ON TABLE/COLUMN');
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
