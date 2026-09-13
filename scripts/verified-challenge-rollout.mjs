#!/usr/bin/env node

// Offline operational preparation. No network client, credentials or SQL executor.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestFile, loadAndValidateManifest } from './ci/backendRelease.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_OBSERVATION_BYTES = 4096;
const KEYS = Object.freeze(['schemaVersion', 'editionId', 'observedAt', 'controlRows', 'startsEnabled',
  'unexpiredSessions', 'unexpiredAccounts', 'expiredActiveSessions', 'maxSessionExpiresAt',
  'cq1Workers', 'cq1WriteLeases', 'allEndpointWorkers', 'bindingMismatches', 'maxUncertainUntil', 'safeAfter']);
const COUNTS = Object.freeze(['controlRows', 'unexpiredSessions', 'unexpiredAccounts',
  'expiredActiveSessions', 'cq1Workers', 'cq1WriteLeases', 'allEndpointWorkers', 'bindingMismatches']);

function invalid() { throw new Error('invalid_rollout_observation'); }

function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) return false;
  const milliseconds = `${value.slice(0, 23)}Z`;
  const epoch = Date.parse(milliseconds);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === milliseconds;
}

/** Accept only the aggregate JSON produced by sqlFor('status'), never private rows. */
export function parseObservation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== KEYS.length || !KEYS.every((key) => Object.hasOwn(value, key))
    || value.schemaVersion !== 1 || value.editionId !== 'cq1' || typeof value.startsEnabled !== 'boolean'
    || COUNTS.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0)
    || value.controlRows !== 1 || !utc(value.observedAt) || !utc(value.safeAfter)) invalid();
  for (const [count, maximum] of [['unexpiredSessions', 'maxSessionExpiresAt'], ['cq1Workers', 'maxUncertainUntil']]) {
    if (value[count] === 0 ? value[maximum] !== null : !utc(value[maximum]) || value[maximum] <= value.observedAt) invalid();
  }
  if (value.unexpiredAccounts !== value.unexpiredSessions || value.cq1WriteLeases > value.cq1Workers
    || value.cq1Workers > value.allEndpointWorkers || value.bindingMismatches > value.cq1Workers) invalid();
  // Fixed-width UTC strings retain PostgreSQL microseconds when comparing deadlines.
  const expectedSafeAfter = [value.observedAt, value.maxSessionExpiresAt, value.maxUncertainUntil]
    .filter((time) => time !== null).sort().at(-1);
  if (value.safeAfter !== expectedSafeAfter) invalid();
  return Object.freeze(Object.fromEntries(KEYS.map((key) => [key, value[key]])));
}

/** A point-in-time database observation is neither deployed-code proof nor approval. */
export function assessObservation(value, now = Date.now()) {
  const observation = parseObservation(value);
  if (!Number.isFinite(now)) invalid();
  const age = now - Date.parse(observation.observedAt);
  const reasons = [];
  if (age > 60_000) reasons.push('observation_stale');
  if (age < -5_000) reasons.push('observation_in_future');
  if (observation.startsEnabled) reasons.push('starts_enabled');
  if (observation.unexpiredSessions > 0) reasons.push('active_sessions');
  if (observation.cq1Workers > 0) reasons.push('worker_cooldown');
  if (observation.bindingMismatches > 0) reasons.push('binding_mismatch');
  return Object.freeze({ schemaVersion: 1, editionId: 'cq1', observedAt: observation.observedAt,
    startsEnabled: observation.startsEnabled, observedDrained: reasons.length === 0,
    reasons: Object.freeze(reasons), safeAfter: observation.safeAfter,
    enablementReady: false, runtimeIdentity: 'not-proven', workerTermination: 'not-proven' });
}

