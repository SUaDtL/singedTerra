// Admit current available sources against one locally inspected complete export pin.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

const ROOTS = ['Unity/Assets', 'Unity/ProjectSettings', 'Unity/Packages'];
const TOOLS = ['Tools/build_web.py', 'Tools/unity_shader_log.py', 'Tools/unity_build_resources.py'];
const WRAPPER = ['Tools/make_web_entry.py', 'Tools/web-index-template.html'];
const VENDOR = 'Unity/Packages/com.unity.render-pipelines.universal';
const SHA = /^[0-9a-f]{64}$/;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ordered = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
// Recorded order is part of the Python export digest (Windows Path sorting is case-insensitive).
const mapHash = (value) => sha(JSON.stringify(value));
function fail(message) { throw new Error(`Last Stand source: ${message}`); }
function regular(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) fail(`non-regular input: ${path}`);
  return readFileSync(path);
}
export function portableEntry(bytes) {
  try {
    const text = decoder.decode(bytes);
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text)) throw new Error('binary');
    return { mode: 'lf-text', sha256: sha(text.replace(/\r\n|\r/g, '\n')) };
  } catch { return { mode: 'raw', sha256: sha(bytes) }; }
}
function readJson(path, label) {
  try { return JSON.parse(regular(path).toString('utf8')); }
  catch { fail(`${label} missing or invalid`); }
}
function validateMap(files, label) {
  if (!files || Array.isArray(files) || typeof files !== 'object' || !Object.keys(files).length) fail(`${label} inventory invalid`);
  for (const [name, entry] of Object.entries(files)) {
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some((part) => !part || part === '.' || part === '..')
        || !entry || !['raw', 'lf-text'].includes(entry.mode) || !SHA.test(entry.sha256 ?? '')
        || JSON.stringify(Object.keys(entry).sort()) !== '["mode","sha256"]') fail(`${label} inventory entry invalid: ${name}`);
  }
}
export function collectLastStandSources(repo) {
  const root = join(repo, 'campaign-unity');
  const files = {};
  function walk(dir) {
    const info = lstatSync(dir);
    if (!info.isDirectory() || info.isSymbolicLink()) fail(`non-regular source directory: ${dir}`);
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) walk(path);
      else {
        const name = relative(root, path).split(sep).join('/');
        files[name] = portableEntry(regular(path));
      }
    }
  }
  for (const folder of ROOTS) walk(join(root, folder));
  for (const name of TOOLS) files[name] = portableEntry(regular(join(root, name)));
  return ordered(files);
}

export function verifyLastStandSource(repo, payloadRoot = join(repo, 'client/public/last-stand')) {
  const docs = join(repo, 'campaign-unity/docs/last-stand-web');
  const lockPath = join(docs, 'source-lock.json');
  const receiptPath = join(docs, 'receipt-sanitized.json');
  const lock = readJson(lockPath, 'source lock');
  const receipt = readJson(receiptPath, 'fresh receipt');
  const manifest = readJson(join(payloadRoot, 'asset-manifest.json'), 'payload manifest');
  if (lock.schema !== 'singedterra-last-stand-source/v2' || lock.complete !== true
      || receipt.schema !== 'singedterra-last-stand-export/v2' || receipt.complete !== true || receipt.status !== 'pass'
      || receipt.scene !== 'Assets/Scenes/LastStandPrototype.unity') fail('fresh complete source receipt required');
  if (sha(regular(lockPath)) !== manifest.source?.sourceLockSha256
      || sha(regular(receiptPath)) !== lock.receiptSha256 || lock.receiptSha256 !== manifest.source?.receiptSha256
      || manifest.source?.receipt !== 'campaign-unity/docs/last-stand-web/receipt-sanitized.json') fail('source lock or receipt pin differs');
  const closure = lock.closure;
  if (JSON.stringify(closure?.roots) !== JSON.stringify(ROOTS) || JSON.stringify(closure?.explicitFiles) !== JSON.stringify(TOOLS)) fail('source closure policy differs');
  validateMap(closure.files, 'source');
  if (closure.sha256 !== mapHash(closure.files) || manifest.source?.sourceInventorySha256 !== closure.sha256
      || receipt.sourceBeforeSha256 !== closure.sha256 || receipt.sourceAfterSha256 !== closure.sha256
      || JSON.stringify(ordered(receipt.sourceFiles ?? {})) !== JSON.stringify(ordered(closure.files))) fail('source receipt closure differs');
  validateMap(lock.toolchain?.files, 'toolchain');
  if (lock.toolchain.sha256 !== mapHash(lock.toolchain.files) || lock.toolchain.editorVersion !== '6000.3.27f2' || lock.toolchain.urpVersion !== '17.3.0'
      || JSON.stringify(receipt.toolchain) !== JSON.stringify(lock.toolchain)) fail('toolchain pin differs');
  const vendorFiles = Object.fromEntries(Object.entries(closure.files).filter(([name]) => name.startsWith(`${VENDOR}/`)));
  if (lock.vendor?.path !== VENDOR || lock.vendor?.version !== '17.3.0' || Object.keys(vendorFiles).length < 2
      || !vendorFiles[`${VENDOR}/package.json`] || lock.vendor.sha256 !== mapHash(vendorFiles)) fail('complete vendor pin missing or changed');
  const actual = collectLastStandSources(repo);
  const vendorPresent = existsSync(join(repo, 'campaign-unity', VENDOR));
  const availableExpected = vendorPresent ? closure.files : Object.fromEntries(Object.entries(closure.files).filter(([name]) => !name.startsWith(`${VENDOR}/`)));
  if (JSON.stringify(actual) !== JSON.stringify(ordered(availableExpected))) fail('current source inventory differs from export closure');
  validateMap(lock.wrapperFiles, 'wrapper');
  if (JSON.stringify(Object.keys(lock.wrapperFiles).sort()) !== JSON.stringify([...WRAPPER].sort())
      || JSON.stringify(receipt.wrapperFiles) !== JSON.stringify(lock.wrapperFiles)) fail('wrapper input inventory differs');
  const currentWrapper = manifest.wrapperFiles ?? lock.wrapperFiles;
  validateMap(currentWrapper, 'current wrapper');
  if (JSON.stringify(Object.keys(currentWrapper).sort()) !== JSON.stringify([...WRAPPER].sort())) fail('current wrapper policy differs');
  for (const name of WRAPPER) {
    if (JSON.stringify(portableEntry(regular(join(repo, 'campaign-unity', name)))) !== JSON.stringify(currentWrapper[name])) fail(`wrapper source differs: ${name}`);
  }
  return { lock, receipt, manifest, files: Object.keys(actual).length,
    vendor: vendorPresent ? 'inspected-present-bytes' : 'absent: admitted by verified complete export pin; bytes not inspected here',
    toolchain: 'retained local before/after pin; external toolchain bytes not inspected by this admission' };
}
const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const repo = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(thisFile), '../..');
  const result = verifyLastStandSource(repo);
  process.stdout.write(`Last Stand source verified: ${result.files} available inputs; vendor ${result.vendor}; ${result.toolchain}\n`);
}
