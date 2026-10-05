import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyLastStandPayload } from './verify-last-stand.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'last-stand-payload-'));
  const html = '<a id="last-stand-return" href="../#campaigns/last-stand">Return to Campaigns</a><a id="retry" href="">Retry</a>';
  mkdirSync(join(root, 'Build'));
  writeFileSync(join(root, 'index.html'), html);
  const files = {};
  for (const suffix of ['loader.js', 'framework.js', 'data', 'wasm']) {
    const name = `Build/game.${suffix}`;
    const bytes = Buffer.from(`verified ${suffix}`);
    writeFileSync(join(root, name), bytes);
    files[name] = sha(bytes);
  }
  writeFileSync(join(root, 'asset-manifest.json'), JSON.stringify({
    schema: 'singedterra-last-stand-web/v1',
    source: { build: 'Web-fixture', receiptSha256: 'a'.repeat(64), originalIndexSha256: 'b'.repeat(64) },
    wrapperSha256: sha(html),
    files,
  }));
  return { root, files };
}

test('verified Last Stand payload accepts its exact assets', () => {
  const { root } = fixture();
  try { assert.equal(verifyLastStandPayload(root).files, 4); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test('verified Last Stand payload rejects missing and corrupted runtime bytes', () => {
  const { root } = fixture();
  try {
    writeFileSync(join(root, 'Build/game.wasm'), 'tampered');
    assert.throws(() => verifyLastStandPayload(root), /digest/i);
    rmSync(join(root, 'Build/game.wasm'));
    assert.throws(() => verifyLastStandPayload(root), /missing/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('verified Last Stand payload rejects a changed return route', () => {
  const { root } = fixture();
  try {
    writeFileSync(join(root, 'index.html'), '<a href="../">Return</a>');
    assert.throws(() => verifyLastStandPayload(root), /wrapper|return/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