export function inspectLocalBinding(repositoryRoot = ROOT) {
  const release = loadAndValidateManifest(repositoryRoot);
  if (release.manifest.functions.length !== 22 || release.manifest.migrations.length !== 24)
    throw new Error('unexpected_rollout_inventory');
  const git = (args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const sourceSha = git(['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('invalid_source_binding');
  return Object.freeze({ schemaVersion: 1, editionId: 'cq1', scope: 'local-release-inputs', sourceSha,
    sourceTreeClean: git(['status', '--porcelain', '--untracked-files=all']) === '',
    manifestSha256: release.manifestSha256, migrationSetSha256: release.migrationSetSha256,
    functionSetSha256: release.functionSetSha256, functions: 22, migrations: 24,
    retainedArtifactSha256: digestFile(join(repositoryRoot, 'shared/src/verified/retained/cq1.mjs')),
    enablementReady: false, runtimeIdentity: 'not-proven' });
}

/** Print these statements for an independently approved operator; never execute. */
export function sqlFor(command) {
  const banner = '-- PRINT ONLY. Execute only in the separately approved target database.\n';
  if (command === 'enable' || command === 'disable') return banner
    + `-- ${command === 'enable' ? 'Separate enablement approval and hosted evidence required.' : 'Stop new admissions; retain existing sessions, workers, artifacts and receipts.'}\n`
    + `SELECT public.set_verified_challenge_starts('cq1', ${command === 'enable' ? 'true' : 'false'});\n`;
  if (command !== 'status') throw new Error('invalid_rollout_command');
  return banner + `-- Run as the database owner: migration 024 denies direct table reads to service_role.
-- The query performs no lazy reconciliation and emits no account/session/worker IDs.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH observation_time AS MATERIALIZED (SELECT clock_timestamp() AS at),
control AS (
  SELECT count(*) AS rows, bool_or(starts_enabled) AS enabled
  FROM public.verified_challenge_controls WHERE edition_id = 'cq1'
), sessions AS (
  SELECT count(*) FILTER (WHERE status = 'active' AND expires_at > n.at) AS unexpired,
    count(DISTINCT account_id) FILTER (WHERE status = 'active' AND expires_at > n.at) AS accounts,
    count(*) FILTER (WHERE status = 'active' AND expires_at <= n.at) AS expired_active,
    max(expires_at) FILTER (WHERE status = 'active' AND expires_at > n.at) AS latest
  FROM public.verified_challenge_sessions CROSS JOIN observation_time n WHERE edition_id = 'cq1'
), workers AS (
  SELECT count(*) FILTER (WHERE l.endpoint = 'complete_verified_challenge') AS cq1,
    count(*) FILTER (WHERE l.endpoint = 'complete_verified_challenge' AND l.expires_at > n.at) AS writes,
    count(*) AS all_endpoints,
    count(*) FILTER (WHERE l.endpoint = 'complete_verified_challenge'
      AND (l.descriptor_binding IS DISTINCT FROM 'cq1' OR s.id IS NULL OR s.edition_id IS DISTINCT FROM 'cq1')) AS mismatches,
    max(l.uncertain_until) FILTER (WHERE l.endpoint = 'complete_verified_challenge') AS latest
  FROM public.verification_compute_leases l CROSS JOIN observation_time n
  LEFT JOIN public.verified_challenge_sessions s ON s.id = l.session_id AND s.account_id = l.account_id
  WHERE l.worker_id IS NOT NULL AND l.uncertain_until > n.at
)
SELECT jsonb_build_object(
  'schemaVersion', 1, 'editionId', 'cq1', 'observedAt', public.challenge_utc(n.at),
  'controlRows', c.rows, 'startsEnabled', c.enabled,
  'unexpiredSessions', s.unexpired, 'unexpiredAccounts', s.accounts, 'expiredActiveSessions', s.expired_active,
  'maxSessionExpiresAt', public.challenge_utc(s.latest), 'cq1Workers', w.cq1,
  'cq1WriteLeases', w.writes, 'allEndpointWorkers', w.all_endpoints, 'bindingMismatches', w.mismatches,
  'maxUncertainUntil', public.challenge_utc(w.latest),
  'safeAfter', public.challenge_utc(greatest(n.at, s.latest, w.latest))
) AS rollout_observation FROM observation_time n CROSS JOIN control c CROSS JOIN sessions s CROSS JOIN workers w;
COMMIT;
`;
}

export function run(argv, { write = console.log } = {}) {
  if (argv.length === 1 && argv[0] === 'inspect') return write(JSON.stringify(inspectLocalBinding()));
  if (argv.length === 2 && argv[0] === 'sql') return write(sqlFor(argv[1]));
  if (argv.length === 2 && argv[0] === 'assess') {
    const file = argv[1];
    if (statSync(file).size > MAX_OBSERVATION_BYTES) invalid();
    const bytes = readFileSync(file);
    if (bytes.length > MAX_OBSERVATION_BYTES) invalid();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return write(JSON.stringify(assessObservation(JSON.parse(text))));
  }
  throw new Error('invalid_rollout_command');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv.slice(2)); }
  catch { console.error('ERROR: verified_challenge_rollout_refused'); process.exitCode = 1; }
}
