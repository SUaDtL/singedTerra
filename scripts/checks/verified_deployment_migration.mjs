// Contract oracle for the additive Verified Deployment persistence boundary.
// Run: node scripts/checks/verified_deployment_migration.mjs

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationPath = join(root, 'supabase', 'migrations', '016_verified_deployments.sql');
const packagePath = join(root, 'package.json');

function fail(message) {
  throw new Error(`Verified Deployment migration contract failed: ${message}`);
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

function normalize(sql) {
  return stripSqlComments(sql).replace(/\s+/g, ' ').trim();
}

function topLevelSqlStatements(sql) {
  const statements = [];
  let buffer = '';
  let blockDepth = 0;
  let dollarTag = null;
  let state = 'normal';
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];
    if (state === 'line-comment') {
      if (character === '\n') {
        buffer += ' ';
        state = 'normal';
      }
      continue;
    }
    if (state === 'block-comment') {
      if (character === '/' && next === '*') {
        blockDepth += 1;
        index += 1;
      } else if (character === '*' && next === '/') {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) {
          buffer += ' ';
          state = 'normal';
        }
      }
      continue;
    }
    if (state === 'single-quote') {
      buffer += character;
      if (character === "'" && next === "'") {
        buffer += next;
        index += 1;
      } else if (character === "'") state = 'normal';
      continue;
    }
    if (state === 'double-quote') {
      buffer += character;
      if (character === '"' && next === '"') {
        buffer += next;
        index += 1;
      } else if (character === '"') state = 'normal';
      continue;
    }
    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        buffer += dollarTag;
        index += dollarTag.length - 1;
        dollarTag = null;
        state = 'normal';
      } else buffer += character;
      continue;
    }

    if (character === '-' && next === '-') {
      state = 'line-comment';
      index += 1;
    } else if (character === '/' && next === '*') {
      state = 'block-comment';
      blockDepth = 1;
      index += 1;
    } else if (character === "'") {
      buffer += character;
      state = 'single-quote';
    } else if (character === '"') {
      buffer += character;
      state = 'double-quote';
    } else if (character === '$') {
      const tag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        buffer += tag;
        dollarTag = tag;
        state = 'dollar-quote';
        index += tag.length - 1;
      } else buffer += character;
    } else if (character === ';') {
      const statement = buffer.trim();
      if (statement) statements.push(statement);
      buffer = '';
    } else buffer += character;
  }
  if (state !== 'normal' || blockDepth !== 0 || dollarTag !== null) fail('unterminated top-level SQL lexical construct');
  if (buffer.trim()) fail(`unterminated top-level SQL statement: ${buffer.trim().slice(0, 80)}`);
  return statements;
}

const sqlIdentifier = '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)';

function canonicalIdentifier(identifier) {
  const value = identifier.trim();
  if (/^"(?:[^"]|"")*"$/.test(value)) return value.slice(1, -1).replace(/""/g, '"').toLowerCase();
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) fail(`unsafe SQL identifier: ${identifier}`);
  return value.toLowerCase();
}

function canonicalQualifiedIdentifier(identifier) {
  const match = identifier.match(new RegExp(`^(${sqlIdentifier})(?:\\s*\\.\\s*(${sqlIdentifier}))?$`));
  if (!match) fail(`unsafe qualified SQL identifier: ${identifier}`);
  return [match[1], match[2]].filter(Boolean).map(canonicalIdentifier).join('.');
}

function splitSqlList(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === '(') depth += 1;
    else if (!quoted && character === ')') depth -= 1;
    else if (!quoted && depth === 0 && character === ',') {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
    if (depth < 0) fail(`unbalanced SQL list: ${value}`);
  }
  if (quoted || depth !== 0) fail(`unbalanced SQL list: ${value}`);
  parts.push(value.slice(start).trim());
  if (parts.some((part) => part.length === 0)) fail(`empty SQL list member: ${value}`);
  return parts;
}

function canonicalRoutineArgument(argument) {
  const normalized = argument
    .replace(/"((?:[^"]|"")*)"/g, (_match, inner) => inner.replace(/""/g, '"').toLowerCase())
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const tokens = normalized.split(' ');
  if (tokens[0] === 'in') tokens.shift();
  if (tokens.length === 2) {
    canonicalIdentifier(tokens.shift());
  }
  if (tokens.length !== 1) fail(`unclassifiable routine identity argument: ${argument}`);
  const type = canonicalQualifiedIdentifier(tokens[0]);
  return type.startsWith('pg_catalog.') ? type.slice('pg_catalog.'.length) : type;
}

function canonicalSignature(signature) {
  if (signature.trim() === '') return '';
  return splitSqlList(signature).map(canonicalRoutineArgument).join(',');
}

function canonicalGrantRecipients(value) {
  const grantable = /\s+WITH\s+GRANT\s+OPTION$/i.test(value);
  const roles = value.replace(/\s+WITH\s+GRANT\s+OPTION$/i, '');
  return { grantable, roles: splitSqlList(roles).map(canonicalIdentifier) };
}

function grantSemantics(sql) {
  const grants = [];
  for (const rawStatement of stripSqlComments(sql).split(';')) {
    const statement = rawStatement.replace(/\s+/g, ' ').trim();
    if (!/^GRANT\b/i.test(statement)) continue;

    const schemaWide = statement.match(new RegExp(
      `^GRANT\\s+(EXECUTE|ALL(?:\\s+PRIVILEGES)?)\\s+ON\\s+ALL\\s+(FUNCTIONS|ROUTINES)\\s+IN\\s+SCHEMA\\s+(${sqlIdentifier})\\s+TO\\s+(.+)$`,
      'i',
    ));
    if (schemaWide) {
      const schema = canonicalIdentifier(schemaWide[3]);
      const recipients = canonicalGrantRecipients(schemaWide[4]);
      for (const role of recipients.roles) {
        grants.push(`schema:${schema}:execute:${role}:grantable=${recipients.grantable}`);
      }
      continue;
    }

    const direct = statement.match(new RegExp(
      `^GRANT\\s+(EXECUTE|ALL(?:\\s+PRIVILEGES)?)\\s+ON\\s+(FUNCTION|ROUTINE)\\s+((?:${sqlIdentifier})(?:\\s*\\.\\s*(?:${sqlIdentifier}))?)\\s*\\((.*)\\)\\s+TO\\s+(.+)$`,
      'i',
    ));
    if (direct) {
      const target = `${canonicalQualifiedIdentifier(direct[3])}(${canonicalSignature(direct[4])})`;
      const recipients = canonicalGrantRecipients(direct[5]);
      for (const role of recipients.roles) {
        grants.push(`routine:${target}:execute:${role}:grantable=${recipients.grantable}`);
      }
      continue;
    }

    if (/\bON\b/i.test(statement)) fail(`unclassifiable authority-bearing GRANT: ${statement}`);
    const membership = statement.match(/^GRANT\s+(.+?)\s+TO\s+(.+)$/i);
    if (!membership) fail(`unclassifiable GRANT: ${statement}`);
    const grantedRoles = splitSqlList(membership[1]).map(canonicalIdentifier);
    const admin = /\s+WITH\s+ADMIN\s+OPTION$/i.test(membership[2]);
    const grantees = splitSqlList(membership[2].replace(/\s+WITH\s+ADMIN\s+OPTION$/i, '')).map(canonicalIdentifier);
    for (const grantedRole of grantedRoles) {
      for (const grantee of grantees) grants.push(`role:${grantedRole}:member:${grantee}:admin=${admin}`);
    }
  }
  return grants;
}

function routineAlterations(sql) {
  const alterations = [];
  for (const rawStatement of stripSqlComments(sql).split(';')) {
    const statement = rawStatement.replace(/\s+/g, ' ').trim();
    if (!/^ALTER\s+(?:FUNCTION|ROUTINE)\b/i.test(statement)) continue;
    const alteration = statement.match(new RegExp(
      `^ALTER\\s+(?:FUNCTION|ROUTINE)\\s+((?:${sqlIdentifier})(?:\\s*\\.\\s*(?:${sqlIdentifier}))?)\\s*\\((.*)\\)\\s+(.+)$`,
      'i',
    ));
    if (!alteration) fail(`unclassifiable ALTER FUNCTION or ROUTINE: ${statement}`);
    alterations.push({
      target: `${canonicalQualifiedIdentifier(alteration[1])}(${canonicalSignature(alteration[2])})`,
      action: alteration[3].trim().toLowerCase(),
    });
  }
  return alterations;
}

