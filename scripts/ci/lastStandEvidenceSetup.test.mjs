import {LAST_STAND_HELPER_INPUTS} from '../../e2e/helpers/lastStandJourney.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const setupPath = 'scripts/ci/prepareLastStandEvidence.mjs';
const evidencePath = 'campaign-unity/Evidence/last-stand-playable-loop/t06';
const consumers = { scope: 'scripts/ci/ciWorkflow.test.mjs', browser: 'test e2e/last-stand-playable-loop.spec.ts' };

function job(source, id) {
  const found = source.match(new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [A-Za-z_][A-Za-z0-9_-]*:|$)`));
  assert.ok(found, `Missing ${id} job`);
  return found[1];
}

function fixture(t) {
  const fixtureBase = realpathSync(process.env.ST_LAST_STAND_SETUP_FIXTURES || tmpdir());
  const owned = mkdtempSync(join(fixtureBase, 'st-ls-ci-setup-'));
  const checkout = join(owned, 'checkout');
  mkdirSync(join(checkout, 'campaign-unity'), { recursive: true });
  mkdirSync(join(checkout, 'scripts/ci'), { recursive: true });
  if (existsSync(join(root, setupPath))) copyFileSync(join(root, setupPath), join(checkout, setupPath));
  const outside = join(owned, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'sentinel'), 'unchanged');
  t.after(() => {
    const actual = realpathSync(owned);
    const below = relative(fixtureBase, actual);
    assert.equal(actual, owned);
    assert.ok(below && !isAbsolute(below) && !below.startsWith('..') && dirname(actual) === fixtureBase);
    rmSync(actual, { recursive: true });
  });
  return { owned, checkout, outside };
}

function copyAdmissionInputs(checkout) {
  // Import the real admission module with its complete code and data closure.
  // Setup-only containment cases retain their empty campaign tree.
  for (const path of [...LAST_STAND_HELPER_INPUTS,'e2e/helpers/lastStandJourney.mjs', 'e2e/helpers/lastStandMatrix.mjs',
    'e2e/helpers/lastStandWaveOracle.mjs','e2e/helpers/lastStandTierJourney.mjs','e2e/helpers/lastStandControlReveal.mjs', 'scripts/assets/verify-last-stand-source.mjs',
    'campaign-unity/Tools/contracts/last-stand-observation-v1.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v2.json',
    'campaign-unity/Tools/contracts/last-stand-observation-v3.json']) {
    mkdirSync(dirname(join(checkout, path)), { recursive: true });
    copyFileSync(join(root, path), join(checkout, path));
  }
}

function execute(checkout, args, cwd = checkout) {
  const env = { ...process.env };
  delete env.ST_SHOP_EVIDENCE_ROOT;
  delete env.LAST_STAND_EVIDENCE_PARENT;
  return spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout: 10_000 });
}

function setupBeforeConsumer(source, id, checkout) {
  const body = job(source, id);
  const consumer = body.indexOf(consumers[id]);
  assert.ok(consumer >= 0, `Missing ${id} consumer`);
  const steps = [...body.matchAll(/      - [\s\S]*?(?=\n      - |$)/g)];
  for (const step of steps) {
    if (step.index >= consumer || !step[0].includes(`run: node ${setupPath}`)) continue;
    assert.doesNotMatch(step[0], /continue-on-error:|working-directory:|env:|shell:/);
    if (id === 'scope') assert.doesNotMatch(step[0], /\n        if:/);
    else assert.match(step[0], /\n        if: matrix\.suite == 'campaigns' \|\| matrix\.suite == 'tier'\n/);
    const command = step[0].match(/\n        run: node ([^\n]+)\s*$/);
    assert.equal(command?.[1], setupPath, 'Execute only the fixed checked-in setup command');
    const result = execute(checkout, [join(checkout, command[1])]);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  }
}

function admission(checkout, candidate = join(checkout, evidencePath)) {
  const code = "import {admitEvidenceParent} from './e2e/helpers/lastStandJourney.mjs'; console.log(admitEvidenceParent(process.argv[1]));";
  return execute(checkout, ['--input-type=module', '--eval', code, candidate]);
}

function assertAdmitted(checkout) {
  const result = admission(checkout);
  assert.equal(result.status, 0, `Actual unchanged admission must succeed after CI setup:\n${result.stderr}`);
  assert.equal(result.stdout.trim(), join(checkout, evidencePath));
}

test('clean checkout initializes Last Stand evidence before guards and journey', async t => {
  for (const id of Object.keys(consumers)) await t.test(id, t => {
    const { checkout, outside } = fixture(t);
    assert.deepEqual(readdirSync(join(checkout, 'campaign-unity')), []);
    assert.equal(existsSync(join(checkout, evidencePath)), false);
    copyAdmissionInputs(checkout);
    setupBeforeConsumer(workflow, id, checkout);
    assertAdmitted(checkout);
    writeFileSync(join(checkout, evidencePath, 'retained'), 'preserve existing evidence');
    setupBeforeConsumer(workflow, id, checkout);
    assertAdmitted(checkout);
    assert.equal(readFileSync(join(checkout, evidencePath, 'retained'), 'utf8'), 'preserve existing evidence');
    assert.deepEqual(readdirSync(outside), ['sentinel']);
    assert.equal(readFileSync(join(outside, 'sentinel'), 'utf8'), 'unchanged');
  });
});

test('setup is fixed to its resolved checkout and rejects symlink components before outside writes', async t => {
  for (const component of ['campaign-unity', 'campaign-unity/Evidence',
    'campaign-unity/Evidence/last-stand-playable-loop', evidencePath]) await t.test(component, t => {
    const { checkout, outside } = fixture(t);
    const link = join(checkout, component);
    // The only pre-existing component in this fresh fixture is an empty campaign directory.
    if (existsSync(link)) {
      assert.equal(link, join(checkout, 'campaign-unity'));
      assert.deepEqual(readdirSync(link), []);
      rmdirSync(link);
    }
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    const result = execute(checkout, [join(checkout, setupPath)], outside);
    assert.notEqual(result.status, 0, 'A linked component must fail setup');
    assert.match(result.stderr, /resolved|symbolic|symlink/i);
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.deepEqual(readdirSync(outside), ['sentinel']);
    assert.equal(readFileSync(join(outside, 'sentinel'), 'utf8'), 'unchanged');
  });
});

test('prepared evidence keeps the unchanged lexical and resolved escape guards', t => {
  const { checkout, outside } = fixture(t);
  copyAdmissionInputs(checkout);
  const setup = execute(checkout, [join(checkout, setupPath)], outside);
  assert.equal(setup.status, 0, setup.stderr);
  assertAdmitted(checkout);
  const parentEscape = admission(checkout, dirname(join(checkout, evidencePath)));
  assert.notEqual(parentEscape.status, 0);
  assert.match(parentEscape.stderr, /Evidence parent escaped task root/);
  const link = join(checkout, evidencePath, 'escape');
  symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  const resolvedEscape = admission(checkout, join(link, 'child'));
  assert.notEqual(resolvedEscape.status, 0);
  assert.match(resolvedEscape.stderr, /Evidence resolved containment escaped task root/);
  assert.deepEqual(readdirSync(outside), ['sentinel']);
  assert.equal(readFileSync(join(outside, 'sentinel'), 'utf8'), 'unchanged');
});

test('setup rejects a regular file at the final evidence component without changing retained bytes', t => {
  const { checkout, outside } = fixture(t);
  const finalComponent = join(checkout, evidencePath);
  const retained = Buffer.from('retain existing non-directory evidence\n');
  mkdirSync(dirname(finalComponent), { recursive: true });
  writeFileSync(finalComponent, retained);
  const result = execute(checkout, [join(checkout, setupPath)], outside);
  assert.notEqual(result.status, 0, 'A regular file at t06 must fail setup');
  assert.match(result.stderr, /Evidence setup requires directories/);
  assert.ok(lstatSync(finalComponent).isFile());
  assert.deepEqual(readFileSync(finalComponent), retained);
  assert.deepEqual(readdirSync(outside), ['sentinel']);
  assert.equal(readFileSync(join(outside, 'sentinel'), 'utf8'), 'unchanged');
});
