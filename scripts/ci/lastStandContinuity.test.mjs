import assert from 'node:assert/strict';
import test from 'node:test';
import {BACKUP_HEADER,BACKUP_LIMIT,decodeObservedBackup,continuityRejectionFixtures,
  assertContinuityProgress,continuityInputHashes,continuityResumeControl} from '../last-stand-continuity.mjs';

// Invented documents exercise runner guards only; they are never player evidence.
const profile=()=>({version:6,revision:1,credits:3,checkpoint:{encounter:{completedWave:1,tick:300}},
  research:{revision:2,lastObservedUtcMilliseconds:100,completedRanks:[0,0],slots:[{active:null}]},
  permanentLevels:{cannonAttack:0},history:{current:null}});
const encode=value=>Buffer.from(BACKUP_HEADER+JSON.stringify(value));

test('download guard admits bounded strict UTF8 header and preserves original profile bytes',()=>{
  const raw=JSON.stringify(profile()),bytes=Buffer.from(BACKUP_HEADER+raw);
  assert.deepEqual(decodeObservedBackup(bytes),{raw,profile:profile()});
  for(const invalid of [Buffer.alloc(0),Buffer.alloc(BACKUP_LIMIT+1),Buffer.from('\ufeff'+BACKUP_HEADER+raw),
    Buffer.from(BACKUP_HEADER.replace(' 1',' 2')+raw),Buffer.from(BACKUP_HEADER+'[]'),
    Buffer.from(BACKUP_HEADER+'{'),Buffer.concat([Buffer.from(BACKUP_HEADER),Buffer.from([0xff])])])
    assert.throws(()=>decodeObservedBackup(invalid));
});

test('invalid import fixtures are byte-distinct labeled refusals derived without mutating the export',()=>{
  const document=encode(profile()),original=Buffer.from(document),rows=continuityRejectionFixtures(document);
  assert.deepEqual(rows.map(row=>row.id),['malformed-json','invalid-utf8','future-format','future-save','unknown-field','oversize']);
  assert.equal(new Set(rows.map(row=>row.bytes.toString('base64'))).size,6);
  assert.deepEqual(document,original);
  for(const row of rows){assert.match(row.scope,/rejection fixture/);assert.notDeepEqual(row.bytes,document);}
  assert.equal(rows.at(-1).bytes.length,BACKUP_LIMIT+1);
  assert.equal(decodeObservedBackup(rows.find(row=>row.id==='future-save').bytes).profile.version,7);
  assert.equal(decodeObservedBackup(rows.find(row=>row.id==='unknown-field').bytes).profile.continuityUnexpected,true);
});

test('progress comparison permits clock bookkeeping but rejects currency, checkpoint, history and research changes',()=>{
  const before=profile(),after=structuredClone(before);after.revision++;after.research.revision++;after.research.lastObservedUtcMilliseconds++;
  assert.doesNotThrow(()=>assertContinuityProgress(before,after));
  for(const mutate of [p=>p.credits++,p=>p.checkpoint.encounter.tick++,p=>p.checkpoint=null,
    p=>p.permanentLevels.cannonAttack++,p=>p.research.completedRanks[0]++,p=>p.research.slots[0].active={},
    p=>p.history.current={},p=>p.unknown=true]){
    const changed=structuredClone(after);mutate(changed);assert.throws(()=>assertContinuityProgress(before,changed));
  }
});

test('continuity provenance binds current reader, actor, v4 and transport/core owners',()=>{
  const hashes=continuityInputHashes();
  for(const path of ['scripts/last-stand-continuity.mjs','scripts/ci/lastStandContinuity.test.mjs',
    'e2e/helpers/lastStandBrowserActor.mjs','campaign-unity/Tools/contracts/last-stand-observation-v4.json',
    'campaign-unity/Unity/Assets/Scripts/LastStandProgressionBackup.cs',
    'campaign-unity/Unity/Assets/Scripts/LastStandLoopContinuity.cs',
    'campaign-unity/Unity/Assets/Plugins/WebGL/LastStandBackup.jslib'])assert.match(hashes[path],/^[a-f0-9]{64}$/);
});

test('checkpoint resume supports garage and reloaded workshop without choosing a fresh deploy or hidden action',()=>{
  const button=(name,active=true,label='RESUME RUN')=>({name,active,label,interactable:true});
  assert.equal(continuityResumeControl({controls:[button('Deploy'),button('Redeploy',false)]}),'Deploy');
  assert.equal(continuityResumeControl({controls:[button('Deploy',false),button('Redeploy')]}),'Redeploy');
  for(const controls of [[],[button('Deploy',false)],[button('Deploy'),button('Redeploy')],
    [button('Deploy',true,'DEPLOY')],[{...button('Redeploy'),interactable:false}]])
    assert.throws(()=>continuityResumeControl({controls}));
});
