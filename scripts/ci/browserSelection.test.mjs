import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const workflow=readFileSync('.github/workflows/ci.yml','utf8');
const cli=['node_modules/@playwright/test/cli.js','test','e2e/last-stand-playable-loop.spec.ts',
  '--project=desktop-fine','--list','--reporter=json'];
function selected(extra=[]) {
  const run=spawnSync(process.execPath,[...cli,...extra],{encoding:'utf8',timeout:30_000});
  assert.equal(run.status,0,'Actual Playwright selector must find its journey: '+run.stderr);
  const titles=[];
  const visit=s=>{for(const spec of s.specs??[])for(const t of spec.tests)titles.push(spec.title);
    for(const child of s.suites??[])visit(child);};
  for(const suite of JSON.parse(run.stdout).suites)visit(suite);
  return titles;
}
test('actual CI grep arguments select each maintained journey exactly once', () => {
  const expected=[['Last Stand wave checkpoint journey','Last Stand earned waves and complete checkpoints survive reload'],
    ['Last Stand shared Campaigns journey','Last Stand Campaigns journey preserves no-award exit and a stronger redeploy']];
  const union=[];
  for(const [step,title] of expected) {
    const block=workflow.slice(workflow.indexOf(`      - name: ${step}`)).split('\n      - ')[0];
    const grep=block.match(/--grep "([^"]+)"/)?.[1];
    assert.ok(grep,'Actual workflow grep argument required');
    const cases=selected(['--grep',grep]);assert.deepEqual(cases,[title]);union.push(...cases);
  }
  assert.deepEqual(union.sort(),selected().sort(),'Every maintained journey must have exactly one lane');
});
