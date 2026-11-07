import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readSecurityPolicy } from './context_policy.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'singedterra-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = '.codearbiter/context/security-controls.html';
  const output = join(root, 'scripts/checks/fixtures/security-controls-policy.json');
  await mkdir(join(root, '.codearbiter/context'), { recursive: true });
  await mkdir(join(root, 'scripts/checks/fixtures'), { recursive: true });
  const bytes = '<!doctype html>opaque native document bytes\n';
  await writeFile(join(root, sourcePath), bytes);
  const receipt = {
    schema: 'singedterra.security-policy-export/v1',
    artifactId: 'CTX-SECURITY-CONTROLS',
    source: { path: sourcePath, sha256: createHash('sha256').update(bytes).digest('hex') },
    modelSha256: 'a'.repeat(64),
    records: [{ id: 'POLICY-TEST', statement: 'Non-awarding boundary.' }],
  };
  const save = () => writeFile(output, JSON.stringify(receipt));
  await save();
  return { root, receipt, save, sourcePath };
}

test('reads a source-bound policy projection without parsing native HTML', async (t) => {
  const { root } = await fixture(t);
  assert.equal(await readSecurityPolicy(root), 'Non-awarding boundary.');
});

test('rejects changed native bytes before using exported policy statements', async (t) => {
  const { root, sourcePath } = await fixture(t);
  await writeFile(join(root, sourcePath), 'changed');
  await assert.rejects(readSecurityPolicy(root), /Stale native security-policy projection/);
});

test('rejects alternate paths, empty policy and duplicate records', async (t) => {
  const { root, receipt, save, sourcePath } = await fixture(t);
  receipt.source.path = '../other-policy.html';
  await save();
  await assert.rejects(readSecurityPolicy(root), /Invalid native security-policy projection/);
  receipt.source.path = sourcePath;
  const record = receipt.records[0];
  receipt.records = [];
  await save();
  await assert.rejects(readSecurityPolicy(root), /Invalid native security-policy projection/);
  receipt.records = [record, record];
  await save();
  await assert.rejects(readSecurityPolicy(root), /Invalid or duplicate/);
});
