// Contract check for the credential-safe Verified Deployment drain CLI.
// Run: node scripts/checks/verified_deployment_drain.mjs

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = join(root, 'scripts', 'verified-deployment-drain.mjs');

let source;
try {
  source = await readFile(cliPath, 'utf8');
} catch (error) {
  if (error?.code === 'ENOENT') throw new Error('Verified Deployment drain contract failed: CLI is absent');
  throw error;
}

for (const forbidden of [/console\.log\([^)]*(?:SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)/i, /process\.env\.(?:SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)[^\n]*console/i, /service_role[^\n]*console/i]) {
  assert.doesNotMatch(source, forbidden, 'CLI must never log service endpoint or credential');
}

const module = await import(`${pathToFileURL(cliPath).href}?oracle=${Date.now()}`);
assert.deepEqual(module.ROLLOUT_ORDER, ['migration', 'functions', 'client', 'enable-starts']);
assert.deepEqual(module.readiness({ starts_enabled: false, safe_after: '2026-08-11T12:00:00.000Z', unexpired_sessions: 0 }, Date.parse('2026-08-11T12:00:00.000Z')), { ready: true, reason: 'ready' });
assert.deepEqual(module.readiness({ starts_enabled: true, safe_after: '2026-08-11T12:00:00.000Z', unexpired_sessions: 0 }, Date.parse('2026-08-11T12:01:00.000Z')), { ready: false, reason: 'starts_enabled' });
assert.deepEqual(module.readiness({ starts_enabled: false, safe_after: '2026-08-11T12:02:00.000Z', unexpired_sessions: 0 }, Date.parse('2026-08-11T12:01:00.000Z')), { ready: false, reason: 'drain_window_open' });
assert.deepEqual(module.readiness({ starts_enabled: false, safe_after: '2026-08-11T12:00:00.000Z', unexpired_sessions: 1 }, Date.parse('2026-08-11T12:01:00.000Z')), { ready: false, reason: 'unexpired_sessions' });

const validStatus = Object.freeze({
  contract_version: 1,
  starts_enabled: false,
  disabled_at: '2026-08-11T11:00:00.000Z',
  last_started_at: '2026-08-11T11:30:00.000Z',
  safe_after: '2026-08-11T12:00:00.000Z',
  unexpired_sessions: 0,
});
const validDisabledControl = Object.freeze({
  contract_version: 1,
  starts_enabled: false,
  disabled_at: '2026-08-11T11:00:00.000Z',
  last_started_at: '2026-08-11T11:30:00.000Z',
  updated_at: '2026-08-11T11:00:00.000Z',
});
const validEnabledControl = Object.freeze({
  ...validDisabledControl,
  starts_enabled: true,
  updated_at: '2026-08-11T12:01:00.000Z',
});

function responseSequence(payloads, calls = []) {
  const queue = [...payloads];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.ok(queue.length > 0, 'fixture must provide one payload per RPC');
      return new Response(JSON.stringify(queue.shift()), { status: 200 });
    },
  };
}

async function invoke(command, payloads) {
  const transport = responseSequence(payloads);
  const output = [];
  await module.run([command], {
    env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-secret' },
    fetchImpl: transport.fetchImpl,
    now: () => Date.parse('2026-08-11T12:01:00.000Z'),
    write: (line) => output.push(line),
  });
  return { ...transport, output };
}

async function rejects(command, payloads, pattern, label) {
  await assert.rejects(() => invoke(command, payloads), pattern, label);
}

const statusRun = await invoke('status', [[validStatus]]);
assert.equal(statusRun.calls.length, 1);
assert.equal(statusRun.calls[0].options.headers.Authorization, 'Bearer fixture-secret');
assert.ok(statusRun.output.every((line) => !line.includes('fixture.invalid') && !line.includes('fixture-secret')), 'output must be credential-safe');
await invoke('disable', [[validDisabledControl], [validStatus]]);
await invoke('enable', [[validStatus], [validEnabledControl]]);

for (const command of ['status', 'disable', 'enable']) {
  await rejects(command, [[]], /rpc_shape_invalid/, `${command} must reject an empty response`);
  const firstValid = command === 'status' || command === 'enable' ? validStatus : validDisabledControl;
  await rejects(command, [[firstValid, firstValid]], /rpc_shape_invalid/, `${command} must reject a multi-row response`);
  await rejects(command, [[{ ...firstValid, contract_version: '1' }]], /rpc_shape_invalid/, `${command} must reject malformed field types`);
}

await rejects('status', [[{ ...validStatus, contract_version: 2 }]], /rpc_contract_mismatch/, 'status must reject a contradictory contract');
await rejects('disable', [[{ ...validDisabledControl, starts_enabled: true }]], /rpc_state_mismatch/, 'disable must reject an enabled control response');

const disableStatusCases = [
  { payload: [], pattern: /rpc_shape_invalid/, label: 'empty' },
  { payload: [validStatus, validStatus], pattern: /rpc_shape_invalid/, label: 'multi-row' },
  { payload: [{ ...validStatus, contract_version: '1' }], pattern: /rpc_shape_invalid/, label: 'malformed' },
  { payload: [{ ...validStatus, contract_version: 2 }], pattern: /rpc_contract_mismatch/, label: 'contract-wrong' },
  { payload: [{ ...validStatus, starts_enabled: true }], pattern: /rpc_state_mismatch/, label: 'status-wrong' },
];
for (const testCase of disableStatusCases) {
  await rejects('disable', [[validDisabledControl], testCase.payload], testCase.pattern, `disable must reject ${testCase.label} drain status after valid control mutation`);
}

const enableControlCases = [
  { payload: [], pattern: /rpc_shape_invalid/, label: 'empty' },
  { payload: [validEnabledControl, validEnabledControl], pattern: /rpc_shape_invalid/, label: 'multi-row' },
  { payload: [{ ...validEnabledControl, contract_version: '1' }], pattern: /rpc_shape_invalid/, label: 'malformed' },
  { payload: [{ ...validEnabledControl, contract_version: 2 }], pattern: /rpc_contract_mismatch/, label: 'contract-wrong' },
  { payload: [{ ...validEnabledControl, starts_enabled: false }], pattern: /rpc_state_mismatch/, label: 'state-wrong' },
];
for (const testCase of enableControlCases) {
  await rejects('enable', [[validStatus], testCase.payload], testCase.pattern, `enable must reject ${testCase.label} control response after valid drain status`);
}

console.log('PASS: Verified Deployment drain CLI is credential-safe and refuses unsafe rollout readiness.');
