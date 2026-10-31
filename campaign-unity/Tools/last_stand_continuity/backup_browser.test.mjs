// Execute the shipped jslib; these checks do not establish system-picker/browser permission acceptance.
// Run: node --test campaign-unity/Tools/last_stand_continuity/backup_browser.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../../Unity/Assets/Plugins/WebGL/LastStandBackup.jslib', import.meta.url), 'utf8');
const receiver = 'LastStandBackupTransport-1', filename = 'last-stand-backup-20261031-010203.laststand';
const documentBytes = Buffer.from('SINGED_TERRA_LAST_STAND_BACKUP 1\n{"label":"snowman ☃"}');
function fixture({ gesture = true, readError = false } = {}) {
  const library = {}, module = {}, messages = [], inputs = [], anchors = [], readers = [], blobs = [], revoked = [], timers = new Map();
  let nextTimer = 0;
  class Reader {
    constructor() { this.readyState = 0; readers.push(this); }
    readAsArrayBuffer(file) { this.readyState = 1; this.file = file; if (readError) this.onerror(); }
    complete(bytes = this.file.bytes) { this.readyState = 2; this.result = Uint8Array.from(bytes).buffer; this.onload(); }
    abort() { this.readyState = 2; this.aborted = true; this.onabort?.(); }
  }
  const makeElement = type => {
    const events = new Map();
    const element = { style: {}, files: [], clicks: 0, removed: false,
      addEventListener: (name, callback) => events.set(name, callback),
      dispatch: name => events.get(name)?.(),
      click() { this.clicks++; }, remove() { this.removed = true; } };
    (type === 'input' ? inputs : anchors).push(element); return element;
  };
  const context = {
    LibraryManager: { library }, Module: module, mergeInto: (target, values) => Object.assign(target, values),
    UTF8ToString: value => value, TextDecoder, Uint8Array, Blob, Number, FileReader: Reader,
    navigator: { userActivation: { isActive: gesture } }, document: { createElement: makeElement, body: { appendChild() {} } },
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:owned-' + blobs.length; }, revokeObjectURL: value => revoked.push(value) },
    atob: value => Buffer.from(value, 'base64').toString('binary'), btoa: value => Buffer.from(value, 'binary').toString('base64'),
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: id => timers.delete(id),
    SendMessage(owner, method, payload) { assert.equal(owner, receiver); assert.equal(method, 'BackupTransferCompleted'); messages.push(payload); },
  };
  vm.runInNewContext(source, context);
  context.STLastStandBackup = library.$STLastStandBackup;
  return { library, module, messages, inputs, anchors, readers, blobs, revoked, timers,
    select(bytes, size = bytes.length) { const input = inputs.at(-1); input.files = [{ bytes, size }]; input.dispatch('change'); },
    expire() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); } };
}

test('import reads exact UTF-8 bytes and cleans picker after one callback', () => {
  const f = fixture(); f.library.LastStandBackup_Import(receiver, 1); assert.equal(f.inputs[0].clicks, 1);
  f.select(documentBytes); f.readers[0].complete();
  assert.deepEqual(f.messages, ['1|ok|' + documentBytes.toString('base64')]);
  assert.equal(f.inputs[0].removed, true); assert.equal(f.timers.size, 0);
  f.readers[0].complete(); assert.equal(f.messages.length, 1);
});

test('oversized or empty selected files are refused before starting FileReader', () => {
  for (const size of [0, 131073, Infinity, NaN, -1]) {
    const f = fixture(); f.library.LastStandBackup_Import(receiver, 2); f.select(documentBytes, size);
    assert.deepEqual(f.messages, ['2|error|']); assert.equal(f.readers.length, 0);
  }
});

test('actual read bytes are bounded and malformed UTF-8 cannot be repaired silently', () => {
  for (const bytes of [Buffer.from([0xc3, 0x28]), Buffer.alloc(131073, 65)]) {
    const f = fixture(); f.library.LastStandBackup_Import(receiver, 3); f.select(bytes, 10); f.readers[0].complete();
    assert.deepEqual(f.messages, ['3|error|']);
  }
  const f = fixture(); f.library.LastStandBackup_Import(receiver, 4); f.select(Buffer.alloc(131072, 65)); f.readers[0].complete();
  assert.equal(Buffer.from(f.messages[0].split('|')[2], 'base64').length, 131072);
});

