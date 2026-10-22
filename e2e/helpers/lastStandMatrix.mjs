import assert from 'node:assert/strict';

export const LAST_STAND_VIEWPORTS = Object.freeze([
  { name: 'approved-standard', width: 1366, height: 768 },
  { name: 'approved-wide', width: 1920, height: 1080 },
  { name: 'approved-portrait', width: 390, height: 844 },
  { name: 'approved-landscape', width: 844, height: 390 },
  { name: 'approved-compact', width: 720, height: 640 },
  { name: 'wide', width: 1600, height: 900 },
  { name: 'standard', width: 1280, height: 720 },
  { name: 'compact', width: 800, height: 600 },
  { name: 'narrow-landscape', width: 568, height: 320 },
  { name: 'portrait', width: 390, height: 844 },
].map(Object.freeze));

export const LAST_STAND_ENTRY_ROUTES=Object.freeze([
  ['retired save cannot promote a removed campaign','first-salvo'],
  ['remembered retired campaign selects Last Stand','last-stand'],
  ['legacy Ash Road route selects Last Stand','last-stand'],['remembered Skirmishes','standard'],
  ['Return before remembered Ash Road','last-stand'],['validated ST1 before remembered Ash Road','imported-challenge'],
  ['invite before validated ST1','online'],['invite before explicit Return','online'],['rejoin before validated ST1','online'],
  ['invalid mixed signals recover retired selection','last-stand'],
  ['invalid Return spelling recovers retired selection','last-stand'],
].map(([name,selected])=>Object.freeze({name,selected})));

// Lifecycle shards run the complete fresh-player progression. Independent
// bootstrap/storage recovery owns the original five fault-layout profiles.
// Native Windows qualification keeps its original combined journey and matrix.
export function lastStandJourneySection(name,{host=process.platform,profile,shard}={}) {
  if(name===undefined)return Object.freeze({name:'full',entry:true,lifecycle:true,recovery:true});
  assert.ok(host==='linux' && profile==='linux-functional','Only Linux functional CI can split journey sections');
  assert.ok(['entry','lifecycle','recovery'].includes(name),'Unknown journey section');
  if(name==='lifecycle'){
    assert.ok(shard,'Lifecycle section requires its closed viewport shard');
    lastStandViewportPartition(shard,{host,profile});
  }else assert.equal(shard,undefined,'Entry/recovery own their original complete viewport matrices');
  return Object.freeze({name,entry:name==='entry',lifecycle:name==='lifecycle',recovery:name==='recovery'});
}
export function lastStandViewportPartition(shard, {host=process.platform, profile}={}) {
  const whole = {shard:null, viewports:LAST_STAND_VIEWPORTS,
    phaseViewports:LAST_STAND_VIEWPORTS.slice(0,5), entryViewports:LAST_STAND_VIEWPORTS.slice(0,3),
    captureViewport:LAST_STAND_VIEWPORTS.find(v=>v.name==='standard')};
  if(shard===undefined)return Object.freeze(whole);
  assert.ok(host==='linux' && profile==='linux-functional', 'Only Linux functional CI can partition viewport observations');
  assert.match(shard, /^(?:[1-9]|10)\/10$/, 'Expected one of the closed ten Campaigns shards');
  const viewport=LAST_STAND_VIEWPORTS[Number(shard.split('/')[0])-1];
  return Object.freeze({shard,viewports:[viewport],phaseViewports:whole.phaseViewports.includes(viewport)?[viewport]:[],
    entryViewports:whole.entryViewports.includes(viewport)?[viewport]:[],captureViewport:whole.captureViewport});
}
