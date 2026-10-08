import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA256 = /^[0-9a-f]{64}$/;
const FILE = /^(?:Build|TemplateData)\/[A-Za-z0-9_.-]+$/;
const REQUIRED = ['.loader.js', '.framework.js', '.data', '.wasm'];

function fail(message) { throw new Error(`Last Stand payload: ${message}`); }
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export function verifyLastStandPayload(root) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(root, 'asset-manifest.json'), 'utf8')); }
  catch { fail('manifest missing or invalid'); }
  if (manifest?.schema !== 'singedterra-last-stand-web/v1'
      || !SHA256.test(manifest?.wrapperSha256 ?? '')
      || !SHA256.test(manifest?.source?.receiptSha256 ?? '')
      || !SHA256.test(manifest?.source?.originalIndexSha256 ?? '')
      || !/^Web-[A-Za-z0-9-]+$/.test(manifest?.source?.build ?? '')
      || !manifest.files || Array.isArray(manifest.files)
      || typeof manifest.files !== 'object') fail('manifest contract invalid');

  const expected = Object.keys(manifest.files).sort();
  if (expected.length < REQUIRED.length || expected.some((name) => !FILE.test(name))) {
    fail('runtime file inventory invalid');
  }
  for (const suffix of REQUIRED) {
    if (expected.filter((name) => name.startsWith('Build/') && name.endsWith(suffix)).length !== 1) {
      fail(`expected one ${suffix} runtime file`);
    }
  }
  for (const name of expected) {
    if (!SHA256.test(manifest.files[name])) fail(`invalid digest: ${name}`);
    let bytes;
    try {
      const path = join(root, ...name.split('/'));
      if (!lstatSync(path).isFile()) fail(`missing regular file: ${name}`);
      bytes = readFileSync(path);
    } catch { fail(`missing runtime file: ${name}`); }
    if (digest(bytes) !== manifest.files[name]) fail(`digest mismatch: ${name}`);
  }

  let wrapper;
  try { wrapper = readFileSync(join(root, 'index.html')); }
  catch { fail('wrapper missing'); }
  if (digest(wrapper) !== manifest.wrapperSha256) fail('wrapper digest mismatch');
  const html = wrapper.toString('utf8');
  if (!html.includes('id="last-stand-return" href="../#campaigns/last-stand"')
      || !html.includes('Return to Campaigns') || !html.includes('id="retry"')) {
    fail('return and retry controls missing');
  }

  const actual = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const name = relative(root, path).split(sep).join('/');
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) actual.push(name);
      else fail(`non-regular asset: ${name}`);
    }
  }
  walk(root);
  const inventory = [...expected, 'asset-manifest.json', 'index.html'].sort();
  if (JSON.stringify(actual.sort()) !== JSON.stringify(inventory)) fail('file inventory differs from manifest');
  return { files: expected.length, sourceBuild: manifest.source.build };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const root = process.argv[2] ? resolve(process.argv[2])
    : resolve(dirname(thisFile), '../../client/public/last-stand');
  const result = verifyLastStandPayload(root);
  process.stdout.write(`Last Stand payload verified: ${result.files} export assets from ${result.sourceBuild}\n`);
}
