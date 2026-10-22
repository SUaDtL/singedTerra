import assert from 'node:assert/strict';
import {lstatSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Keep the runner's priorities and other repositories. Only replace the Azure
// Ubuntu endpoint, which can stall each index/package before trying its fallback.
// APT still verifies the same Ubuntu signatures and package hashes.
export function preferUbuntuArchive(source) {
  assert.ok(typeof source==='string' && Buffer.byteLength(source)<=4096,'Unexpected Ubuntu mirror list size');
  const result=source.replace(/^(\s*)https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu(\/?)(?=[ \t\r\n]|$)/gm,
    '$1https://archive.ubuntu.com/ubuntu$2');
  assert.match(result,/^[ \t]*https:\/\/archive\.ubuntu\.com\/ubuntu\/?(?=[ \t\r\n]|$)/m,
    'Runner mirror list has no supported Ubuntu archive');
  return result;
}

export function prepareUbuntuMirror(path) {
  const stat=lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size<=4096,'Expected a regular bounded Ubuntu mirror list');
  const original=readFileSync(path,'utf8'),prepared=preferUbuntuArchive(original);
  if(prepared!==original)writeFileSync(path,prepared,'utf8');
  return prepared!==original;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.equal(process.platform,'linux','Ubuntu mirror preparation requires the Linux CI runner');
  prepareUbuntuMirror('/etc/apt/apt-mirrors.txt');
  console.log('Ubuntu archive mirror prepared over HTTPS; APT signature verification unchanged.');
}