function routineDefinitionCounts(sql) {
  const counts = new Map();
  const definitions = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+((?:${sqlIdentifier})(?:\\s*\\.\\s*(?:${sqlIdentifier}))?)\\s*\\(([^)]*)\\)`,
    'gi',
  );
  for (const match of stripSqlComments(sql).matchAll(definitions)) {
    const target = `${canonicalQualifiedIdentifier(match[1])}(${canonicalSignature(match[2])})`;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return counts;
}

function routineDrops(sql) {
  const drops = [];
  for (const rawStatement of stripSqlComments(sql).split(';')) {
    const statement = rawStatement.replace(/\s+/g, ' ').trim();
    if (!/^DROP\s+(?:FUNCTION|ROUTINE)\b/i.test(statement)) continue;
    const drop = statement.match(new RegExp(
      `^DROP\\s+(?:FUNCTION|ROUTINE)\\s+(?:IF\\s+EXISTS\\s+)?((?:${sqlIdentifier})(?:\\s*\\.\\s*(?:${sqlIdentifier}))?)\\s*\\((.*)\\)(?:\\s+(?:CASCADE|RESTRICT))?$`,
      'i',
    ));
    if (!drop) fail(`unclassifiable DROP FUNCTION or ROUTINE: ${statement}`);
    drops.push(`${canonicalQualifiedIdentifier(drop[1])}(${canonicalSignature(drop[2])})`);
  }
  return drops;
}

function routineAclEvents(sql) {
  const events = [];
  for (const rawStatement of stripSqlComments(sql).split(';')) {
    const statement = rawStatement.replace(/\s+/g, ' ').trim();
    if (/^GRANT\b/i.test(statement)) {
      for (const semantic of grantSemantics(`${statement};`)) {
        if (semantic.startsWith('routine:') || semantic.startsWith('schema:')) events.push(`grant:${semantic}`);
      }
      continue;
    }
    if (!/^REVOKE\b/i.test(statement)
      || !/\bON\s+(?:(?:FUNCTION|ROUTINE)\b|ALL\s+(?:FUNCTIONS|ROUTINES)\b)/i.test(statement)) continue;

    const schemaWide = statement.match(new RegExp(
      `^REVOKE\\s+(GRANT\\s+OPTION\\s+FOR\\s+)?(EXECUTE|ALL(?:\\s+PRIVILEGES)?)\\s+ON\\s+ALL\\s+(?:FUNCTIONS|ROUTINES)\\s+IN\\s+SCHEMA\\s+(${sqlIdentifier})\\s+FROM\\s+(.+?)(?:\\s+(?:CASCADE|RESTRICT))?$`,
      'i',
    ));
    if (schemaWide) {
      const roles = splitSqlList(schemaWide[4]).map(canonicalIdentifier).sort().join(',');
      events.push(`revoke:schema:${canonicalIdentifier(schemaWide[3])}:execute:${roles}:grant-option-only=${Boolean(schemaWide[1])}`);
      continue;
    }

    const direct = statement.match(new RegExp(
      `^REVOKE\\s+(GRANT\\s+OPTION\\s+FOR\\s+)?(EXECUTE|ALL(?:\\s+PRIVILEGES)?)\\s+ON\\s+(?:FUNCTION|ROUTINE)\\s+((?:${sqlIdentifier})(?:\\s*\\.\\s*(?:${sqlIdentifier}))?)\\s*\\((.*)\\)\\s+FROM\\s+(.+?)(?:\\s+(?:CASCADE|RESTRICT))?$`,
      'i',
    ));
    if (!direct) fail(`unclassifiable routine authority REVOKE: ${statement}`);
    const target = `${canonicalQualifiedIdentifier(direct[3])}(${canonicalSignature(direct[4])})`;
    const roles = splitSqlList(direct[5]).map(canonicalIdentifier).sort().join(',');
    events.push(`revoke:routine:${target}:execute:${roles}:grant-option-only=${Boolean(direct[1])}`);
  }
  return events;
}

function schemaStateEvents(sql) {
  const events = [];
  for (const rawStatement of stripSqlComments(sql).split(';')) {
    const statement = rawStatement.replace(/\s+/g, ' ').trim();
    if (/^(?:CREATE|DROP|ALTER)\s+SCHEMA\b/i.test(statement)) {
      const lifecycle = statement.match(new RegExp(
        `^(CREATE|DROP|ALTER)\\s+SCHEMA\\s+(?:IF\\s+(?:NOT\\s+)?EXISTS\\s+)?(${sqlIdentifier})(?:\\s+(.+))?$`,
        'i',
      ));
      if (!lifecycle) fail(`unclassifiable schema lifecycle statement: ${statement}`);
      events.push({
        action: lifecycle[1].toLowerCase(),
        schema: canonicalIdentifier(lifecycle[2]),
        semantic: `lifecycle:${lifecycle[1].toLowerCase()}:schema:${canonicalIdentifier(lifecycle[2])}:${(lifecycle[3] ?? '').trim().toLowerCase()}`,
      });
      continue;
    }

    if (!/^(?:GRANT|REVOKE)\b/i.test(statement) || !/\bON\s+SCHEMA\b/i.test(statement)) continue;
    const grant = statement.match(new RegExp(
      `^GRANT\\s+(USAGE|CREATE|ALL(?:\\s+PRIVILEGES)?)\\s+ON\\s+SCHEMA\\s+(${sqlIdentifier})\\s+TO\\s+(.+)$`,
      'i',
    ));
    if (grant) {
      const recipients = canonicalGrantRecipients(grant[3]);
      const privilege = /^ALL/i.test(grant[1]) ? 'all' : grant[1].toLowerCase();
      const schema = canonicalIdentifier(grant[2]);
      events.push({
        action: 'grant',
        grantOptionOnly: false,
        privilege,
        roles: recipients.roles,
        schema,
        semantic: `acl:grant:schema:${schema}:${privilege}:${recipients.roles.slice().sort().join(',')}:grantable=${recipients.grantable}`,
      });
      continue;
    }

    const revoke = statement.match(new RegExp(
      `^REVOKE\\s+(GRANT\\s+OPTION\\s+FOR\\s+)?(USAGE|CREATE|ALL(?:\\s+PRIVILEGES)?)\\s+ON\\s+SCHEMA\\s+(${sqlIdentifier})\\s+FROM\\s+(.+?)(?:\\s+(?:CASCADE|RESTRICT))?$`,
      'i',
    ));
    if (!revoke) fail(`unclassifiable schema ACL statement: ${statement}`);
    const roles = splitSqlList(revoke[4]).map(canonicalIdentifier);
    const privilege = /^ALL/i.test(revoke[2]) ? 'all' : revoke[2].toLowerCase();
    const schema = canonicalIdentifier(revoke[3]);
    events.push({
      action: 'revoke',
      grantOptionOnly: Boolean(revoke[1]),
      privilege,
      roles,
      schema,
      semantic: `acl:revoke:schema:${schema}:${privilege}:${roles.slice().sort().join(',')}:grant-option-only=${Boolean(revoke[1])}`,
    });
  }
  return events;
}

function assertApprovedTopLevelStatements(sql) {
  const categories = [];
  const tables = [];
  const indexes = [];
  const alters = [];
  const tableRevokes = [];
  const functions = [];
  const triggers = [];
  let comments = 0;
  let inserts = 0;
  let routineGrants = 0;
  let routineRevokes = 0;
  let auditBlocks = 0;
  const expectedAuditBlock = `DO $acl$
    DECLARE
      table_name text;
      role_name text;
      privilege_name text;
    BEGIN
      FOREACH table_name IN ARRAY ARRAY[
        'verified_deployment_contracts',
        'verified_deployments',
        'verified_match_results'
      ]
      LOOP
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
        LOOP
          FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
          LOOP
            IF has_table_privilege(role_name, 'public.' || table_name, privilege_name) THEN
              RAISE EXCEPTION 'verified deployment direct table ACL assertion failed';
            END IF;
          END LOOP;
        END LOOP;
      END LOOP;
    END
    $acl$`.replace(/\s+/g, ' ').trim();

  for (const statement of topLevelSqlStatements(sql)) {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    let match;
    if ((match = normalized.match(/^CREATE TABLE (public\.[A-Za-z_][A-Za-z0-9_$]*)\s*\(/i))) {
      categories.push('create-table');
      tables.push(canonicalQualifiedIdentifier(match[1]));
    } else if ((match = normalized.match(/^CREATE (UNIQUE )?INDEX ([A-Za-z_][A-Za-z0-9_$]*) ON (public\.[A-Za-z_][A-Za-z0-9_$]*)\b/i))) {
      categories.push('create-index');
      indexes.push(`${match[1] ? 'unique:' : ''}${canonicalIdentifier(match[2])}:${canonicalQualifiedIdentifier(match[3])}`);
    } else if ((match = normalized.match(/^INSERT INTO (public\.[A-Za-z_][A-Za-z0-9_$]*)\s*\(/i))) {
      if (canonicalQualifiedIdentifier(match[1]) !== 'public.verified_deployment_contracts') fail(`unapproved top-level INSERT: ${normalized.slice(0, 100)}`);
      categories.push('insert');
      inserts += 1;
    } else if ((match = normalized.match(/^ALTER TABLE (public\.[A-Za-z_][A-Za-z0-9_$]*) ENABLE ROW LEVEL SECURITY$/i))) {
      categories.push('alter-table');
      alters.push(canonicalQualifiedIdentifier(match[1]));
    } else if ((match = normalized.match(/^REVOKE ALL ON TABLE (public\.[A-Za-z_][A-Za-z0-9_$]*) FROM PUBLIC, anon, authenticated, service_role$/i))) {
      categories.push('revoke-table');
      tableRevokes.push(canonicalQualifiedIdentifier(match[1]));
    } else if ((match = normalized.match(new RegExp(
      `^CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+((?:${sqlIdentifier})(?:\\s*\\.\\s*(?:${sqlIdentifier}))?)\\s*\\(([^)]*)\\)`,
      'i',
    )))) {
      categories.push('create-function');
      functions.push(`${canonicalQualifiedIdentifier(match[1])}(${canonicalSignature(match[2])})`);
    } else if ((match = normalized.match(/^CREATE TRIGGER ([A-Za-z_][A-Za-z0-9_$]*) BEFORE UPDATE ON (public\.[A-Za-z_][A-Za-z0-9_$]*) FOR EACH ROW EXECUTE FUNCTION (public\.[A-Za-z_][A-Za-z0-9_$]*)\(\)$/i))) {
      categories.push('create-trigger');
      triggers.push(`${canonicalIdentifier(match[1])}:${canonicalQualifiedIdentifier(match[2])}:${canonicalQualifiedIdentifier(match[3])}`);
    } else if (/^REVOKE\b/i.test(normalized) && /\bON\s+(?:FUNCTION|ROUTINE)\b/i.test(normalized)) {
      categories.push('revoke-routine');
      routineRevokes += 1;
    } else if (/^GRANT\b/i.test(normalized) && /\bON\s+(?:FUNCTION|ROUTINE)\b/i.test(normalized)) {
      categories.push('grant-routine');
      routineGrants += 1;
    } else if (/^DO\b/i.test(normalized)) {
      if (normalized !== expectedAuditBlock) fail('unapproved top-level DO block');
      categories.push('do');
      auditBlocks += 1;
    } else if (/^COMMENT ON (?:TABLE|COLUMN|FUNCTION)\b[\s\S]*\bIS 'classification: (?:PRIVATE|INTERNAL)\b/i.test(normalized)) {
      categories.push('comment');
      comments += 1;
    } else {
      fail(`unapproved top-level SQL statement: ${normalized.slice(0, 120)}`);
    }
  }

  assert.deepEqual(tables.sort(), ['public.verified_deployment_contracts', 'public.verified_deployments', 'public.verified_match_results'].sort());
  assert.deepEqual(indexes.sort(), [
    'unique:verified_deployments_one_active_per_user:public.verified_deployments',
    'verified_match_results_owner_aggregate:public.verified_match_results',
  ].sort());
  assert.equal(inserts, 1, 'migration must contain exactly one approved seed INSERT');
  assert.deepEqual(alters.sort(), ['public.verified_deployment_contracts', 'public.verified_deployments', 'public.verified_match_results'].sort());
  assert.deepEqual(tableRevokes.sort(), ['public.verified_deployment_contracts', 'public.verified_deployments', 'public.verified_match_results'].sort());
  assert.deepEqual(functions.sort(), [
    'public.is_valid_verified_transcript(jsonb)',
    'public.guard_verified_deployment_mutation()',
    'public.reject_verified_match_result_mutation()',
    'public.start_verified_deployment(uuid,jsonb,timestamptz)',
    'public.abandon_verified_deployment(uuid,uuid)',
    'public.complete_verified_deployment(uuid,uuid,jsonb,boolean,text,integer)',
    'public.verified_progression_summary(uuid)',
    'public.verified_deployment_completion_context(uuid,uuid)',
    'public.set_verified_deployment_starts(smallint,boolean)',
    'public.verified_deployment_drain_status(smallint)',
  ].sort());
  assert.deepEqual(triggers.sort(), [
    'verified_deployments_guard:public.verified_deployments:public.guard_verified_deployment_mutation',
    'verified_match_results_immutable:public.verified_match_results:public.reject_verified_match_result_mutation',
  ].sort());
  assert.equal(routineRevokes, 10);
  assert.equal(routineGrants, 7);
  assert.equal(auditBlocks, 1);
  assert.equal(comments, 33);
  assert.deepEqual(categories, [
    'create-table', 'create-table', 'create-index', 'create-function', 'create-table', 'create-index', 'insert',
    'alter-table', 'alter-table', 'alter-table', 'revoke-table', 'revoke-table', 'revoke-table',
    'create-function', 'create-trigger', 'create-function', 'create-trigger',
    ...Array(7).fill('create-function'),
    ...Array(10).fill('revoke-routine'),
    ...Array(7).fill('grant-routine'),
    'do',
    ...Array(33).fill('comment'),
  ], 'top-level migration statements must match the exact approved ordered family stream');
}

function requirePattern(sql, pattern, label) {
  if (!pattern.test(sql)) fail(`missing ${label}`);
}

function functionBody(sql, name) {
  const pattern = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\s*\\([^)]*\\)[\\s\\S]*?AS\\s+\\$function\\$([\\s\\S]*?)\\$function\\$\\s*;`,
    'i',
  );
  const match = sql.match(pattern);
  if (!match) fail(`missing executable ${name} function body`);
  return normalize(match[1]);
}

