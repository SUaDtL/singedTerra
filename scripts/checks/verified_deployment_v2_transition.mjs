import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERIFIED_DEPLOYMENT_V2_ROLLOUT, run as runV2Operator } from '../verified-deployment-v2-rollout.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migration = await readFile(join(root, 'supabase', 'migrations', '017_verified_deployment_v2.sql'), 'utf8');

assert.deepEqual(VERIFIED_DEPLOYMENT_V2_ROLLOUT.from, { contract: 1, engine: 1, ruleset: 3 });
assert.deepEqual(VERIFIED_DEPLOYMENT_V2_ROLLOUT.to, { contract: 2, engine: 2, ruleset: 4 });
assert.deepEqual(VERIFIED_DEPLOYMENT_V2_ROLLOUT.order, [
  'disable-v1-starts', 'wait-v1-safe-after-and-zero-unexpired', 'apply-017-v2-disabled',
  'deploy-v2-functions-and-probe', 'hosted-v2-replay-proof', 'deploy-strict-v2-client',
  'enable-v2-starts', 'production-v2-retry-proof',
]);
assert.deepEqual(VERIFIED_DEPLOYMENT_V2_ROLLOUT.edgeFunctions, [
  'create_room', 'join_room', 'submit_action', 'restart_game',
  'start_verified_deployment', 'abandon_verified_deployment',
  'complete_verified_deployment', 'account_summary', 'verified_replay_probe',
]);
assert.match(migration, /CHECK \(\s*\(contract_version = 1 AND engine_version = 1 AND ruleset_version = 3\)\s*OR \(contract_version = 2 AND engine_version = 2 AND ruleset_version = 4\)/s);
assert.match(migration, /VALUES \(2, false, now\(\)\)/);
assert.match(migration, /verified_deployment_legacy_drain_active/);
assert.match(migration, /v_session\.contract_version <> 2/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.abandon_verified_deployment/);
assert.match(migration, /v_session\.contract_version NOT IN \(1, 2\)/);
assert.match(migration, /p_contract_version NOT IN \(1, 2\)/);
assert.match(migration, /p_contract_version = 1 AND p_starts_enabled\s+THEN RAISE EXCEPTION 'verified_deployment_legacy_reenable_forbidden'/s);
assert.match(migration, /v_v1\.starts_enabled OR v_now < v_safe_after OR v_unexpired <> 0/);
const v2Start = migration.indexOf('CREATE OR REPLACE FUNCTION public.start_verified_deployment');
const v2StartBody = migration.slice(v2Start, migration.indexOf('CREATE OR REPLACE FUNCTION public.abandon_verified_deployment'));
assert.ok(
  v2StartBody.indexOf("WHERE user_id = p_user_id AND status = 'active' FOR UPDATE")
    < v2StartBody.indexOf("IF NOT FOUND OR NOT v_starts_enabled THEN"),
  'an existing V2 session must resume before disabled starts reject only new admissions',
);

const statusKeys = ['contract_version', 'starts_enabled', 'disabled_at', 'last_started_at', 'safe_after', 'unexpired_sessions'];
const v1Drained = { contract_version: 1, starts_enabled: false, disabled_at: '2026-08-15T12:00:00Z', last_started_at: '2026-08-15T12:00:00Z', safe_after: '2026-08-15T12:30:00Z', unexpired_sessions: 0 };
const v2Disabled = { ...v1Drained, contract_version: 2 };
const v2Enabled = { ...v2Disabled, starts_enabled: true };
const v2Control = { contract_version: 2, starts_enabled: true, disabled_at: '2026-08-15T12:00:00Z', last_started_at: null, updated_at: '2026-08-15T12:31:00Z' };

async function invokeV2(command, rows, now) {
  const calls = [];
  const output = [];
  await runV2Operator([command], {
    env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const body = JSON.parse(options.body);
      const payload = rows.shift();
      assert.ok(payload, 'fixture must supply every RPC response');
      return new Response(JSON.stringify(payload), { status: 200 });
    },
    write: (line) => output.push(line),
    now,
  });
  return { calls, output };
}

async function rejectedEnableV2(rows, now, expected = /enable_refused_v1_drain_incomplete/) {
  const calls = [];
  await assert.rejects(() => runV2Operator(['enable'], {
    env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const payload = rows.shift();
      return new Response(JSON.stringify(payload), { status: 200 });
    },
    now,
  }), expected);
  return calls;
}

const v2StatusRun = await invokeV2('status', [[v1Drained], [v2Disabled]]);
assert.deepEqual(v2StatusRun.calls.map((call) => JSON.parse(call.options.body)), [
  { p_contract_version: 1 }, { p_contract_version: 2 },
]);
assert.ok(v2StatusRun.output.every((line) => !line.includes('fixture-secret') && !line.includes('fixture.invalid')));

const v2EnableRun = await invokeV2('enable', [[v1Drained], [v2Disabled], [v2Control]], () => Date.parse('2026-08-15T12:31:00Z'));
assert.deepEqual(v2EnableRun.calls.map((call) => JSON.parse(call.options.body)), [
  { p_contract_version: 1 }, { p_contract_version: 2 }, { p_contract_version: 2, p_starts_enabled: true },
]);

const prematureCalls = await rejectedEnableV2([[v1Drained], [v2Disabled], [v2Control]], () => Date.parse('2026-08-15T12:29:59Z'));
assert.equal(prematureCalls.length, 2, 'the operator must refuse before it can call the V2 enable RPC');
await rejectedEnableV2([[{ ...v1Drained, safe_after: 'not-a-date' }], [v2Disabled]], () => Date.parse('2026-08-15T12:31:00Z'), /rpc_shape_invalid/);
await rejectedEnableV2([[{ ...v1Drained, safe_after: 0 }], [v2Disabled]], () => Date.parse('2026-08-15T12:31:00Z'), /rpc_shape_invalid/);

for (const [label, v1, v2] of [
  ['V1 enabled', { ...v1Drained, starts_enabled: true }, v2Disabled],
  ['V1 unexpired', { ...v1Drained, unexpired_sessions: 1 }, v2Disabled],
  ['V2 already enabled', v1Drained, v2Enabled],
]) {
  await assert.rejects(() => invokeV2('enable', [[v1], [v2]]), /enable_refused_v1_drain_incomplete/, label);
}
await assert.rejects(() => invokeV2('status', [[], [v2Disabled]]), /rpc_shape_invalid/);
await assert.rejects(() => invokeV2('status', [[{ ...v1Drained, extra: true }], [v2Disabled]]), /rpc_shape_invalid/);
await assert.rejects(() => invokeV2('status', [[v1Drained, v1Drained], [v2Disabled]]), /rpc_shape_invalid/);
assert.deepEqual(Object.keys(v1Drained).sort(), statusKeys.sort());
console.log('verified deployment V2 transition: PASS');