test('picker cancellation and timed-out reads settle without stale completion', () => {
  const f = fixture(); f.library.LastStandBackup_Import(receiver, 5); f.inputs[0].dispatch('cancel');
  f.library.LastStandBackup_Import(receiver, 6); f.select(documentBytes); f.expire(); f.readers[0].complete();
  assert.deepEqual(f.messages, ['5|cancel|', '6|error|']); assert.equal(f.readers[0].aborted, true);
});

test('explicit cancellation invalidates old callbacks and cannot cancel a newer request', () => {
  const f = fixture(); f.library.LastStandBackup_Import(receiver, 7); f.select(documentBytes);
  f.library.LastStandBackup_Cancel(receiver, 7); f.library.LastStandBackup_Import(receiver, 8);
  f.library.LastStandBackup_Cancel(receiver, 7); f.readers[0].complete();
  assert.deepEqual(f.messages, ['7|cancel|']); assert.equal(f.inputs[1].removed, false);
  f.inputs[1].dispatch('cancel'); assert.deepEqual(f.messages, ['7|cancel|', '8|cancel|']);
});

test('export creates byte-exact user download and releases its object URL', async () => {
  const f = fixture(); f.library.LastStandBackup_Export(receiver, 9, documentBytes.toString('base64'), filename);
  assert.deepEqual(Buffer.from(await f.blobs[0].arrayBuffer()), documentBytes);
  assert.equal(f.anchors[0].download, filename); assert.equal(f.anchors[0].clicks, 1); assert.equal(f.anchors[0].removed, true);
  assert.deepEqual(f.messages, ['9|ok|']); f.expire(); assert.deepEqual(f.revoked, ['blob:owned-1']);
});

test('file actions require user activation and reject invalid exported data and names', () => {
  const noGesture = fixture({ gesture: false }); noGesture.library.LastStandBackup_Import(receiver, 10);
  noGesture.library.LastStandBackup_Export(receiver, 11, documentBytes.toString('base64'), filename);
  assert.deepEqual(noGesture.messages, ['10|error|', '11|error|']); assert.equal(noGesture.inputs.length + noGesture.blobs.length, 0);
  for (const [data, name] of [['AB==', filename], ['////', filename], ['A'.repeat(174768), filename], [documentBytes.toString('base64'), '../profile']]) {
    const f = fixture(); f.library.LastStandBackup_Export(receiver, 12, data, name);
    assert.deepEqual(f.messages, ['12|error|']); assert.equal(f.blobs.length, 0);
  }
});

test('a second picker cannot steal the active request; read errors stay generic', () => {
  const f = fixture({ readError: true }); f.library.LastStandBackup_Import(receiver, 13);
  f.library.LastStandBackup_Import(receiver, 14); assert.equal(f.inputs.length, 1);
  f.select(documentBytes); assert.deepEqual(f.messages, ['14|error|', '13|error|']);
});

test('predecessor writes require the same browser writer lease as gameplay', () => {
  const storageSource = fs.readFileSync(new URL('../../Unity/Assets/Plugins/WebGL/LastStandStorage.jslib', import.meta.url), 'utf8');
  const library = {}, writes = [], window = { __lastStandSaveWriter: false, localStorage: { setItem: (...args) => writes.push(args) } };
  vm.runInNewContext(storageSource, { LibraryManager: { library }, mergeInto: Object.assign, window, UTF8ToString: value => value });
  for (const key of ['singedTerra.lastStand.prototype.v1', 'singedTerra.lastStand.restore.v1'])
    assert.equal(library.LastStandStorage_Set(key, 'profile'), 0);
  assert.equal(writes.length, 0); window.__lastStandSaveWriter = true;
  assert.equal(library.LastStandStorage_Set('singedTerra.lastStand.restore.v1', 'confirmed predecessor'), 1);
  assert.deepEqual(writes, [['singedTerra.lastStand.restore.v1', 'confirmed predecessor']]);
});
