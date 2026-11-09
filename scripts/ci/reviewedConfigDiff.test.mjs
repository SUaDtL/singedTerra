import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareProposal, verifyProposal, executeReviewedRelease } from './reviewedConfigDiff.mjs';

const ref='abcdefghijklmnopqrst';
const binding={sourceSha:'a'.repeat(40),manifestSha256:'b'.repeat(64),configSha256:'c'.repeat(64),cliVersion:'3.0.0',projectRef:ref};
const proposal=()=>({schema_version:1,config_schema:'https://example.invalid/schema',target:{kind:'linked',project_ref:ref,environment:'production',local_scope:'base'},scope:{present:['api','auth','database','pooler','realtime','storage'],missing:[]},changes:[{path:['auth','enable_signup'],class:'update',declared:true,local:true,remote:false}],masked:[],unmanaged:[],counts:{update:1,remote_only:0,local_only:0,total:1},message:'1 config difference found.'});

test('binds the reviewed config proposal to source, manifest, target, CLI and exact changes',()=>{
  const value=proposal(),reviewedProposal=prepareProposal(value,binding);
  assert.equal(verifyProposal(value,binding,reviewedProposal),true);
  assert.equal(prepareProposal({...value,target:{...value.target,project_name:'display only'},message:'display only'},binding),reviewedProposal);
  assert.throws(()=>verifyProposal(value,binding,''),/reviewed.*proposal/i);
  assert.throws(()=>verifyProposal({...value,changes:[{...value.changes[0],local:false}]},binding,reviewedProposal),/does not match/i);
  assert.throws(()=>verifyProposal(value,{...binding,sourceSha:'d'.repeat(40)},reviewedProposal),/does not match/i);
  assert.throws(()=>prepareProposal({...value,target:{...value.target,project_ref:'z'.repeat(20)}},binding),/target/i);
  assert.throws(()=>prepareProposal({...value,target:{...value.target,parent_project_ref:'z'.repeat(20)}},binding),/parent/i);
  for(const field of ['masked','unmanaged'])assert.throws(()=>prepareProposal({...value,[field]:[['auth','secret']]},binding),/incomplete/i);
  assert.throws(()=>prepareProposal({...value,scope:{present:['auth'],missing:['storage']}},binding),/incomplete/i);
  assert.throws(()=>prepareProposal({...value,scope:{present:['auth'],missing:[]}},binding),/incomplete/i);
  assert.throws(()=>prepareProposal({...value,schema_version:2},binding),/schema/i);
  assert.throws(()=>prepareProposal({...value,counts:{...value.counts,total:0}},binding),/count/i);
  assert.throws(()=>verifyProposal(value,binding,'x'.repeat(32001)),/oversized/i);
});

test('checks the proposal before each mutation and never invokes it after a refusal',()=>{
  const value=proposal(),reviewedProposal=prepareProposal(value,binding),calls=[];
  const run=(args)=>{calls.push(args);return args[0]==='config'&&args[1]==='diff'?Buffer.from(JSON.stringify(value)):Buffer.from('ok');};
  executeReviewedRelease({mode:'config',binding,reviewedProposal,run});
  assert.deepEqual(calls.map(x=>x.slice(0,2)),[['config','diff'],['config','push']]);
  assert.ok(calls.every(args=>args.includes(`--remote=${ref}`)));
  calls.length=0;
  assert.throws(()=>executeReviewedRelease({mode:'migrations',binding,reviewedProposal:'{}',run}),/does not match/i);
  assert.deepEqual(calls.map(x=>x.slice(0,2)),[['config','diff']]);
  calls.length=0;
  executeReviewedRelease({mode:'migrations',binding,reviewedProposal,run});
  assert.deepEqual(calls.map(x=>x.slice(0,2)),[['config','diff'],['db','push']]);
  const partial=args=>{if(args[0]==='config'&&args[1]==='diff')return Buffer.from(JSON.stringify(value));throw new Error('private output');};
  assert.throws(()=>executeReviewedRelease({mode:'config',binding,reviewedProposal,run:partial}),/mutation started.*partial or unknown/i);
  calls.length=0;
  executeReviewedRelease({mode:'functions',binding,run,functionNames:['release_probe']});
  assert.deepEqual(calls,[['functions','deploy','release_probe','--use-api','--yes',`--remote=${ref}`]]);
  calls.length=0;
  assert.throws(()=>executeReviewedRelease({mode:'migrations',binding,reviewedProposal,run,revalidate:()=>{throw new Error('migration changed');}}),/migration changed/);
  assert.deepEqual(calls.map(x=>x.slice(0,2)),[['config','diff']]);
});
