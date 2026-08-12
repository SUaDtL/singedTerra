#!/usr/bin/env node

// Operational manifest: backend replay semantics must exist before a strict
// client is published, and starts remain disabled until both are verified.
export const ROLLOUT_ORDER = Object.freeze([
  'migration',
  'functions',
  'client',
  'enable-starts',
]);

const CONTRACT_VERSION = 1;

export function readiness(status, now = Date.now()) {
  if (status?.starts_enabled !== false) {
    return { ready: false, reason: 'starts_enabled' };
  }
  if (!Number.isInteger(status?.unexpired_sessions) || status.unexpired_sessions !== 0) {
    return { ready: false, reason: 'unexpired_sessions' };
  }
  const safeAfter = Date.parse(status?.safe_after ?? '');
  if (!Number.isFinite(safeAfter)) {
    return { ready: false, reason: 'invalid_status' };
  }
  if (now < safeAfter) {
    return { ready: false, reason: 'drain_window_open' };
  }
  return { ready: true, reason: 'ready' };
}

function environment(env) {
  const baseUrl = env.SUPABASE_URL?.replace(/\/+$/, '');
  const credential = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !credential) throw new Error('required_environment_missing');
  return { baseUrl, credential };
}

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('rpc_shape_invalid');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('rpc_shape_invalid');
  }
}

function timestamp(value, nullable = false) {
  return (nullable && value === null)
    || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function validateControl(row, expectedStartsEnabled) {
  exactObject(row, ['contract_version', 'starts_enabled', 'disabled_at', 'last_started_at', 'updated_at']);
  if (!Number.isSafeInteger(row.contract_version)
    || typeof row.starts_enabled !== 'boolean'
    || !timestamp(row.disabled_at)
    || !timestamp(row.last_started_at, true)
    || !timestamp(row.updated_at)) {
    throw new Error('rpc_shape_invalid');
  }
  if (row.contract_version !== CONTRACT_VERSION) throw new Error('rpc_contract_mismatch');
  if (row.starts_enabled !== expectedStartsEnabled) throw new Error('rpc_state_mismatch');
  return row;
}

function validateStatus(row, expectedStartsEnabled) {
  exactObject(row, ['contract_version', 'starts_enabled', 'disabled_at', 'last_started_at', 'safe_after', 'unexpired_sessions']);
  if (!Number.isSafeInteger(row.contract_version)
    || typeof row.starts_enabled !== 'boolean'
    || !timestamp(row.disabled_at)
    || !timestamp(row.last_started_at, true)
    || !timestamp(row.safe_after)
    || !Number.isSafeInteger(row.unexpired_sessions)
    || row.unexpired_sessions < 0) {
    throw new Error('rpc_shape_invalid');
  }
  if (row.contract_version !== CONTRACT_VERSION) throw new Error('rpc_contract_mismatch');
  if (expectedStartsEnabled !== undefined && row.starts_enabled !== expectedStartsEnabled) {
    throw new Error('rpc_state_mismatch');
  }
  return row;
}

async function rpc(name, body, dependencies, validate) {
  const { baseUrl, credential } = environment(dependencies.env);
  const response = await dependencies.fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      apikey: credential,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`rpc_failed_${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length !== 1) throw new Error('rpc_shape_invalid');
  return validate(payload[0]);
}

function publicStatus(row, now) {
  const normalized = {
    contract_version: row.contract_version,
    starts_enabled: row.starts_enabled,
    disabled_at: row.disabled_at ?? null,
    last_started_at: row.last_started_at ?? null,
    safe_after: row.safe_after ?? null,
    unexpired_sessions: Number(row.unexpired_sessions),
  };
  return {
    contractVersion: row.contract_version,
    rolloutOrder: ROLLOUT_ORDER,
    ...normalized,
    readiness: readiness(normalized, now),
  };
}

async function status(dependencies, expectedStartsEnabled) {
  return rpc('verified_deployment_drain_status', {
    p_contract_version: CONTRACT_VERSION,
  }, dependencies, (row) => validateStatus(row, expectedStartsEnabled));
}

export async function run(argv, options = {}) {
  const dependencies = {
    env: options.env ?? process.env,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    now: options.now ?? Date.now,
    write: options.write ?? ((line) => console.log(line)),
  };
  const [command, ...extra] = argv;
  if (extra.length > 0 || !['disable', 'status', 'enable'].includes(command)) {
    throw new Error('usage: verified-deployment-drain <disable|status|enable>');
  }

  if (command === 'disable') {
    await rpc('set_verified_deployment_starts', {
      p_contract_version: CONTRACT_VERSION,
      p_starts_enabled: false,
    }, dependencies, (row) => validateControl(row, false));
    const row = await status(dependencies, false);
    dependencies.write(JSON.stringify(publicStatus(row, dependencies.now())));
    return;
  }

  const row = await status(dependencies);
  if (command === 'status') {
    dependencies.write(JSON.stringify(publicStatus(row, dependencies.now())));
    return;
  }

  const decision = readiness({
    ...row,
    unexpired_sessions: Number(row.unexpired_sessions),
  }, dependencies.now());
  if (!decision.ready) throw new Error(`enable_refused_${decision.reason}`);
  const control = await rpc('set_verified_deployment_starts', {
    p_contract_version: CONTRACT_VERSION,
    p_starts_enabled: true,
  }, dependencies, (row) => validateControl(row, true));
  dependencies.write(JSON.stringify({
    contractVersion: control.contract_version,
    starts_enabled: control.starts_enabled,
    rolloutOrder: ROLLOUT_ORDER,
  }));
}

const invokedPath = process.argv[1] ? new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href : '';
if (import.meta.url === invokedPath) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(`ERROR: ${error instanceof Error ? error.message : 'operation_failed'}`);
    process.exitCode = 1;
  });
}
