/** Reviewed operator path for a one-way V1 -> V2 verified-deployment cutover. */
export const VERIFIED_DEPLOYMENT_V2_ROLLOUT = Object.freeze({
  from: Object.freeze({ contract: 1, engine: 1, ruleset: 3 }),
  to: Object.freeze({ contract: 2, engine: 2, ruleset: 4 }),
  drainTtlMinutes: 30,
  edgeFunctions: Object.freeze([
    'create_room', 'join_room', 'submit_action', 'restart_game',
    'start_verified_deployment', 'abandon_verified_deployment',
    'complete_verified_deployment', 'account_summary', 'verified_replay_probe',
  ]),
  order: Object.freeze([
    'disable-v1-starts', 'wait-v1-safe-after-and-zero-unexpired', 'apply-017-v2-disabled',
    'deploy-v2-functions-and-probe', 'hosted-v2-replay-proof', 'deploy-strict-v2-client',
    'enable-v2-starts', 'production-v2-retry-proof',
  ]),
});

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every((key) => key in value)) throw new Error('rpc_shape_invalid');
}

function environment(env) {
  const baseUrl = env.SUPABASE_URL?.replace(/\/+$/, '');
  const credential = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !credential) throw new Error('required_environment_missing');
  return { baseUrl, credential };
}

async function rpc(name, body, dependencies) {
  const { baseUrl, credential } = environment(dependencies.env);
  const response = await dependencies.fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { Authorization: `Bearer ${credential}`, apikey: credential, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`rpc_failed_${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('rpc_shape_invalid');
  return rows[0];
}

function statusRow(row, version) {
  exact(row, ['contract_version', 'starts_enabled', 'disabled_at', 'last_started_at', 'safe_after', 'unexpired_sessions']);
  if (row.contract_version !== version || typeof row.starts_enabled !== 'boolean'
    || typeof row.disabled_at !== 'string' || (row.last_started_at !== null && typeof row.last_started_at !== 'string')
    || typeof row.safe_after !== 'string' || !Number.isSafeInteger(row.unexpired_sessions) || row.unexpired_sessions < 0) throw new Error('rpc_shape_invalid');
  return row;
}

export async function run(argv, options = {}) {
  const [command, ...extra] = argv;
  if (extra.length || !['status', 'enable'].includes(command)) throw new Error('usage: verified-deployment-v2-rollout <status|enable>');
  const dependencies = { env: options.env ?? process.env, fetchImpl: options.fetchImpl ?? globalThis.fetch, write: options.write ?? console.log };
  const v1 = statusRow(await rpc('verified_deployment_drain_status', { p_contract_version: 1 }, dependencies), 1);
  const v2 = statusRow(await rpc('verified_deployment_drain_status', { p_contract_version: 2 }, dependencies), 2);
  if (command === 'status') return dependencies.write(JSON.stringify({ v1, v2, rollout: VERIFIED_DEPLOYMENT_V2_ROLLOUT.order }));
  const safeAfter = Date.parse(v1.safe_after);
  const now = typeof options.now === 'function' ? options.now() : (options.now ?? Date.now());
  if (!Number.isFinite(safeAfter) || !Number.isFinite(now)) throw new Error('rpc_shape_invalid');
  if (v1.starts_enabled || now < safeAfter || v1.unexpired_sessions !== 0 || v2.starts_enabled) throw new Error('enable_refused_v1_drain_incomplete');
  const control = await rpc('set_verified_deployment_starts', { p_contract_version: 2, p_starts_enabled: true }, dependencies);
  exact(control, ['contract_version', 'starts_enabled', 'disabled_at', 'last_started_at', 'updated_at']);
  if (control.contract_version !== 2 || control.starts_enabled !== true) throw new Error('rpc_state_mismatch');
  dependencies.write(JSON.stringify({ contractVersion: 2, startsEnabled: true }));
}

const invoked = process.argv[1] ? new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href : '';
if (import.meta.url === invoked) run(process.argv.slice(2)).catch((error) => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