function assertOrder(body, labels) {
  let cursor = -1;
  for (const [label, pattern] of labels) {
    const match = pattern.exec(body);
    if (!match || match.index <= cursor) fail(`unsafe or absent ${label} ordering`);
    cursor = match.index;
  }
}

function validateSql(sql) {
  assertApprovedTopLevelStatements(sql);
  const structure = normalize(sql);
  for (const table of ['verified_deployment_contracts', 'verified_deployments', 'verified_match_results']) {
    requirePattern(structure, new RegExp(`CREATE TABLE public\\.${table}\\b`, 'i'), `${table} table`);
    requirePattern(structure, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'), `${table} RLS`);
    requirePattern(sql, new RegExp(`COMMENT ON TABLE public\\.${table} IS 'classification: (?:PRIVATE|INTERNAL)`, 'i'), `${table} classification`);
  }

  const requiredColumns = {
    verified_deployment_contracts: ['contract_version', 'starts_enabled', 'disabled_at', 'last_started_at', 'updated_at'],
    verified_deployments: ['id', 'user_id', 'config', 'contract_version', 'engine_version', 'ruleset_version', 'status', 'expires_at', 'created_at', 'updated_at'],
    verified_match_results: [
      'session_id', 'user_id', 'transcript', 'won', 'outcome', 'verified_xp',
      'prior_verified_matches', 'prior_verified_wins', 'prior_total_xp',
      'current_verified_matches', 'current_verified_wins', 'current_total_xp', 'created_at',
    ],
  };
  for (const [table, columns] of Object.entries(requiredColumns)) {
    for (const column of columns) {
      requirePattern(sql, new RegExp(`COMMENT ON COLUMN public\\.${table}\\.${column} IS 'classification: (?:PRIVATE|INTERNAL)`, 'i'), `${table}.${column} classification`);
    }
  }

  const required = [
    [/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i, 'server UUID session identity'],
    [/user_id uuid NOT NULL REFERENCES auth\.users\s*\(id\)/i, 'Auth-owned session'],
    [/config jsonb NOT NULL/i, 'immutable exact config'],
    [/contract_version smallint NOT NULL DEFAULT 1[^;]*CHECK\s*\(contract_version = 1\)/i, 'contract version 1'],
    [/engine_version smallint NOT NULL DEFAULT 1[^;]*CHECK\s*\(engine_version = 1\)/i, 'engine version 1'],
    [/ruleset_version smallint NOT NULL DEFAULT 3[^;]*CHECK\s*\(ruleset_version = 3\)/i, 'ruleset version 3'],
    [/status text NOT NULL[^;]*CHECK\s*\(status IN \('active', 'completed', 'expired', 'abandoned'\)\)/i, 'bounded session states'],
    [/CREATE UNIQUE INDEX verified_deployments_one_active_per_user[\s\S]*ON public\.verified_deployments\s*\(user_id\)[\s\S]*WHERE status = 'active'/i, 'one active session per account'],
    [/session_id uuid PRIMARY KEY/i, 'one immutable result per session'],
    [/FOREIGN KEY \(session_id, user_id\)[\s\S]*REFERENCES public\.verified_deployments\(id, user_id\) ON DELETE CASCADE/i, 'account-erasure result cascade'],
    [/CREATE INDEX verified_match_results_owner_aggregate[\s\S]*ON public\.verified_match_results\s*\(user_id(?:,|\))/i, 'owner aggregation index'],
    [/transcript jsonb NOT NULL/i, 'private canonical transcript'],
    [/CHECK \(public\.is_valid_verified_transcript\(transcript\)\)/i, 'exact bounded transcript validation'],
    [/CHECK \(\(won AND outcome = 'win' AND verified_xp = 200\)[\s\S]*OR \(NOT won AND outcome IN \('loss', 'draw'\) AND verified_xp = 100\)\)/i, 'award and outcome consistency'],
    [/CHECK \(prior_verified_matches >= 0 AND prior_verified_wins BETWEEN 0 AND prior_verified_matches AND prior_total_xp >= 0\)/i, 'non-negative prior progression'],
    [/CHECK \(current_verified_matches = prior_verified_matches \+ 1[\s\S]*current_verified_wins = prior_verified_wins \+ CASE WHEN won THEN 1 ELSE 0 END[\s\S]*current_total_xp = prior_total_xp \+ verified_xp\)/i, 'result-specific progression delta'],
    [/prior_verified_matches bigint NOT NULL/i, 'required prior match snapshot'],
    [/prior_verified_wins bigint NOT NULL/i, 'required prior win snapshot'],
    [/prior_total_xp bigint NOT NULL/i, 'required prior XP snapshot'],
    [/current_verified_matches bigint NOT NULL/i, 'required current match snapshot'],
    [/current_verified_wins bigint NOT NULL/i, 'required current win snapshot'],
    [/current_total_xp bigint NOT NULL/i, 'required current XP snapshot'],
    [/INSERT INTO public\.verified_deployment_contracts[\s\S]*VALUES\s*\(1, false/i, 'disabled V1 control seed'],
    [/CREATE TRIGGER verified_deployments_guard[\s\S]*BEFORE UPDATE ON public\.verified_deployments/i, 'session update immutability trigger'],
    [/CREATE TRIGGER verified_match_results_immutable[\s\S]*BEFORE UPDATE ON public\.verified_match_results/i, 'result update immutability trigger'],
  ];
  for (const [pattern, label] of required) requirePattern(sql, pattern, label);

  const functions = [
    'start_verified_deployment',
    'abandon_verified_deployment',
    'complete_verified_deployment',
    'verified_deployment_completion_context',
    'verified_progression_summary',
    'set_verified_deployment_starts',
    'verified_deployment_drain_status',
  ];
  for (const name of functions) {
    const declaration = new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = ''[\\s\\S]*?AS \\$function\\$`,
      'i',
    );
    requirePattern(sql, declaration, `${name} safe SECURITY DEFINER declaration`);
    requirePattern(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\) FROM PUBLIC, anon, authenticated`, 'i'), `${name} broad EXECUTE revocation`);
    requirePattern(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) TO service_role`, 'i'), `${name} service-only EXECUTE`);
  }

  const forbidden = [
    [/\b(?:DROP TABLE|TRUNCATE|ALTER TABLE[^;]+DISABLE ROW LEVEL SECURITY)\b/i, 'destructive or RLS-disabling DDL'],
    [/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[^;]*\sTO\s+(?:PUBLIC|anon|authenticated)\b/i, 'client table grant'],
    [/GRANT EXECUTE ON FUNCTION[^;]+TO\s+(?:PUBLIC|anon|authenticated)\b/i, 'broad RPC execution'],
    [/CREATE\s+POLICY\b/i, 'direct client policy'],
    [/\b(?:email|password|access_token|refresh_token|service_role_key|seat_token)\s+[a-z]/i, 'credential column'],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(structure)) fail(`contains forbidden ${label}`);
  }
  if (/verified_deployment_delete_forbidden|BEFORE UPDATE OR DELETE ON public\.verified_(?:deployments|match_results)/i.test(structure)) {
    fail('FK-driven account erasure must not be blocked by operational immutability triggers');
  }

  for (const table of ['verified_deployment_contracts', 'verified_deployments', 'verified_match_results']) {
    requirePattern(
      structure,
      new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated, service_role`, 'i'),
      `${table} direct-access revocation`,
    );
  }
  if (/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[^;]*\sTO\s+service_role\b/i.test(structure)) {
    fail('service role must mutate only through exact SECURITY DEFINER RPCs');
  }

  const start = functionBody(sql, 'start_verified_deployment');
  requirePattern(sql, /FUNCTION public\.start_verified_deployment\(\s*p_user_id uuid,\s*p_config jsonb,\s*p_expires_at timestamptz\s*\)\s*RETURNS TABLE \([\s\S]*?id uuid,[\s\S]*?user_id uuid,[\s\S]*?config jsonb,[\s\S]*?contract_version smallint,[\s\S]*?engine_version smallint,[\s\S]*?ruleset_version smallint,[\s\S]*?status text,[\s\S]*?expires_at timestamptz,[\s\S]*?created_at timestamptz,[\s\S]*?updated_at timestamptz,[\s\S]*?resumed boolean\s*\)/i, 'authoritative start result shape');
  requirePattern(start, /p_user_id IS NULL/i, 'non-null start identity validation');
  requirePattern(start, /FROM public\.verified_deployment_contracts AS control WHERE control\.contract_version = 1 FOR UPDATE/i, 'qualified start control lookup under RETURNS TABLE');
  requirePattern(start, /UPDATE public\.verified_deployments AS deployment SET status = 'expired' WHERE deployment\.id = v_session\.id/i, 'qualified expired-session update under RETURNS TABLE');
  requirePattern(start, /UPDATE public\.verified_deployment_contracts AS control SET last_started_at = v_now,[\s\S]*?WHERE control\.contract_version = 1/i, 'qualified start-control update under RETURNS TABLE');
  assertOrder(start, [
    ['per-user advisory lock', /(?:pg_catalog\.)?pg_advisory_xact_lock\((?:pg_catalog\.)?hashtextextended\(p_user_id::text, 0\)\)/i],
    ['contract row lock', /FROM public\.verified_deployment_contracts[^;]*FOR UPDATE/i],
    ['active session lock', /FROM public\.verified_deployments[^;]*status = 'active'[^;]*FOR UPDATE/i],
    ['resume before admission check', /IF v_session\.id IS NOT NULL AND v_session\.expires_at > v_now THEN/i],
    ['starts-disabled check', /IF NOT v_starts_enabled THEN/i],
    ['session creation', /INSERT INTO public\.verified_deployments/i],
    ['authoritative final-start timestamp', /UPDATE public\.verified_deployment_contracts AS control SET last_started_at = v_now/i],
  ]);
  requirePattern(start, /UPDATE public\.verified_deployments AS deployment SET status = 'expired'/i, 'expired active-session transition');
  requirePattern(start, /IF v_session\.id IS NOT NULL AND v_session\.expires_at > v_now THEN RETURN QUERY SELECT[\s\S]*?v_session\.updated_at, true; RETURN; END IF;/i, 'active resume returns authoritative true');
  requirePattern(start, /UPDATE public\.verified_deployment_contracts AS control SET last_started_at = v_now,[\s\S]*?RETURN QUERY SELECT[\s\S]*?v_session\.updated_at, false;/i, 'new start returns authoritative false');

  const abandon = functionBody(sql, 'abandon_verified_deployment');
  requirePattern(abandon, /p_user_id IS NULL OR p_session_id IS NULL/i, 'non-null abandon identity validation');
  assertOrder(abandon, [
    ['abandon per-user advisory lock', /(?:pg_catalog\.)?pg_advisory_xact_lock\((?:pg_catalog\.)?hashtextextended\(p_user_id::text, 0\)\)/i],
    ['abandon contract lock', /FROM public\.verified_deployment_contracts[^;]*FOR UPDATE/i],
    ['abandon session lock', /FROM public\.verified_deployments[^;]*FOR UPDATE/i],
    ['abandon state mutation', /UPDATE public\.verified_deployments SET status = 'abandoned'/i],
  ]);
  requirePattern(abandon, /v_session\.user_id <> p_user_id/i, 'abandon ownership validation');

  const complete = functionBody(sql, 'complete_verified_deployment');
  requirePattern(complete, /p_user_id IS NULL OR p_session_id IS NULL/i, 'non-null completion identity validation');
  assertOrder(complete, [
    ['completion per-user advisory lock', /(?:pg_catalog\.)?pg_advisory_xact_lock\((?:pg_catalog\.)?hashtextextended\(p_user_id::text, 0\)\)/i],
    ['completion contract lock', /FROM public\.verified_deployment_contracts[^;]*FOR UPDATE/i],
    ['completion session lock', /FROM public\.verified_deployments[^;]*FOR UPDATE/i],
    ['completion result lock', /FROM public\.verified_match_results[^;]*FOR UPDATE/i],
    ['idempotent stored-result return', /IF v_result\.session_id IS NOT NULL THEN/i],
    ['atomic prior progression snapshot', /SELECT count\(\*\)::bigint, count\(\*\) FILTER \(WHERE result\.won\)::bigint, COALESCE\(sum\(result\.verified_xp\), 0\)::bigint INTO v_prior_verified_matches, v_prior_verified_wins, v_prior_total_xp FROM public\.verified_match_results AS result WHERE result\.user_id = p_user_id/i],
    ['result insert', /INSERT INTO public\.verified_match_results/i],
    ['completed status mutation', /UPDATE public\.verified_deployments SET status = 'completed'/i],
  ]);
  requirePattern(complete, /v_session\.user_id <> p_user_id/i, 'completion ownership validation');
  requirePattern(complete, /v_session\.expires_at <= v_now/i, 'completion expiry validation');
  requirePattern(complete, /v_result\.transcript = p_transcript[\s\S]*v_result\.won = p_won[\s\S]*v_result\.outcome = p_outcome[\s\S]*v_result\.verified_xp = p_verified_xp/i, 'same-evidence completion retry comparison');
  requirePattern(complete, /RAISE EXCEPTION 'verified_deployment_completion_conflict'/i, 'conflicting completion rejection');
  requirePattern(complete, /prior_verified_matches, prior_verified_wins, prior_total_xp, current_verified_matches, current_verified_wins, current_total_xp/i, 'atomic immutable progression persistence');
  requirePattern(complete, /v_prior_verified_matches, v_prior_verified_wins, v_prior_total_xp, v_prior_verified_matches \+ 1, v_prior_verified_wins \+ CASE WHEN p_won THEN 1 ELSE 0 END, v_prior_total_xp \+ p_verified_xp/i, 'exact result-specific progression values');

  const completionContext = functionBody(sql, 'verified_deployment_completion_context');
  requirePattern(
    sql,
    /FUNCTION public\.verified_deployment_completion_context\(\s*p_user_id uuid,\s*p_session_id uuid\s*\)\s*RETURNS TABLE \(\s*session_id uuid,\s*user_id uuid,\s*config jsonb,\s*contract_version smallint,\s*engine_version smallint,\s*ruleset_version smallint,\s*status text,\s*expires_at timestamptz,\s*transcript jsonb,\s*won boolean,\s*outcome text,\s*verified_xp integer,\s*prior_verified_matches bigint,\s*prior_verified_wins bigint,\s*prior_total_xp bigint,\s*current_verified_matches bigint,\s*current_verified_wins bigint,\s*current_total_xp bigint,\s*result_created_at timestamptz\s*\)\s*LANGUAGE plpgsql\s*STABLE\s*SECURITY DEFINER\s*SET search_path = ''\s*AS \$function\$/i,
    'exact stable completion-context declaration and result shape',
  );
  const expectedCompletionContext = normalize(`
    BEGIN
      IF p_user_id IS NULL OR p_session_id IS NULL THEN
        RAISE EXCEPTION 'verified_deployment_not_found';
      END IF;

      RETURN QUERY
      SELECT
        deployment.id,
        deployment.user_id,
        deployment.config,
        deployment.contract_version,
        deployment.engine_version,
        deployment.ruleset_version,
        deployment.status,
        deployment.expires_at,
        result.transcript,
        result.won,
        result.outcome,
        result.verified_xp,
        result.prior_verified_matches,
        result.prior_verified_wins,
        result.prior_total_xp,
        result.current_verified_matches,
        result.current_verified_wins,
        result.current_total_xp,
        result.created_at
      FROM public.verified_deployments AS deployment
      LEFT JOIN public.verified_match_results AS result
        ON result.session_id = deployment.id
        AND result.user_id = deployment.user_id
      WHERE deployment.id = p_session_id
        AND deployment.user_id = p_user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'verified_deployment_not_found';
      END IF;
    END;
  `);
  assert.equal(
    completionContext,
    expectedCompletionContext,
    'completion context must contain only the exact generic-error owner-and-session read',
  );
  requirePattern(completionContext, /p_user_id IS NULL OR p_session_id IS NULL/i, 'non-null completion-context identities');
  requirePattern(completionContext, /FROM public\.verified_deployments AS deployment LEFT JOIN public\.verified_match_results AS result ON result\.session_id = deployment\.id AND result\.user_id = deployment\.user_id/i, 'same-session and same-owner optional result join');
  requirePattern(completionContext, /WHERE deployment\.id = p_session_id AND deployment\.user_id = p_user_id/i, 'exact owner-bound session lookup');
  requirePattern(completionContext, /IF NOT FOUND THEN RAISE EXCEPTION 'verified_deployment_not_found'; END IF;/i, 'generic completion-context not-found');
  requirePattern(completionContext, /deployment\.status, deployment\.expires_at, result\.transcript, result\.won, result\.outcome, result\.verified_xp, result\.prior_verified_matches, result\.prior_verified_wins, result\.prior_total_xp, result\.current_verified_matches, result\.current_verified_wins, result\.current_total_xp, result\.created_at/i, 'honest state and nullable immutable result projection');
  if (/\b(?:INSERT|UPDATE|DELETE|LOCK)\b|\bFOR\s+(?:UPDATE|SHARE)\b|pg_advisory/i.test(completionContext)) {
    fail('completion context must be non-mutating and lock-free');
  }
  const approvedRoutineTargets = [
    'public.abandon_verified_deployment(uuid,uuid)',
    'public.complete_verified_deployment(uuid,uuid,jsonb,boolean,text,integer)',
    'public.set_verified_deployment_starts(smallint,boolean)',
    'public.start_verified_deployment(uuid,jsonb,timestamptz)',
    'public.verified_deployment_completion_context(uuid,uuid)',
    'public.verified_deployment_drain_status(smallint)',
    'public.verified_progression_summary(uuid)',
  ];
  const approvedGrants = approvedRoutineTargets
    .map((target) => `routine:${target}:execute:service_role:grantable=false`)
    .sort();
  assert.deepEqual(
    grantSemantics(sql).sort(),
    approvedGrants,
    'every GRANT must match the exact service-role routine authority whitelist',
  );
  const protectedRoutineTargets = new Set(approvedRoutineTargets);
  const definitionCounts = routineDefinitionCounts(sql);
  for (const target of protectedRoutineTargets) {
    assert.equal(definitionCounts.get(target), 1, `protected routine ${target} must have exactly one definition`);
  }
  for (const target of routineDrops(sql)) {
    if (protectedRoutineTargets.has(target)) fail(`DROP is forbidden for protected routine ${target}`);
  }
  for (const alteration of routineAlterations(sql)) {
    if (protectedRoutineTargets.has(alteration.target)) {
      fail(`post-definition ALTER is forbidden for protected routine ${alteration.target}`);
    }
  }
  const expectedRoutineAclEvents = [
    'revoke:routine:public.guard_verified_deployment_mutation():execute:anon,authenticated,public,service_role:grant-option-only=false',
    'revoke:routine:public.reject_verified_match_result_mutation():execute:anon,authenticated,public,service_role:grant-option-only=false',
    'revoke:routine:public.is_valid_verified_transcript(jsonb):execute:anon,authenticated,public,service_role:grant-option-only=false',
    'revoke:routine:public.start_verified_deployment(uuid,jsonb,timestamptz):execute:anon,authenticated,public:grant-option-only=false',
    'revoke:routine:public.abandon_verified_deployment(uuid,uuid):execute:anon,authenticated,public:grant-option-only=false',
    'revoke:routine:public.complete_verified_deployment(uuid,uuid,jsonb,boolean,text,integer):execute:anon,authenticated,public:grant-option-only=false',
    'revoke:routine:public.verified_deployment_completion_context(uuid,uuid):execute:anon,authenticated,public:grant-option-only=false',
    'revoke:routine:public.verified_progression_summary(uuid):execute:anon,authenticated,public:grant-option-only=false',
    'revoke:routine:public.set_verified_deployment_starts(smallint,boolean):execute:anon,authenticated,public:grant-option-only=false',
    'revoke:routine:public.verified_deployment_drain_status(smallint):execute:anon,authenticated,public:grant-option-only=false',
    'grant:routine:public.start_verified_deployment(uuid,jsonb,timestamptz):execute:service_role:grantable=false',
    'grant:routine:public.abandon_verified_deployment(uuid,uuid):execute:service_role:grantable=false',
    'grant:routine:public.complete_verified_deployment(uuid,uuid,jsonb,boolean,text,integer):execute:service_role:grantable=false',
    'grant:routine:public.verified_deployment_completion_context(uuid,uuid):execute:service_role:grantable=false',
    'grant:routine:public.verified_progression_summary(uuid):execute:service_role:grantable=false',
    'grant:routine:public.set_verified_deployment_starts(smallint,boolean):execute:service_role:grantable=false',
    'grant:routine:public.verified_deployment_drain_status(smallint):execute:service_role:grantable=false',
  ];
  assert.deepEqual(
    routineAclEvents(sql),
    expectedRoutineAclEvents,
    'routine ACL statements must preserve the exact ordered revoke-then-grant final state',
  );
  const schemaEvents = schemaStateEvents(sql);
  let publicUsageAvailable = true;
  for (const event of schemaEvents) {
    if (event.schema !== 'public'
      || !['usage', 'all'].includes(event.privilege)
      || !event.roles?.includes('public')
      || event.grantOptionOnly) continue;
    publicUsageAvailable = event.action === 'grant';
  }
  assert.equal(
    publicUsageAvailable,
    true,
    'approved service-role routines require effective PUBLIC USAGE on schema public',
  );
  assert.deepEqual(
    ['baseline:schema:public:usage:public', ...schemaEvents.map((event) => event.semantic)],
    ['baseline:schema:public:usage:public'],
    'schema public lifecycle and ACL statements must match the exact ordered final-state whitelist',
  );
  requirePattern(sql, /COMMENT ON FUNCTION public\.verified_deployment_completion_context\(uuid, uuid\) IS 'classification: INTERNAL/i, 'completion-context RPC classification');

  const status = functionBody(sql, 'verified_deployment_drain_status');
  requirePattern(sql, /FUNCTION public\.verified_deployment_drain_status\(\s*p_contract_version smallint\s*\)/i, 'server-clock-only drain signature');
  requirePattern(sql, /RETURNS TABLE \(\s*contract_version smallint,/i, 'drain contract identity');
  requirePattern(status, /SELECT control\.contract_version, control\.starts_enabled,/i, 'drain contract identity projection');
  if (/\bp_now\b/i.test(status)) fail('drain readiness must not accept or use a caller-owned clock');
  requirePattern(status, /COALESCE\((?:control\.)?last_started_at \+ interval '30 minutes', (?:control\.)?disabled_at\)/i, 'authoritative safe_after calculation');
  requirePattern(status, /count\(\*\)[^;]*(?:deployment\.)?status = 'active'[^;]*(?:deployment\.)?expires_at > v_now/i, 'unexpired-session count');

  const summary = functionBody(sql, 'verified_progression_summary');
  requirePattern(summary, /p_user_id IS NULL/i, 'non-null summary identity validation');
  requirePattern(summary, /count\(\*\)::bigint/i, 'bounded verified match aggregate');
  requirePattern(summary, /count\(\*\) FILTER \(WHERE result\.won\)::bigint/i, 'bounded verified win aggregate');
  requirePattern(summary, /COALESCE\(sum\(result\.verified_xp\), 0\)::bigint/i, 'server-derived verified XP aggregate');
  requirePattern(summary, /WHERE result\.user_id = p_user_id/i, 'Auth-derived aggregate ownership scope');
  requirePattern(sql, /COMMENT ON FUNCTION public\.verified_progression_summary\(uuid\) IS 'classification: INTERNAL/i, 'aggregate RPC classification');

  const transcriptValidator = functionBody(sql, 'is_valid_verified_transcript');
  requirePattern(transcriptValidator, /IF p_transcript IS NULL OR jsonb_typeof\(p_transcript\) <> 'array' THEN RETURN false; END IF; IF jsonb_array_length\(p_transcript\) NOT BETWEEN 1 AND 6 THEN RETURN false; END IF;/i, 'type-safe null and array-length validation order');
  requirePattern(transcriptValidator, /v_angle numeric; v_power numeric;/i, 'overflow-safe integer-bound parsing');
  requirePattern(transcriptValidator, /v_angle := \(v_entry ->> 'angle'\)::numeric; v_power := \(v_entry ->> 'power'\)::numeric;/i, 'overflow-safe numeric casts');
  requirePattern(transcriptValidator, /SELECT count\(\*\) INTO v_key_count FROM pg_catalog\.jsonb_object_keys\(v_entry\)/i, 'supported exact transcript key count');
  requirePattern(transcriptValidator, /v_key_count <> 2/i, 'exact transcript entry keys');
  requirePattern(transcriptValidator, /v_angle NOT BETWEEN 0 AND 180/i, 'native integer angle bounds');
  requirePattern(transcriptValidator, /v_power NOT BETWEEN 0 AND 100/i, 'native integer power bounds');

  return { start, abandon, complete, completionContext, status, summary };
}

class ContractModel {
  constructor() {
    this.enabled = false;
    this.disabledAt = 0;
    this.lastStartedAt = null;
    this.sessions = new Map();
    this.results = new Map();
  }

  setStarts(enabled, now) {
    this.enabled = enabled;
    if (!enabled) this.disabledAt = now;
  }

  start(userId, now, config) {
    const active = [...this.sessions.values()].find((row) => row.userId === userId && row.status === 'active');
    if (active && active.expiresAt > now) return { session: active, resumed: true };
    if (active) active.status = 'expired';
    if (!this.enabled) throw new Error('starts_disabled');
    const row = Object.freeze({ id: `session-${this.sessions.size + 1}`, userId, config, status: 'active', expiresAt: now + 30 });
    this.sessions.set(row.id, { ...row });
    this.lastStartedAt = now;
    return { session: this.sessions.get(row.id), resumed: false };
  }

  abandon(userId, sessionId, now) {
    const row = this.sessions.get(sessionId);
    if (!row || row.userId !== userId) throw new Error('not_found');
    if (row.status === 'abandoned') return row;
    if (row.status !== 'active' || row.expiresAt <= now) throw new Error('not_active');
    row.status = 'abandoned';
    return row;
  }

  complete(userId, sessionId, transcript, now) {
    const stored = this.results.get(sessionId);
    if (stored) {
      if (JSON.stringify(stored.transcript) !== JSON.stringify(transcript)) {
        throw new Error('completion_conflict');
      }
      return stored;
    }
    const row = this.sessions.get(sessionId);
    if (!row || row.userId !== userId || row.status !== 'active' || row.expiresAt <= now) throw new Error('not_completable');
    const priorResults = [...this.results.values()].filter((result) => result.userId === userId);
    const prior = Object.freeze({
      matches: priorResults.length,
      wins: priorResults.filter((result) => result.won).length,
      totalXp: priorResults.reduce((total, result) => total + result.verifiedXp, 0),
    });
    const current = Object.freeze({ matches: prior.matches + 1, wins: prior.wins + 1, totalXp: prior.totalXp + 200 });
    const result = Object.freeze({ sessionId, userId, transcript, won: true, outcome: 'win', verifiedXp: 200, prior, current, createdAt: now });
    this.results.set(sessionId, result);
    row.status = 'completed';
    return result;
  }

  completionContext(userId, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) throw new Error('not_found');
    const result = this.results.get(sessionId) ?? null;
    return {
      sessionId: session.id,
      userId: session.userId,
      config: session.config,
      status: session.status,
      expiresAt: session.expiresAt,
      transcript: result?.transcript ?? null,
      won: result?.won ?? null,
      outcome: result?.outcome ?? null,
      verifiedXp: result?.verifiedXp ?? null,
      prior: result?.prior ?? null,
      current: result?.current ?? null,
      resultCreatedAt: result?.createdAt ?? null,
    };
  }

  deleteAccount(userId) {
    const sessionIds = [...this.sessions.values()]
      .filter((row) => row.userId === userId)
      .map((row) => row.id);
    for (const sessionId of sessionIds) {
      this.results.delete(sessionId);
      this.sessions.delete(sessionId);
    }
  }

  drain(now) {
    const safeAfter = this.lastStartedAt === null ? this.disabledAt : this.lastStartedAt + 30;
    const unexpired = [...this.sessions.values()].filter((row) => row.status === 'active' && row.expiresAt > now).length;
    return { safeAfter, unexpired, ready: !this.enabled && now >= safeAfter && unexpired === 0 };
  }
}

function exerciseBehavior() {
  const model = new ContractModel();
  assert.throws(() => model.start('u1', 1, { seed: 17 }), /starts_disabled/);
  model.setStarts(true, 2);
  const firstStart = model.start('u1', 3, Object.freeze({ seed: 17 }));
  const first = firstStart.session;
  assert.equal(firstStart.resumed, false, 'new start must be authoritative false');
  const retry = model.start('u1', 4, { seed: 99 });
  assert.strictEqual(retry.session, first, 'repeat start must resume exact immutable descriptor');
  assert.equal(retry.resumed, true, 'active retry must be authoritative true');
  model.setStarts(false, 5);
  const disabledRetry = model.start('u1', 6, { seed: 42 });
  assert.strictEqual(disabledRetry.session, first, 'disabled starts must still resume active session');
  assert.equal(disabledRetry.resumed, true, 'disabled active retry must retain authoritative true');
  assert.throws(() => model.start('u2', 6, { seed: 42 }), /starts_disabled/);
  const abandoned = model.abandon('u1', first.id, 7);
  assert.strictEqual(model.abandon('u1', first.id, 8), abandoned, 'abandon retry must be idempotent');
  model.setStarts(true, 9);
  const second = model.start('u1', 10, Object.freeze({ seed: 42 })).session;
  const foreign = model.start('u2', 10, Object.freeze({ seed: 73 })).session;
  assert.deepEqual(model.completionContext('u1', second.id), {
    sessionId: second.id,
    userId: 'u1',
    config: second.config,
    status: 'active',
    expiresAt: second.expiresAt,
    transcript: null,
    won: null,
    outcome: null,
    verifiedXp: null,
    prior: null,
    current: null,
    resultCreatedAt: null,
  }, 'active completion context must expose one owner session with no result');
  assert.throws(() => model.completionContext('u1', foreign.id), /not_found/, 'foreign completion context must be generic not-found');
  const result = model.complete('u1', second.id, Object.freeze([{ angle: 45, power: 70 }]), 11);
  assert.deepEqual(model.completionContext('u1', second.id), {
    sessionId: second.id,
    userId: 'u1',
    config: second.config,
    status: 'completed',
    expiresAt: second.expiresAt,
    transcript: result.transcript,
    won: true,
    outcome: 'win',
    verifiedXp: 200,
    prior: { matches: 0, wins: 0, totalXp: 0 },
    current: { matches: 1, wins: 1, totalXp: 200 },
    resultCreatedAt: 11,
  }, 'completed context must expose the same immutable result for retry comparison');
  const retryReceipt = model.complete('u1', second.id, result.transcript, 12);
  assert.strictEqual(retryReceipt, result, 'same-evidence completion retry must return immutable stored result');
  const next = model.start('u1', 12, Object.freeze({ seed: 109 })).session;
  const nextResult = model.complete('u1', next.id, Object.freeze([{ angle: 60, power: 80 }]), 13);
  assert.deepEqual(nextResult.prior, result.current, 'same-account completion ordering must begin from the prior immutable current snapshot');
  assert.deepEqual(nextResult.current, { matches: 2, wins: 2, totalXp: 400 }, 'same-account completion ordering must advance exactly once');
  assert.strictEqual(model.complete('u1', second.id, result.transcript, 14), result, 'retry after another device award must preserve the original result-specific receipt');
  assert.throws(() => model.complete('u1', second.id, [], 12), /completion_conflict/, 'conflicting completion evidence must be rejected');
  assert.equal(model.results.size, 2, 'each distinct session must award once');
  model.setStarts(false, 14);
  assert.deepEqual(model.drain(39), { safeAfter: 42, unexpired: 1, ready: false });
  assert.deepEqual(model.drain(40), { safeAfter: 42, unexpired: 0, ready: false });
  assert.deepEqual(model.drain(42), { safeAfter: 42, unexpired: 0, ready: true });
  model.deleteAccount('u1');
  assert.equal([...model.sessions.values()].some((row) => row.userId === 'u1'), false, 'account deletion must erase owned sessions');
  assert.equal([...model.results.values()].some((row) => row.userId === 'u1'), false, 'account deletion must cascade immutable results');
  assert.equal([...model.sessions.values()].some((row) => row.userId === 'u2'), true, 'account deletion must preserve other accounts');
}

const acceptedMutations = [];

function expectRejected(sql, mutate, label) {
  const mutated = mutate(sql);
  assert.notEqual(mutated, sql, `${label} mutation must alter the migration fixture`);
  try {
    validateSql(mutated);
    acceptedMutations.push(label);
  } catch (error) {
    assert.ok(error instanceof Error, `${label} mutation rejection must throw an Error`);
  }
}

function assertHistoricalMigrationsUnchanged(cwd, files) {
  execFileSync('git', ['diff', '--exit-code', '--', ...files], { cwd, stdio: 'pipe' });
  execFileSync('git', ['diff', '--cached', '--exit-code', '--', ...files], { cwd, stdio: 'pipe' });
}

async function proveStagedHistoricalMutationRejected() {
  const fixture = await mkdtemp(join(tmpdir(), 'singedterra-migration-history-'));
  const relativePath = 'supabase/migrations/001_init.sql';
  try {
    await mkdir(join(fixture, 'supabase', 'migrations'), { recursive: true });
    execFileSync('git', ['init', '--quiet'], { cwd: fixture });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: fixture });
    execFileSync('git', ['config', 'user.email', 'migration-oracle@example.invalid'], { cwd: fixture });
    execFileSync('git', ['config', 'user.name', 'Migration Oracle'], { cwd: fixture });
    await writeFile(join(fixture, relativePath), 'SELECT 1;\n', 'utf8');
    execFileSync('git', ['add', '--', relativePath], { cwd: fixture });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: fixture });
    await writeFile(join(fixture, relativePath), 'SELECT 2;\n', 'utf8');
    execFileSync('git', ['add', '--', relativePath], { cwd: fixture });
    assert.throws(
      () => assertHistoricalMigrationsUnchanged(fixture, [relativePath]),
      /Command failed/,
      'staged historical migration edits must be rejected',
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

let migration;
try {
  migration = await readFile(migrationPath, 'utf8');
} catch (error) {
  if (error?.code === 'ENOENT') fail('migration 016 is absent');
  throw error;
}

const historicalMigrations = execFileSync('git', ['ls-files', 'supabase/migrations/*.sql'], { cwd: root, encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .filter((path) => /\/0(?:0[1-9]|1[0-5])_[^/]+\.sql$/.test(path));
assert.equal(historicalMigrations.length, 15, 'oracle must enumerate exactly the tracked migrations 001-015');
assertHistoricalMigrationsUnchanged(root, historicalMigrations);
await proveStagedHistoricalMutationRejected();

validateSql(migration);
exerciseBehavior();
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON FUNCTION public.complete_verified_deployment(uuid, uuid, jsonb, boolean, text, integer) TO authenticated;`, 'widened RPC grant');
expectRejected(migration, (sql) => sql.replace('session_id uuid PRIMARY KEY', 'session_id uuid'), 'removed result uniqueness');
expectRejected(migration, (sql) => sql.replace(/INSERT INTO public\.verified_match_results[\s\S]*?RETURNING \* INTO v_result;/i, 'SELECT NULL::public.verified_match_results INTO v_result;'), 'split result/status completion');
expectRejected(migration, (sql) => sql.replace('prior_verified_matches bigint NOT NULL', 'prior_verified_matches bigint'), 'nullable prior progression');
expectRejected(migration, (sql) => sql.replace('current_total_xp bigint NOT NULL', 'current_total_xp bigint'), 'nullable current progression');
expectRejected(migration, (sql) => sql.replace(`  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE result.won)::bigint,
    COALESCE(sum(result.verified_xp), 0)::bigint
  INTO v_prior_verified_matches, v_prior_verified_wins, v_prior_total_xp
  FROM public.verified_match_results AS result
  WHERE result.user_id = p_user_id;`, '  SELECT 0::bigint, 0::bigint, 0::bigint INTO v_prior_verified_matches, v_prior_verified_wins, v_prior_total_xp;'), 'non-authoritative progression snapshot');
expectRejected(migration, (sql) => sql.replace('v_prior_total_xp + p_verified_xp', 'v_prior_total_xp'), 'omitted XP progression delta');
expectRejected(migration, (sql) => sql.replace('v_prior_verified_matches + 1', 'v_prior_verified_matches'), 'omitted match progression delta');
expectRejected(migration, (sql) => sql.replace('ON DELETE CASCADE\n);', 'ON DELETE RESTRICT\n);'), 'blocked account erasure');
expectRejected(migration, (sql) => sql.replace(/,\s*resumed boolean\s*\)/i, '\n)'), 'omitted authoritative resumed field');
expectRejected(migration, (sql) => sql.replace(/(v_session\.updated_at,\s*)true;/i, '$1false;'), 'inverted active-resume flag');
expectRejected(migration, (sql) => sql.replace(/(v_session\.updated_at,\s*)false;/i, '$1true;'), 'inverted new-start flag');
expectRejected(migration, (sql) => sql.replace('AND deployment.user_id = p_user_id', ''), 'completion context missing owner predicate');
expectRejected(migration, (sql) => sql.replace(/(CREATE OR REPLACE FUNCTION public\.verified_deployment_completion_context[\s\S]*?BEGIN[\s\S]*?)(RETURN QUERY)/i, '$1UPDATE public.verified_deployments SET updated_at = now() WHERE id = p_session_id;\n  $2'), 'completion context write');
expectRejected(migration, (sql) => sql.replace('WHERE deployment.id = p_session_id\n    AND deployment.user_id = p_user_id;', 'WHERE deployment.id = p_session_id\n    AND deployment.user_id = p_user_id\n  FOR UPDATE;'), 'completion context lock');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON FUNCTION public.verified_deployment_completion_context(uuid, uuid) TO authenticated;`, 'widened completion-context grant');
expectRejected(migration, (sql) => sql.replace('WHERE deployment.id = p_session_id\n    AND deployment.user_id = p_user_id;', 'WHERE deployment.user_id = p_user_id;'), 'completion context duplicate or broad rows');
expectRejected(migration, (sql) => sql.replace('    deployment.contract_version,\n    deployment.engine_version,', '    1::smallint,\n    deployment.engine_version,'), 'completion context constant contract projection');
expectRejected(migration, (sql) => sql.replace(/(CREATE OR REPLACE FUNCTION public\.verified_deployment_completion_context[\s\S]*?IF p_user_id IS NULL OR p_session_id IS NULL THEN\s*)RAISE EXCEPTION 'verified_deployment_not_found'/i, "$1RAISE EXCEPTION 'verified_deployment_identity_missing'"), 'completion context distinct null-identity error');
expectRejected(migration, (sql) => sql.replace(/(CREATE OR REPLACE FUNCTION public\.verified_deployment_completion_context[\s\S]*?WHERE deployment\.id = p_session_id\s+AND deployment\.user_id = p_user_id;)/i, `$1

  RETURN QUERY
  SELECT
    deployment.id,
    deployment.user_id,
    deployment.config,
    deployment.contract_version,
    deployment.engine_version,
    deployment.ruleset_version,
    deployment.status,
    deployment.expires_at,
    result.transcript,
    result.won,
    result.outcome,
    result.verified_xp,
    result.created_at
  FROM public.verified_deployments AS deployment
  LEFT JOIN public.verified_match_results AS result
    ON result.session_id = deployment.id
    AND result.user_id = deployment.user_id
  WHERE deployment.user_id = p_user_id;`), 'completion context added account-wide duplicate read');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON FUNCTION public.verified_deployment_completion_context(uuid, uuid) TO authenticator;`, 'completion context authenticator grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON FUNCTION public.verified_deployment_completion_context(uuid,uuid) TO authenticator;`, 'completion context no-space signature authenticator grant');
