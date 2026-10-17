import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { bindConfiguredRejoinFixture, routeLastStandRequest } from '../../e2e/helpers/lastStandJourney.mjs';

const origin = 'https://configured-parent.invalid';
const query = '?select=id%2Ccode%2Cseed%2Coptions%2Cplayers%2Cstatus%2Cabandoned_at&id=eq.room-rejoin-fixture';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
// Generated inert format fixture, never a real credential or authenticated JWT.
const legacy = (role = 'anon', header = { alg: 'HS256', typ: 'JWT' }, extra = {}) =>
  [encode(header), encode({ iss: 'supabase', ref: 'local-fixture', role, iat: 1, exp: 2, ...extra }),
    Buffer.alloc(32, 1).toString('base64url')].join('.');
const initializer = key => `var sb=createClient(\`${origin}\`,\`${key}\`);export{sb as supabase};`;

async function parent(source, run, { drift = false } = {}) {
  const graph = { schema: 'singedterra-browser-bundle-graph/v1', base: '/singedTerra/', chunks: [{
    fileName: 'assets/supabase-fixture.js', facadeModuleId: 'client/src/lib/supabase.ts',
    modules: ['client/src/lib/supabase.ts'],
    sha256: drift ? '0'.repeat(64) : createHash('sha256').update(source).digest('hex'),
  }] };
  const server = createServer((request, response) => {
    if (request.url === '/singedTerra/battle-console-bundle-graph.json') response.end(JSON.stringify(graph));
    else if (request.url === '/singedTerra/assets/supabase-fixture.js') response.end(source);
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  try { await run(new URL(`http://127.0.0.1:${server.address().port}/singedTerra/`)); }
  finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
}
function route(url, method = 'GET') {
  const effects = [];
  return { effects, request: () => ({ url: () => url, method: () => method }),
    fulfill: async response => effects.push(['fulfill', response]),
    continue: async () => effects.push(['continue']), abort: async reason => effects.push(['abort', reason]) };
}

test('legacy anon initializer admits only its source-bound rejoin GET', async () => {
  const key = legacy();
  await parent(initializer(key), async base => {
    const rejoinBinding = await bindConfiguredRejoinFixture(base);
    assert.deepEqual(Object.keys(rejoinBinding), [], 'Capability exposes no key, claims or configurable origin');
    assert.ok(!JSON.stringify(rejoinBinding).includes(key));
    const allowed = route(origin + '/rest/v1/rooms' + query);
    await routeLastStandRequest(allowed, base, { rejoin: true, rejoinBinding });
    assert.equal(allowed.effects.length, 1);
    assert.equal(allowed.effects[0][0], 'fulfill');
    assert.equal(JSON.parse(allowed.effects[0][1].body).id, 'room-rejoin-fixture');
    for (const [url, method, state] of [
      [origin + '/rest/v1/rooms' + query, 'POST', { rejoin: true, rejoinBinding }],
      ['https://outside.invalid/rest/v1/rooms' + query, 'GET', { rejoin: true, rejoinBinding }],
      [origin + '/rest/v1/rooms' + query + '&extra=1', 'GET', { rejoin: true, rejoinBinding }],
      [origin + '/rest/v1/rooms' + query, 'GET', { rejoin: false, rejoinBinding }],
      [origin + '/rest/v1/rooms' + query, 'GET', { rejoin: true, rejoinBinding: {} }],
      [origin + '/functions/v1/account_summary', 'GET', { rejoin: true, rejoinBinding }],
    ]) {
      const denied = route(url, method);
      await assert.rejects(routeLastStandRequest(denied, base, state));
      assert.deepEqual(denied.effects, []);
    }
  });
});

test('legacy public classification refuses private, user and malformed keys', async () => {
  for (const key of [legacy('service_role'), legacy('authenticated'), legacy('ANON'),
    legacy('anon', { alg: 'none', typ: 'JWT' }), legacy('anon', { alg: 'HS256', typ: 'other' }),
    legacy('anon', undefined, { iss: 'other' }), 'sb_secret_inert_fixture',
    'not-json.not-json.not-json', legacy().replace(/\.[^.]+$/, '.'),
    legacy().replaceAll('.', '..'),
    ...[31, 33].map(length => legacy().replace(/\.[^.]+$/, '.' + Buffer.alloc(length, 1).toString('base64url'))),
    legacy().slice(0, -1) + 'F', // Same decoded signature bytes, noncanonical unused bits.
    ...[null, [], 1, 'anon'].map(header => legacy('anon', header)),
    ...[null, [], 1, 'anon'].map(claims => [encode({ alg: 'HS256', typ: 'JWT' }), encode(claims),
      Buffer.alloc(32, 1).toString('base64url')].join('.')),
    'e2e-public-anon-key']) {
    await parent(initializer(key), base => assert.rejects(bindConfiguredRejoinFixture(base)));
  }
  await parent(initializer(legacy()), base => assert.rejects(bindConfiguredRejoinFixture(base)), { drift: true });
});

test('existing publishable key initializer remains source-bound', async () => {
  await parent(initializer('sb_publishable_inert_fixture'), async base => {
    const rejoinBinding = await bindConfiguredRejoinFixture(base);
    const allowed = route(origin + '/rest/v1/rooms' + query);
    await routeLastStandRequest(allowed, base, { rejoin: true, rejoinBinding });
    assert.equal(allowed.effects[0]?.[0], 'fulfill');
  });
});
