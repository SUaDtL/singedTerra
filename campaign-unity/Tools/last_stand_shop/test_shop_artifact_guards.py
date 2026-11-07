"""Negative replay of genuine retained journey records and sealed host fixtures.

These checks require ST_SHOP_GUARD_RECORD, ST_SHOP_BACKGROUND_RECORD and
ST_SHOP_OBSERVER_OUTPUT_ROOT from their qualification owner. They must never
manufacture successful browser receipts during portable unit discovery.
"""
from copy import deepcopy
import json
import os
from pathlib import Path
import re
import unittest
import test_shop_journey_guards as _fixtures

TOOLS = _fixtures.TOOLS
verifier = _fixtures.verifier
_mutate_recovery_row = _fixtures._mutate_recovery_row
_mutate_recovery_snapshot = _fixtures._mutate_recovery_snapshot
_recovery_pointer_fault = _fixtures._recovery_pointer_fault
_recovery_read_fault = _fixtures._recovery_read_fault


class ShopArtifactGuardTests(unittest.TestCase):
    def background_record(self):
        self.assertTrue(callable(getattr(verifier, 'verify_shop_recovery', None)),
                        'Maintained verifier has no T22 storage/Pause admission behavior')
        report = json.loads(Path(os.environ['ST_SHOP_BACKGROUND_RECORD']).read_bytes())
        verifier.verify_shop_recovery(report)
        return report

    def test_shop_guard_background_emulated_visibility_and_dropped_debt(self):
        report = self.background_record()
        missing_compiled = deepcopy(report)
        del missing_compiled['compiled_boundaries']['methods']['RunSettle']
        with self.assertRaisesRegex(AssertionError, '^RECOVERY_COMPILED:'):
            verifier.verify_shop_recovery(missing_compiled)
        false_pending = deepcopy(report)
        false_pending['gameplay']['purchase_boundary']['kind'] = 'pending-debt'
        with self.assertRaisesRegex(AssertionError, '^RECOVERY_PENDING_DEBT:'):
            verifier.verify_shop_recovery(false_pending)
        print('PASS shop_background_rejects missing-compiled-layer and false-pending-claim', flush=True)
        emulated = deepcopy(report)
        native = report['execution_mode'] == 'native'
        if native:
            emulated['native_intervals'][0]['emulated'] = True
            emulation_reason = 'Unqualified native interval'
        else:
            emulated['native_qualified'] = True
            emulation_reason = 'Genuine native blur/hidden qualification is required; emulated native evidence is inadmissible'
        dropped = deepcopy(report)
        active = dropped['native_intervals'][0]['after'] if native else dropped['pause']['following']
        _mutate_recovery_row(dropped, 'encounters', active, {'tick': active['tick'] - 20})
        debt_reason = ('Native background froze, dropped clock debt, minted income or applied a purchase early' if native
                       else 'Pause resume admitted dropped or extra clock debt')
        for label, candidate, reason in [('emulated-native-visibility', emulated, emulation_reason),
                                          ('dropped-clock-debt', dropped, debt_reason)]:
            with self.subTest(fault=label), self.assertRaisesRegex(AssertionError, '^' + re.escape(reason) + '$'):
                verifier.verify_shop_recovery(candidate)
            print('PASS shop_background_rejects ' + label, flush=True)
        for outside in (False, True):
            candidate = _recovery_pointer_fault(report, outside)
            with self.subTest(fault='outside-target' if outside else 'different-control'), self.assertRaisesRegex(
                    AssertionError, '^RECOVERY_CONTROL_TARGET: Claim$'):
                verifier.verify_shop_recovery(candidate)
            print('PASS shop_background_rejects ' + ('outside-target' if outside else 'different-control'), flush=True)

    def test_shop_guard_background_uncertain_save_and_reward_replay(self):
        report = self.background_record()
        unconfirmed = deepcopy(report)
        failure = unconfirmed['storage_cases']['claim-uncertain']['failure']
        _mutate_recovery_row(unconfirmed, 'states', failure, {'wallet': failure['wallet'] + 1})
        replayed = deepcopy(report)
        stored = replayed['gameplay']['refreshes'][-1]['storage']
        _mutate_recovery_snapshot(replayed, stored, dict(stored['data'], credits=stored['data']['credits'] + 1))
        for label, candidate, reason in [
                ('unconfirmed-wallet', unconfirmed, 'Unconfirmed storage changed published wallet, reward or permanent levels: claim-uncertain'),
                ('repeated-reward', replayed, 'Terminal refresh changed storage, replayed reward or accounting')]:
            with self.subTest(fault=label), self.assertRaisesRegex(AssertionError, '^' + re.escape(reason) + '$'):
                verifier.verify_shop_recovery(candidate)
            print('PASS shop_background_rejects ' + label, flush=True)
        detached = deepcopy(report)
        detached['storage_cases']['claim-uncertain']['failure']['wallet'] += 1
        with self.subTest(fault='detached-provenance'), self.assertRaisesRegex(
                AssertionError, '^Detached recovery storage claim-uncertain witness$'):
            verifier.verify_shop_recovery(detached)
        print('PASS shop_background_provenance_rejects detached-witness', flush=True)
        for label in ('migration-denied', 'claim-uncertain', 'permanent-mismatch'):
            for fault in ('missing-read', 'wrong-bytes', 'foreign-document', 'late-read'):
                candidate = _recovery_read_fault(report, label, fault)
                with self.subTest(case=label, fault=fault), self.assertRaisesRegex(
                        AssertionError, '^RECOVERY_CONFIRMATION: ' + re.escape(label) + '$'):
                    verifier.verify_shop_recovery(candidate)
                print('PASS shop_background_rejects ' + label + '-' + fault, flush=True)

    def record(self):
        path = Path(os.environ['ST_SHOP_GUARD_RECORD'])
        report = json.loads(path.read_bytes())
        verifier.verify_shop_vertical(report)
        return report

    def rejected(self, label, candidate):
        with self.assertRaises(AssertionError, msg='Actual admission accepted declared ' + label):
            verifier.verify_shop_vertical(candidate)
        print('PASS shop_admission_rejects ' + label, flush=True)

    def test_shop_guard_vertical_old_export_and_partial(self):
        report = self.record()
        old = deepcopy(report)
        old['binding']['receipt_sha256'] = '0' * 64
        partial = deepcopy(report)
        partial['witnesses'].pop('permanent_effect', None)
        for label, candidate in [('old-export', old), ('partial-vertical', partial)]:
            with self.subTest(fault=label):
                self.rejected(label, candidate)

    def test_shop_guard_vertical_seeded_scrap_and_replayed_purchase(self):
        report = self.record()
        seeded = deepcopy(report)
        seeded['records']['shopStates'][0]['scrap'] = 3
        replayed = deepcopy(report)
        purchases = replayed['records']['purchases']
        # During initial behavioral RED the real early journey has no purchase;
        # a finite declared replay pair still exercises the admission contract.
        # GREEN uses the actual accepted activation from the complete journey.
        purchase = deepcopy(purchases[0]) if purchases else {'activationId': 1, 'accepted': True, 'chargedScrap': 5}
        replayed['records']['purchases'].extend([purchase, deepcopy(purchase)])
        for label, candidate in [('seeded-funds', seeded), ('replayed-purchase', replayed)]:
            with self.subTest(fault=label):
                self.rejected(label, candidate)

    def required_action_fixtures(self, report):
        """Locate actual clicks and their two observed edges for private faults."""
        buy = 'ShopCard_' + report['track'] + 'Buy'
        definitions = (('deploy', 'Deploy', 1, 'garage'),
                       ('temporary-buy', buy, 1, 'battle'),
                       ('claim', 'Claim', 1, 'result'),
                       ('permanent-buy', buy, 1, 'workshop'),
                       ('redeploy', 'Deploy', 2, 'garage'))
        fixtures = {}
        for label, name, load, phase in definitions:
            matches = [(index, action) for index, action in enumerate(report['actions'])
                       if action['name'] == name and action['load'] == load
                       and any(layout['seq'] == action['layoutSeq'] and layout['phase'] == phase
                               for layout in report['records']['controlsOnly'])]
            self.assertEqual(len(matches), 1, 'Actual positive needs one ' + label)
            index, action = matches[0]
            edges = [offset for offset, item in enumerate(report['records']['input'])
                     if item['load'] == load and item.get('area') == 'gameplay'
                     and item.get('kind') in ('pointerdown', 'pointerup')
                     and action['before'] <= item['t'] <= action['after']
                     and abs(item.get('x', -10000) - action['x']) < 1
                     and abs(item.get('y', -10000) - action['y']) < 1]
            self.assertEqual([report['records']['input'][offset]['kind'] for offset in edges],
                             ['pointerdown', 'pointerup'], 'Actual positive needs both edges: ' + label)
            fixtures[label] = (index, edges)
        return fixtures

    def reject_action_fault(self, label, candidate, diagnostic):
        with self.assertRaisesRegex(AssertionError, diagnostic,
                                    msg='Actual admission accepted action fault ' + label):
            verifier.verify_shop_vertical(candidate)
        print('PASS shop_action_rejects ' + label, flush=True)

    def test_shop_guard_vertical_required_player_actions(self):
        report = self.record()
        print('PASS untouched_action_positive ' + report['fitting'], flush=True)
        fixtures = self.required_action_fixtures(report)
        for label, (index, edges) in fixtures.items():
            with self.subTest(fitting=report['fitting'], missing=label):
                candidate = deepcopy(report)
                del candidate['actions'][index]
                candidate['records']['input'] = [item for offset, item in enumerate(candidate['records']['input'])
                                                 if offset not in edges]
                self.assertEqual(len(report['records']['input']) - len(candidate['records']['input']), 2)
                self.reject_action_fault('missing-' + label, candidate,
                                         'Mandatory Shop action|Claim must be one explicit real control')
        with self.subTest(fitting=report['fitting'], missing='all-except-claim'):
            candidate = deepcopy(report)
            claim_index, claim_edges = fixtures['claim']
            candidate['actions'] = [candidate['actions'][claim_index]]
            candidate['records']['input'] = [item for offset, item in enumerate(candidate['records']['input'])
                                             if item.get('kind') not in ('pointerdown', 'pointerup')
                                             or offset in claim_edges]
            self.reject_action_fault('claim-only', candidate, 'Mandatory Shop action')

    def test_shop_guard_vertical_action_context_and_order(self):
        report = self.record()
        fixtures = self.required_action_fixtures(report)
        temporary_index = fixtures['temporary-buy'][0]
        permanent_index = fixtures['permanent-buy'][0]
        wrong_load = deepcopy(report)
        wrong_load['actions'][fixtures['deploy'][0]]['load'] = 2
        self.reject_action_fault('wrong-load', wrong_load, 'Action|Mandatory Shop action')
        for field, value in (('phase', 'garage'), ('mode', 'Bad')):
            with self.subTest(fault='wrong-' + field):
                candidate = deepcopy(report)
                action = candidate['actions'][temporary_index]
                layout = next(item for item in candidate['records']['controlsOnly'] if item['seq'] == action['layoutSeq'])
                raw = layout['raw']
                if field == 'phase':
                    changed = raw.replace('"phase":"battle"', '"phase":"garage"', 1)
                    layout['phase'] = value
                else:
                    control = next(item for item in layout['shopControls'] if item['name'] == action['name'])
                    start = raw.index('"name":"' + action['name'] + '"')
                    changed = raw[:start] + raw[start:].replace('"mode":"Run"', '"mode":"Bad"', 1)
                    control['mode'] = value
                self.assertNotEqual(changed, raw, 'Fault must alter the selected actual control diagnostic')
                self.assertEqual(len(changed), len(raw), 'Keep the genuine truncation boundary unchanged')
                layout['raw'] = changed
                candidate['records']['runtime'][layout['seq']]['text'] = changed
                self.reject_action_fault('wrong-' + field, candidate, 'Mandatory Shop action temporary-buy')
        reordered = deepcopy(report)
        reordered['actions'][temporary_index], reordered['actions'][permanent_index] = (
            reordered['actions'][permanent_index], reordered['actions'][temporary_index])
        reused = deepcopy(report)
        reused['actions'].append(deepcopy(reused['actions'][temporary_index]))
        for label, candidate, diagnostic in (
                ('reordered-mandatory-actions', reordered, 'Mandatory Shop action order'),
                ('reused-pointer-pair', reused, 'Action pointer pair was reused')):
            with self.subTest(fault=label):
                self.reject_action_fault(label, candidate, diagnostic)

    def test_shop_guard_vertical_action_witness_order(self):
        report = self.record()
        fixtures = self.required_action_fixtures(report)
        following = {'deploy': report['witnesses']['deploy'],
                     'temporary-buy': report['witnesses']['temporary_after'],
                     'claim': next(item for item in report['records']['storage'] if item['label'] == 'claim-after'),
                     'permanent-buy': report['witnesses']['permanent_state_after'],
                     'redeploy': report['witnesses']['redeploy']}
        for label, (index, edges) in fixtures.items():
            with self.subTest(fitting=report['fitting'], action_after_witness=label):
                candidate = deepcopy(report)
                action = candidate['actions'][index]
                delta = following[label]['t'] + 100 - action['before']
                action['before'] += delta
                action['after'] += delta
                for offset in edges:
                    candidate['records']['input'][offset]['t'] += delta
                self.reject_action_fault('after-witness-' + label, candidate,
                                         'Mandatory Shop action .*witness order|Claim was not manual after natural defeat')

    def test_shop_observer_callback_failure_is_retained(self):
        """Actual callback/outcome code; inert page, exact diagnostic, no browser."""
        import hashlib
        import subprocess
        import uuid
        from datetime import datetime, timezone

        worktree = TOOLS.parents[1]
        evidence = Path(r'C:/Users/brenn/codearbiter-review-integration-20261006/mechanics-shop-feature-20261009/t21-evidence/observer-failure-fix')
        followup = (evidence.parent / 'observer-proof-followup').resolve()
        configured = os.environ.get('ST_SHOP_OBSERVER_OUTPUT_ROOT')
        self.assertTrue(configured, 'An explicit task-owned external observer output root is required')
        requested = Path(configured)
        self.assertTrue(requested.is_absolute(), 'Observer output root must be absolute')
        output_root = requested.resolve()
        self.assertTrue(output_root.is_relative_to(followup) and output_root != followup,
                        'Observer output root must remain inside the external follow-up workspace')
        ancestors = [output_root]
        while ancestors[-1] != followup:
            ancestors.append(ancestors[-1].parent)
        self.assertFalse(any((parent / 'SEALED.json').is_file() for parent in ancestors),
                         'Closed observer evidence cannot receive new output')
        source = Path(os.environ.get('ST_SHOP_OBSERVER_SOURCE', str(worktree / 'e2e/helpers/lastStandJourney.mjs'))).resolve()
        self.assertTrue(source == (worktree / 'e2e/helpers/lastStandJourney.mjs').resolve()
                        or source.is_relative_to(evidence.resolve()) or source.is_relative_to(followup),
                        'Only actual source or a task-owned retained private copy is executable')
        fixture = evidence / 'before/249-current-preview-hud-console.json'
        self.assertEqual(hashlib.sha256(fixture.read_bytes()).hexdigest(),
                         'fbcff4394f756eb91c9f63a5189c6005512d4d84e42b92303e990f3f2b3a6123')
        output = output_root / ('observer-guard-' + uuid.uuid4().hex[:12])
        output.mkdir(parents=True)
        script = r"""
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
const [sourcePath,fixturePath,output,expectedSourceHash]=process.argv.slice(2);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=readFileSync(sourcePath),source=bytes.toString('utf8').replace(/\r\n/g,'\n');
assert.equal(digest(bytes),expectedSourceHash,'Actual callback source pin');
const fixture=JSON.parse(readFileSync(fixturePath,'utf8'));
assert.equal(fixture.records.length,3,'Unchanged diagnostic fixture');
const actualRaw=fixture.records[0].message;
assert.equal(actualRaw.length,8190,'Exact retained received message');
const take=(text,start,end)=>{
  const first=text.indexOf(start),last=text.indexOf(end,first+start.length);
  assert.ok(first>=0 && last>first,'Trusted source extraction boundaries: '+start);
  assert.equal(text.indexOf(start,first+start.length),-1,'Unique extraction start: '+start);
  return text.slice(first,last);
};
const parser=take(source,'export function retainRuntimeObservation(', '\nexport async function observeRuntimePair(').replace(/^export /,'');
const outcome=take(source,'export async function retainJourneyOutcome(', '\nexport async function runLastStandJourney(').replace(/^export /,'');
const consoleClassifier=take(source,'export function classifyConsole(', '\nexport function validateGameplayInput(').replace(/^export /,'');
const browserClassifier=take(source,'export function classifyBrowserEvidence(', '\n// Serialized into the current document.').replace(/^export /,'');
const main=take(source,'export async function runLastStandJourney(', '\nexport const AUDIO_CAPTURE =');
const setup=take(main,'  const report = ', '  try {\n    const localBefore=');
const registration=take(main,"    page.on('console', message => {", "    page.on('pageerror',");
const polling=take(main,'    const until=async(', '    const focused=async');
const tail=main.slice(main.indexOf('    check(!consoleErrors.length &&'));
assert.ok(tail.startsWith('    check('),'Actual terminal checkpoint captured');
const split=tail.indexOf('  } catch(error) {');assert.ok(split>0,'Actual main catch/finally captured');
const preTerminal=tail.slice(0,split),finish=tail.slice(split);
const terminalAnchor='httpErrors:unexpectedHTTP});\n';
assert.ok(preTerminal.includes(terminalAnchor),'Actual post-check terminal boundary captured');
const terminal=preTerminal.slice(preTerminal.indexOf(terminalAnchor)+terminalAnchor.length);
const location={url:'inert://observer-failure-fixture',lineNumber:19,columnNumber:7};
const envelope=text=>'ST_TEST_RUNTIME '+JSON.stringify({t:123,timeOrigin:456,text});
const raw=envelope(actualRaw),later='ST_TEST_RUNTIME {"inert":';
const malformedInput='ST_TEST_INPUT {"inert":';
const baselineArrays=()=>({states:[],encounters:[],hits:[],layouts:[],cues:[]});
const strictSandbox=createContext({assert});runInContext(parser,strictSandbox);
let expected;
try{strictSandbox.retainRuntimeObservation({t:123,timeOrigin:456,text:actualRaw},7,'inert-fixture',baselineArrays());}
catch(error){expected=error;}
assert.equal(expected?.name,'SyntaxError','Unchanged actual strict parser rejects partial diagnostic');
console.log('SETUP_PASS actual anonymous callback + parser + main checkpoints/catch/finally + outcome extracted');
console.log('STRICT_PARTIAL_REJECTION_PASS '+expected.message);
const rows=[];
async function exercise(options){
  const caseOutput=join(output,options.name);mkdirSync(caseOutput);
  const control={writes:[],events:[],cleanups:0,waits:0,immediate:[],rejection:null,oracle_errors:[],statuses:[],clockReads:0};
  const clock={value:1700000000123};
  let callback;
  const writer=(path,data)=>{
    const file=path.slice(path.lastIndexOf('\\')+1).slice(path.lastIndexOf('/')+1);
    control.writes.push({file,synchronous:true});
    if(options.failWrites?.includes(file))throw new Error('inert persistence refusal: '+file);
    writeFileSync(path,data);
  };
  const page={on:(kind,listener)=>{assert.equal(kind,'console');assert.equal(callback,undefined);callback=listener;},
    screenshot:async()=>{},waitForTimeout:async milliseconds=>{
      control.waits++;
      if(!options.pollAfterAwait)throw new Error('Inert polling must not wait');
      assert.equal(milliseconds,40);assert.equal(control.waits,1,'Finite poll delivers exactly one awaited callback');
      emit(raw);
      if(options.pollAfterAwait==='iteration'){control.pollItems.push({inert:true});clock.value+=1;}
      else{assert.equal(options.pollAfterAwait,'deadline');clock.value+=1001;}
    }};
  const emit=text=>{
    assert.equal(typeof callback,'function','Actual registration captured by fake page.on');
    let escaped;try{callback({text:()=>text,type:()=> 'log',location:()=>location});}catch(error){escaped=error;}
    try{
      assert.equal(escaped,undefined,'Actual console callback parse failure escaped instead of synchronously retaining and latching failure');
      if(text===raw || text===later || text===malformedInput){
      const p=join(caseOutput,'observer-failures.json');
      if(!options.failWrites?.includes('observer-failures.json')){
        assert.ok(existsSync(p),'Observer failure must be persisted synchronously before callback returns');
        const retained=JSON.parse(readFileSync(p,'utf8')).at(-1);
        assert.equal(retained.text,text,'Full exact received raw must survive synchronous retention');
        assert.equal(retained.type,'log');assert.deepEqual(retained.location,location);
        assert.equal(retained.load,7);assert.equal(retained.scope,'inert-fixture');assert.equal(retained.time,1700000000123);
        assert.match(retained.error,/SyntaxError/);assert.ok(retained.stack.includes('SyntaxError'));
        control.immediate.push(retained);
      }
      }
    }catch(error){control.oracle_errors.push({message:error.message,stack:error.stack});}
    if(text===raw || text===later || text===malformedInput)control.malformedDelivered=true;
  };
  const cleanup=async()=>{
    control.cleanups++;control.events.push('cleanup');
    if(options.late)emit(raw);
    if(options.cleanupFailure)throw new Error('inert later cleanup refusal');
  };
  const sandbox=createContext({assert,join,writeFileSync:writer,Date:{now:()=>{control.clockReads++;return clock.value;}},TITLE:'inert observer fixture',
    pageFixture:page,cleanup,control,emit,options:{...options,output:caseOutput},
    retainRenderedAudioDiagnostics:async()=>{},fileHash:()=> 'inert-screenshot-hash',
    console:{log:()=>{}},packagedRuntimeSnapshot:()=>{throw new Error('Runtime snapshot is outside inert seam');}});
  const body=`${parser}\n${outcome}\n${consoleClassifier}\n${browserClassifier}\nasync function runInert(options){
    const base={origin:'inert://observer-failure-fixture'},output=options.output,resultPath=join(output,'result.json'),entrypoint='inert actual-callback extraction';
${setup}
    load=7;scope='inert-fixture';page=pageFixture;native={close:cleanup};control.report=report;
    let retainedStatus=report.status;
    Object.defineProperty(report,'status',{enumerable:true,get:()=>retainedStatus,set:value=>{
      control.statuses.push({value,afterMalformedCallback:Boolean(control.malformedDelivered)});retainedStatus=value;
    }});
    try{
${registration}
${polling}
      if(!options.pollAfterAwait)for(const text of options.messages??[])emit(text);
      if(options.checkpoint==='check'){
        let rejected;try{check(true,'inert real main checkpoint');}catch(error){rejected=error;}
        control.checkpointRejected=rejected?.name??null;if(rejected)throw rejected;
      }
      if(options.checkpoint==='poll'){
        control.pollItems=options.pollAfterAwait?[]:[{inert:true}];
        const clockBefore=control.clockReads;
        let rejected;try{await until(control.pollItems,0,()=>true,1);}catch(error){rejected=error;}
        control.pollClockReads=control.clockReads-clockBefore;
        control.checkpointRejected=rejected?.name??null;if(rejected)throw rejected;
      }
      if(options.mainFailure)throw new Error('inert later main refusal');
      const consoleErrors=[],requestErrors=[],unexpectedHTTP=[];
${terminal}
${finish}
runInert(options);`;
  const promise=runInContext(body,sandbox,{filename:'actual-observer-source-extraction.mjs',timeout:2000});
  try{await promise;}catch(error){control.rejection=error;}
  writeFileSync(join(caseOutput,'inert-control.json'),JSON.stringify({...control,
    rejection:control.rejection?{name:control.rejection.name,message:control.rejection.message,stack:control.rejection.stack}:null},null,2));
  if(control.rejection?.name==='AssertionError')throw control.rejection;
  assert.equal(control.oracle_errors.length,0,control.oracle_errors[0]?.message);
  if(options.valid){
    assert.equal(control.rejection,null,'Valid inert callback controls remain successful');
    assert.equal(control.report.status,'pass');
  }else{
    if(['check','poll'].includes(options.checkpoint))assert.equal(control.checkpointRejected,'SyntaxError','Actual '+options.checkpoint+' checkpoint must reject before later outcome guards');
    if(options.checkpoint==='poll' && !options.pollAfterAwait)assert.equal(control.pollClockReads,0,'Actual poll entry must reject before clock/predicate/wait work');
    assert.ok(!control.statuses.some(item=>item.value==='pass' && item.afterMalformedCallback),'A latched malformed callback cannot cross the real terminal pass boundary');
    assert.equal(control.rejection?.name,'SyntaxError','Observer failure must reach actual main/finally/outcome as the primary error');
    if(options.messages?.[0]===raw || options.late)assert.equal(control.rejection.message,expected.message,'First actual parser failure survives later errors');
    assert.equal(control.report.status,'failed');
    const failures=control.report.observer_failures;
    assert.equal(failures?.length,(options.messages??[]).length+(options.late?1:0),'Every malformed received raw is retained');
    const wanted=options.late?[raw]:options.messages;
    failures.forEach((item,i)=>{assert.equal(item.text,wanted[i]);assert.match(item.error,/SyntaxError/);assert.ok(item.stack.length>0);});
    if(options.failWrites?.includes('observer-failures.json'))assert.ok(failures[0].persistence_errors.some(item=>item.error.includes('inert persistence refusal')),'Synchronous retention failure remains explicit');
    if(!options.failWrites?.includes('result.json')){
      const persisted=JSON.parse(readFileSync(join(caseOutput,'result.json'),'utf8'));
      assert.equal(persisted.status,'failed','Actual finally persistence must record failure');
      assert.equal(persisted.observer_failures[0].text,wanted[0]);
    }else assert.match(control.report.persist_error,/inert persistence refusal/,'Outcome persistence failure must remain retained');
    if(options.cleanupFailure)assert.match(control.report.cleanup_error,/inert later cleanup refusal/);
  }
  assert.equal(control.cleanups,1,'Actual main finally must perform cleanup exactly once');
  if(options.pollAfterAwait)assert.equal(control.waits,1,'After-await poll path must deliver exactly one callback');
  else assert.equal(control.waits,0,'Latched failure must not wait for another observation');
  control.events.push('persist-complete');
  const row={name:options.name,status:'pass',cleanup_count:control.cleanups,wait_count:control.waits,
    immediate:control.immediate,report:control.report,rejection:control.rejection?{name:control.rejection.name,message:control.rejection.message,stack:control.rejection.stack}:null};
  rows.push(row);console.log('PASS observer_case '+options.name);
}
await exercise({name:'valid-inert-controls',valid:true,messages:['inert unclassified console message',envelope('inert text without a runtime tag'),'ST_TEST_INPUT '+JSON.stringify({inert:true})]});
for(const checkpoint of ['check','poll','terminal'])await exercise({name:'partial-runtime-'+checkpoint,messages:[raw],checkpoint});
await exercise({name:'malformed-envelope',messages:[later],checkpoint:'check'});
await exercise({name:'malformed-input',messages:[malformedInput],checkpoint:'check'});
await exercise({name:'first-error-and-all-raw',messages:[raw,later],checkpoint:'check'});
await exercise({name:'synchronous-retention-refusal',messages:[raw],checkpoint:'check',failWrites:['observer-failures.json']});
await exercise({name:'final-persistence-refusal',messages:[raw],checkpoint:'check',failWrites:['result.json']});
await exercise({name:'later-main-and-cleanup-refusal',messages:[raw],mainFailure:true,cleanupFailure:true});
await exercise({name:'late-callback-during-cleanup',messages:[],late:true});
await exercise({name:'late-callback-and-cleanup-refusal',messages:[],late:true,cleanupFailure:true});
await exercise({name:'observer_poll_rejects_callback_after_await_before_matching_return',messages:[raw],checkpoint:'poll',pollAfterAwait:'iteration'});
await exercise({name:'observer_poll_deadline_retains_first_observer_error',messages:[raw],checkpoint:'poll',pollAfterAwait:'deadline'});
writeFileSync(join(output,'observations.json'),JSON.stringify({schema:'inert-actual-observer-regression/v1',source_sha256:digest(bytes),fixture_sha256:digest(readFileSync(fixturePath)),node_pid:process.pid,rows},null,2));
console.log('PASS actual observer callback regression: '+rows.length+' finite inert cases');
"""
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        argv = [r'C:/Program Files/nodejs/node.exe', '--input-type=module', '-',
                str(source), str(fixture), str(output), source_hash]
        (output / 'driver.mjs').write_text(script, encoding='utf8')
        started = datetime.now(timezone.utc).isoformat()
        child = subprocess.Popen(argv, cwd=worktree, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, env=dict(os.environ, GIT_OPTIONAL_LOCKS='0'))
        stdout, stderr = child.communicate(script.encode('utf8'), timeout=25)
        (output / 'stdout.txt').write_bytes(stdout)
        (output / 'stderr.txt').write_bytes(stderr)
        (output / 'command.json').write_text(json.dumps({'argv': argv, 'cwd': str(worktree),
            'pid': child.pid, 'parent_pid': os.getpid(), 'started': started,
            'finished': datetime.now(timezone.utc).isoformat(), 'exit': child.returncode,
            'source_sha256': source_hash, 'fixture_sha256': hashlib.sha256(fixture.read_bytes()).hexdigest(),
            'node_sha256': hashlib.sha256(Path(argv[0]).read_bytes()).hexdigest(),
            'test_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'driver_sha256': hashlib.sha256(script.encode('utf8')).hexdigest(),
            'output_root': str(output_root), 'resolved_output': str(output.resolve()),
            'scope': 'finite inert extraction, no browser/runtime/control receipt'}, indent=2), encoding='utf8')
        print('OBSERVER_REGRESSION_EVIDENCE=' + str(output), flush=True)
        print(stdout.decode('utf8', 'replace'), end='', flush=True)
        self.assertEqual(child.returncode, 0, stderr.decode('utf8', 'replace'))