expectRejected(migration, (sql) => `${sql}\nGRANT ALL PRIVILEGES ON FUNCTION public.verified_deployment_completion_context(uuid, uuid) TO authenticator;`, 'completion context all-privileges authenticator grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticator;`, 'public schema-wide function authenticator grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON ROUTINE public.verified_deployment_completion_context(uuid,uuid) TO authenticator;`, 'completion context routine authenticator grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticator;`, 'public schema-wide routine authenticator grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON FUNCTION "public"."verified_deployment_completion_context"(uuid,uuid) TO authenticator;`, 'quoted completion context function authenticator grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "public" TO authenticator;`, 'quoted public schema-wide function authenticator grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON ROUTINE public.verified_deployment_completion_context(pg_catalog.uuid, pg_catalog.uuid) TO authenticator;`, 'completion context pg_catalog-qualified signature grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON ROUTINE public.verified_deployment_completion_context("pg_catalog"."uuid", "pg_catalog"."uuid") TO authenticator;`, 'completion context quoted pg_catalog signature grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON ROUTINE public.verified_deployment_completion_context(IN uuid, IN uuid) TO authenticator;`, 'completion context IN-mode signature grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON ROUTINE public.verified_deployment_completion_context(p_user_id uuid, p_session_id uuid) TO authenticator;`, 'completion context named-argument signature grant');
expectRejected(migration, (sql) => `${sql}\nGRANT EXECUTE ON ROUTINE public.verified_deployment_completion_context(IN p_user_id uuid, IN p_session_id uuid) TO authenticator;`, 'completion context IN named-argument signature grant');
expectRejected(migration, (sql) => `${sql}\nGRANT service_role TO authenticator;`, 'transitive service-role membership grant');
expectRejected(migration, (sql) => `${sql}\nGRANT authenticator TO service_role;`, 'reverse service-role membership grant');
expectRejected(migration, (sql) => `${sql}\nGRANT service_role TO anon;`, 'service-role membership to another unapproved grantee');
expectRejected(migration, (sql) => sql.replace('GRANT EXECUTE ON FUNCTION public.verified_deployment_completion_context(uuid, uuid) TO service_role;', 'GRANT EXECUTE ON FUNCTION public.verified_deployment_completion_context(uuid, uuid) TO service_role WITH GRANT OPTION;'), 'delegable completion-context service-role grant');
expectRejected(migration, (sql) => `${sql}\nALTER FUNCTION public.verified_deployment_completion_context(uuid, uuid) OWNER TO authenticator;`, 'post-definition completion-context owner alteration');
expectRejected(migration, (sql) => `${sql}\nALTER ROUTINE public.verified_deployment_completion_context(uuid, uuid) SET search_path TO public;`, 'post-definition completion-context search-path alteration');
expectRejected(migration, (sql) => `${sql}\nREVOKE ALL ON FUNCTION public.verified_deployment_completion_context(uuid, uuid) FROM service_role;`, 'trailing completion-context service-role revoke');
expectRejected(migration, (sql) => `${sql}\nDROP FUNCTION public.verified_deployment_completion_context(uuid, uuid);`, 'protected completion-context drop');
expectRejected(migration, (sql) => `${sql}\nCREATE OR REPLACE FUNCTION public.verified_deployment_completion_context(p_user_id uuid, p_session_id uuid) RETURNS TABLE (session_id uuid, user_id uuid, config jsonb, contract_version smallint, engine_version smallint, ruleset_version smallint, status text, expires_at timestamptz, transcript jsonb, won boolean, outcome text, verified_xp integer, result_created_at timestamptz) LANGUAGE sql SECURITY DEFINER SET search_path = public AS 'SELECT NULL';`, 'second hostile completion-context replacement');
expectRejected(migration, (sql) => `${sql}\nDROP SCHEMA public CASCADE;`, 'protected public schema drop');
expectRejected(migration, (sql) => `${sql}\nALTER SCHEMA public RENAME TO retired_public;`, 'protected public schema rename');
expectRejected(migration, (sql) => `${sql}\nREVOKE USAGE ON SCHEMA public FROM PUBLIC;`, 'trailing public schema usage revoke');
expectRejected(migration, (sql) => `${sql}\nDO $hostile$ BEGIN EXECUTE 'ALTER FUNCTION public.verified_deployment_completion_context(uuid, uuid) OWNER TO authenticator'; END $hostile$;`, 'dynamic DO-block protected-routine owner alteration');
expectRejected(migration, (sql) => `${sql}\nREASSIGN OWNED BY service_role TO authenticator;`, 'service-role object reassignment');
expectRejected(migration, (sql) => `${sql}\nALTER TABLE public.verified_deployments RENAME TO retired_verified_deployments;`, 'protected verified-deployments table rename');
assert.deepEqual(acceptedMutations, [], `mutation matrix accepted hostile changes: ${acceptedMutations.join(', ')}`);

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
const npmCheckChain = `${packageJson.scripts?.precheck ?? ''} ${packageJson.scripts?.check ?? ''}`;
assert.match(npmCheckChain, /node scripts\/checks\/verified_deployment_migration\.mjs/);
assert.match(npmCheckChain, /node scripts\/checks\/verified_deployment_drain\.mjs/);

console.log('PASS: Verified Deployment migration enforces private atomic persistence, idempotency, and authoritative drain semantics.');
