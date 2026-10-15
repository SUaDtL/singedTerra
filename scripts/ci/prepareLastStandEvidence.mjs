import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Admission deliberately requires an existing real directory. Initialize only
// this checkout's fixed CI evidence root, validating each parent before a write.
const root = resolve(import.meta.dirname, '../..');
assert.equal(realpathSync(root), root, 'Repository resolved containment failed');
let parent = root;
for (const part of ['campaign-unity', 'Evidence', 'last-stand-playable-loop', 't06']) {
  const path = join(parent, part);
  if (part !== 'campaign-unity' && !existsSync(path)) mkdirSync(path);
  const stat = lstatSync(path);
  assert.ok(!stat.isSymbolicLink(), 'Evidence setup refuses symbolic links');
  assert.ok(stat.isDirectory(), 'Evidence setup requires directories');
  assert.equal(realpathSync(path), path, 'Evidence setup resolved containment failed');
  parent = path;
}
