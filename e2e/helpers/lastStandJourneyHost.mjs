import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';


export const ROOT = resolve(import.meta.dirname, '../..');

export const SAVE_KEY = 'singedTerra.lastStand.prototype.v1';

export const SELECTION_KEY = 'singedterra.command-center.selection.v1';

export const TITLE = 'Last Stand wave checkpoints survive Return and reload before a stronger redeploy';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export const fileHash = path => hash(readFileSync(path));

export const delay = ms => new Promise(done => setTimeout(done, ms));


export function runTool(tool, args, options = {}) {
  return execFileSync(tool, args, { timeout: 120_000, maxBuffer: 32 * 1024 * 1024, ...options });
}


export function powershell(script) {
  const boundedScript="$ProgressPreference='SilentlyContinue';$ErrorActionPreference='Stop';\n"+script;
  const command='[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);& ([ScriptBlock]::Create([Console]::In.ReadToEnd()))';
  return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],
    {input:Buffer.from(boundedScript,'utf8'),encoding:'utf8',timeout:10_000,maxBuffer:4*1024*1024,windowsHide:true});
}


export function admitEvidenceParent(candidate) {
  const legacyRoot=resolve(ROOT,'campaign-unity/Evidence/last-stand-playable-loop/t06');
  const releasedRoot=process.env.ST_SHOP_EVIDENCE_ROOT;
  if(releasedRoot)assert.equal(resolve(releasedRoot),
    'C:\\Users\\brenn\\codearbiter-review-integration-20261006\\mechanics-shop-feature-20261009\\t21-evidence',
    'External evidence root is outside the released T21 scope');
  const explicitLegacy=candidate && !relative(legacyRoot,resolve(candidate)).startsWith('..') &&
    !isAbsolute(relative(legacyRoot,resolve(candidate)));
  const evidenceRoot = releasedRoot && !explicitLegacy ? resolve(releasedRoot) : legacyRoot;
  const parent = resolve(candidate ?? evidenceRoot);
  const parentRelative = relative(evidenceRoot, parent);
  assert.ok(!isAbsolute(parentRelative) && !parentRelative.startsWith('..'), 'Evidence parent escaped task root');
  assert.equal(realpathSync(evidenceRoot),evidenceRoot,'Evidence root resolved containment failed');
  let ancestor=parent;while(!existsSync(ancestor))ancestor=dirname(ancestor);
  const actual=resolve(realpathSync(ancestor),relative(ancestor,parent)),actualRelative=relative(evidenceRoot,actual);
  assert.ok(!isAbsolute(actualRelative) && !actualRelative.startsWith('..'),'Evidence resolved containment escaped task root');
  return parent;
}
