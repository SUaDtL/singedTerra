import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseObservation, assessObservation, inspectLocalBinding, sqlFor, run } from './verified-challenge-rollout.mjs';

const now = Date.parse('2026-09-13T12:00:00.000Z');
const observedAt = '2026-09-13T12:00:00.000000Z';
const base = () => ({
  schemaVersion: 1, editionId: 'cq1', observedAt, controlRows: 1, startsEnabled: false,
  unexpiredSessions: 0, unexpiredAccounts: 0, expiredActiveSessions: 0,
  maxSessionExpiresAt: null, cq1Workers: 0, cq1WriteLeases: 0, allEndpointWorkers: 0,
  bindingMismatches: 0, maxUncertainUntil: null, safeAfter: observedAt,
});

test('a fresh disabled empty observation reports only observed drain, never enablement or worker death proof', () => {
  const parsed = parseObservation(base());
  assert.ok(Object.isFrozen(parsed));
  assert.deepEqual(assessObservation(parsed, now), {
    schemaVersion: 1, editionId: 'cq1', observedAt, startsEnabled: false,
    observedDrained: true, reasons: [], safeAfter: observedAt,
    enablementReady: false, runtimeIdentity: 'not-proven', workerTermination: 'not-proven',
  });
});

test('drain checks admission, live sessions, account bindings and uncertain workers independently', () => {
  const later = '2026-09-13T12:30:00.000000Z';
  for (const [patch, reason] of [
    [{ startsEnabled: true }, 'starts_enabled'],
    [{ unexpiredSessions: 1, unexpiredAccounts: 1, maxSessionExpiresAt: later, safeAfter: later }, 'active_sessions'],
    [{ cq1Workers: 1, allEndpointWorkers: 1, maxUncertainUntil: later, safeAfter: later }, 'worker_cooldown'],
    [{ bindingMismatches: 1, cq1Workers: 1, allEndpointWorkers: 1, maxUncertainUntil: later, safeAfter: later }, 'binding_mismatch'],
  ]) {
    const result = assessObservation({ ...base(), ...patch }, now);
    assert.equal(result.observedDrained, false);
    assert.ok(result.reasons.includes(reason));
    assert.equal(result.enablementReady, false);
  }
  // Expired write authority is not worker completion. A 410-second cooldown still blocks drain.
  const cooldown = assessObservation({ ...base(), cq1Workers: 1, cq1WriteLeases: 0,
    allEndpointWorkers: 1, maxUncertainUntil: later, safeAfter: later }, now);
  assert.equal(cooldown.observedDrained, false);
  // Legacy-only workers are reported separately and are not cq1 session evidence.
  assert.equal(assessObservation({ ...base(), allEndpointWorkers: 4, expiredActiveSessions: 2 }, now).observedDrained, true);
});

test('stale or future snapshots cannot establish drain readiness', () => {
  assert.deepEqual(assessObservation(base(), now + 60_001).reasons, ['observation_stale']);
  assert.deepEqual(assessObservation(base(), now - 5_001).reasons, ['observation_in_future']);
});

test('observation parser rejects missing, extra, coerced, inconsistent and foreign evidence', () => {
  const mutations = [
    (v) => { delete v.controlRows; }, (v) => { v.credential = 'do-not-print'; },
    (v) => { v.editionId = 'cq2'; }, (v) => { v.schemaVersion = 2; },
    (v) => { v.controlRows = 0; }, (v) => { v.startsEnabled = 'false'; },
    (v) => { v.unexpiredSessions = -1; }, (v) => { v.cq1Workers = 0.5; },
    (v) => { v.unexpiredAccounts = 1; }, (v) => { v.cq1WriteLeases = 1; },
    (v) => { v.cq1Workers = 1; }, (v) => { v.observedAt = '2026-02-30T12:00:00.000000Z'; },
    (v) => { v.safeAfter = '2026-09-13T11:00:00.000000Z'; },
    (v) => { v.maxSessionExpiresAt = observedAt; },
    (v) => { v.maxUncertainUntil = '2026-09-13T12:00:00.000001Z'; },
  ];
  for (const mutate of mutations) {
    const value = base(); mutate(value);
    assert.throws(() => parseObservation(value), /invalid_rollout_observation/);
  }
  for (const value of [null, [], Object.assign(Object.create({ inherited: true }), base())])
    assert.throws(() => parseObservation(value), /invalid_rollout_observation/);
});

test('SQL output uses only actual migration controls and never executes them', () => {
  const status = sqlFor('status');
  assert.match(status, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(status, /s\.id = l\.session_id AND s\.account_id = l\.account_id/);
  assert.match(status, /uncertain_until > n\.at/);
  assert.match(status, /public\.verified_challenge_controls/);
  assert.doesNotMatch(status, /set_verified_challenge_starts|UPDATE |DELETE |INSERT /);
  assert.match(sqlFor('disable'), /set_verified_challenge_starts\('cq1', false\)/);
  assert.match(sqlFor('enable'), /set_verified_challenge_starts\('cq1', true\)/);
  assert.throws(() => sqlFor('enable; DROP TABLE'), /invalid_rollout_command/);
  const lines = [];
  run(['sql', 'enable'], { write: (line) => lines.push(line) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /PRINT ONLY/);
});

test('local binding uses the existing validated manifest and distinguishes working bytes from a release', () => {
  const binding = inspectLocalBinding();
  assert.match(binding.sourceSha, /^[0-9a-f]{40}$/);
  assert.equal(typeof binding.sourceTreeClean, 'boolean');
  assert.match(binding.manifestSha256, /^[0-9a-f]{64}$/);
  assert.equal(binding.functions, 22);
  assert.equal(binding.migrations, 24);
  assert.equal(binding.enablementReady, false);
  assert.equal(binding.runtimeIdentity, 'not-proven');
  assert.equal(binding.scope, 'local-release-inputs');
});

test('CLI rejects execution aliases, extra arguments and invalid files without leaking their contents', () => {
  const script = fileURLToPath(new URL('./verified-challenge-rollout.mjs', import.meta.url));
  for (const args of [['enable'], ['sql', 'enable', 'execute'], ['inspect', 'extra'], ['assess']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'ERROR: verified_challenge_rollout_refused');
  }
  const output = execFileSync(process.execPath, [script, 'sql', 'disable'], { encoding: 'utf8' });
  assert.match(output, /PRINT ONLY/);
  const directory = mkdtempSync(join(tmpdir(), 'cq1-rollout-parser-'));
  try {
    const file = join(directory, 'observation.json');
    for (const contents of [
      JSON.stringify({ ...base(), credential: 'DO_NOT_DISCLOSE' }),
      '{"credential":"DO_NOT_DISCLOSE",',
      Buffer.from([0xff, 0xfe]),
      'DO_NOT_DISCLOSE'.repeat(4096),
    ]) {
      writeFileSync(file, contents);
      const refused = spawnSync(process.execPath, [script, 'assess', file], { encoding: 'utf8' });
      assert.equal(refused.status, 1);
      assert.equal(refused.stdout, '');
      assert.equal(refused.stderr.trim(), 'ERROR: verified_challenge_rollout_refused');
    }
  } finally { rmSync(directory, { recursive: true }); }
});
