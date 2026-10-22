"""Four declared private observation faults through the actual admission path.

These copied JSON records are guard fixtures, never runtime or native receipts.
No browser storage, gameplay currency, project source or provider is mutated.
"""
from copy import deepcopy
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
import inspect
import textwrap
import re
from unittest.mock import patch

sys.dont_write_bytecode = True
TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
spec = importlib.util.spec_from_file_location('shop_actual_loop_verifier', TOOLS / 'verify_last_stand_loop.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def _current_control_fixture():
    """Invented current control inventory for parser tests, never runtime evidence."""
    core = ('ToggleFitting', 'Deploy', 'Claim', 'Purchase', 'Redeploy', 'RetrySave', 'Pause', 'ToggleMute', 'ToggleTier', 'Effects',
            'Menu', 'SpeedMinus', 'SpeedRate', 'SpeedPlus')
    shop = ('ShopEntry', 'ShopClose', 'ShopTabAttack', 'ShopTabDefense', 'ShopTabUtility',
            'ShopCard_cannonAttackBuy', 'ShopCard_launcherAttackBuy', 'ShopCard_hullCapacityBuy',
            'ShopCard_armorBuy', 'ShopCard_cannonCycleBuy', 'ShopCard_fieldRepairBuy')
    settings = ('SettingsClose', 'SettingsTab0', 'SettingsTab1', 'SettingsTab2', 'SettingsTab3',
                'MenuResume', 'MenuSettings', 'MenuHelp', 'MenuAbandon', 'MenuCampaigns', 'MenuAbout', 'SettingsBack', 'SettingsMute',
                'MasterMinus', 'MasterPlus', 'EffectsMinus', 'EffectsPlus', 'EffectsSample', 'MusicEnabled', 'MusicMinus', 'MusicPlus',
                'DisplayQuality', 'DisplayEffects', 'DisplayFullscreen', 'TutorialTips', 'PurchaseSuggestions', 'GameplayHelp',
                'DataRetry', 'PreferencesRetry', 'DataAccount', 'SettingsDefaults', 'ConfirmCancel', 'ConfirmProceed')
    def controls(names):
        return [dict(name=name, label=name, accessibleLabel=name, mode='', trackKey='',
                     x=0, y=0, width=44, height=44, active=True, interactable=True) for name in names]
    return dict(phase='garage', coordinates='top-left', selection='Deploy', width=1366, height=768,
                pixelRatio=1, scrollOffset=0, maximumScrollOffset=0,
                settingsScrollOffset=0, settingsMaximumScrollOffset=0,
                controls=controls(core), shopControls=controls(shop), settingsControls=controls(settings))


def _replace_recovery_copies(value, old, new):
    """JSON witnesses are independent copies; replace every exact observation."""
    if isinstance(value, dict):
        if value == old:
            value.clear(); value.update(deepcopy(new))
        else:
            for child in value.values():
                _replace_recovery_copies(child, old, new)
    elif isinstance(value, list):
        for child in value:
            _replace_recovery_copies(child, old, new)


def _mutate_recovery_row(report, collection, row, changes):
    old = deepcopy(row); new = dict(old, **changes)
    _replace_recovery_copies(report, old, new)
    envelope = report['records']['runtime'][old['seq']]
    tag = {'states': 'ST_LS_STATE ', 'encounters': 'ST_ENC_STATE ',
           'shopStates': 'ST_LS_SHOP_STATE ', 'combat': 'ST_LS_SHOP_COMBAT '}[collection]
    payload = json.loads(envelope['text'].split(tag)[1].split('\n')[0])
    payload.update({key: new[key] for key in payload})
    envelope['text'] = tag + json.dumps(payload, separators=(',', ':'))
    for key in ('t', 'timeOrigin', 'load', 'order', 'documentHidden', 'documentFocused'):
        if key in new:
            envelope[key] = new[key]


def _rewrite_storage_event(event):
    event['emittedRaw'] = 'ST_TEST_STORAGE ' + json.dumps(
        {key: value for key, value in event.items() if key not in ('load', 'seq', 'order', 'emittedRaw')},
        separators=(',', ':'))


def _mutate_recovery_snapshot(report, snapshot, data):
    old = deepcopy(snapshot)
    new = dict(old, data=deepcopy(data), raw=json.dumps(data, separators=(',', ':')))
    _replace_recovery_copies(report, old, new)
    event = next(row for row in report['records']['storageEvents'] if row.get('op') == 'snapshot'
                 and all(row.get(key) == old[key] for key in ('label', 'load', 'timeOrigin', 't')))
    event['raw'] = new['raw']; _rewrite_storage_event(event)


def _recovery_read_fault(report, label, fault):
    candidate = deepcopy(report)
    case = candidate['storage_cases'][label]
    action = candidate['actions'][case['retry_action']]
    publication = case['recovered']['state']
    raw = case['recovered']['storage']['raw']
    affected = [row for row in candidate['records']['storageEvents'] if row['op'] == 'get'
                and row['mode'] == 'pass' and row['load'] == action['load']
                and action['before'] <= row['t'] <= publication['t'] and row.get('value') == raw]
    if not affected:
        raise AssertionError('The admitted baseline has no application confirmation to mutate')
    foreign = next(row for row in candidate['records']['runtime'] if row['load'] != action['load'])
    for row in affected:
        if fault == 'missing-read':
            candidate['records']['storageEvents'].remove(row)
        elif fault == 'wrong-bytes':
            row['value'] = '{}'
        elif fault == 'foreign-document':
            row.update(load=foreign['load'], timeOrigin=foreign['timeOrigin'])
        elif fault == 'late-read':
            row.update(t=publication['t'] + 1, order=publication['order'] + 1)
        else:
            raise AssertionError('Unknown private confirmation mutation')
        _rewrite_storage_event(row)
    for seq, row in enumerate(candidate['records']['storageEvents']):
        row['seq'] = seq
    return candidate


def _recovery_pointer_fault(report, outside):
    candidate = deepcopy(report)
    action = candidate['actions'][candidate['storage_cases']['claim-uncertain']['action']]
    layout = next(row for row in candidate['records']['controlsOnly'] if row['seq'] == action['layoutSeq'])
    canvas = action['canvas']
    if outside:
        point = (canvas['x'] - 2, canvas['y'] - 2)
    else:
        other = next(row for row in layout['controls'] + layout['shopControls']
                     if row['active'] and row['interactable'] and row['name'] != action['name'])
        point = (canvas['x'] + (other['x'] + other['width'] / 2) * canvas['width'] / layout['width'],
                 canvas['y'] + (other['y'] + other['height'] / 2) * canvas['height'] / layout['height'])
    for row in list(candidate['records']['input']):
        if row.get('load') == action['load'] and row.get('kind') in ('pointerdown', 'pointerup') \
                and action['before'] <= row['t'] <= action['after']:
            _replace_recovery_copies(candidate, deepcopy(row), dict(row, x=point[0], y=point[1]))
    action.update(x=point[0], y=point[1])
    return candidate


def _unit_need(condition, message):
    if not condition:
        raise AssertionError(message)


def _legacy_unit_fragment(start, end, values):
    """Exercise the original admission clause for regression RED, never a report.

    Once a clause has a pure production helper, the same tests call that helper.
    This fallback executes the actual pre-correction clause with explicit unit
    values. It neither admits a report nor substitutes a successful runtime.
    """
    source = inspect.getsource(verifier.verify_shop_recovery)
    first = source.index(start)
    fragment = textwrap.dedent(source[first:source.index(end, first)])
    namespace = dict(values, need=_unit_need)
    exec(compile(fragment, '<actual-recovery-unit-clause>', 'exec'), namespace, namespace)


class ShopRecoveryUnitTests(unittest.TestCase):
    """Small invented unit values only; these are never browser qualification."""

    def __str__(self):
        return f'{self._testMethodName} ({type(self).__module__}.{type(self).__qualname__})'

    def test_recovery_deploy_selects_actual_ready_run_projection(self):
        import subprocess
        script = r'''
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const all=readFileSync(process.argv[1],'utf8'),source=all.slice(all.indexOf('async function runShopRecoveryJourney('));
const start=source.indexOf('const deployedLedger='),helper=start<0?'':source.slice(start,source.indexOf('    const terminalReady=',start));
for(const [name,runId]of [['game.deploy',1],['game.redeploy',2],['finalCase.deploy',3]]){
 const transient={load:5,timeOrigin:5000,runId,tick:0,hasActiveLedger:true,phase:'garage',mode:'Permanent',spendable:false,cards:[]};
 const ready={...transient,phase:'battle',mode:'Run',spendable:true,cards:Array.from({length:6},(_,i)=>({trackId:i,p:0,n:0}))};
 const prefix=name+'=',first=source.indexOf(prefix),assignment=source.slice(first,source.indexOf(';',first)+1);
 const context={load:5,records:{shopStates:[transient,ready]},game:{},finalCase:{},
 until:async(items,offset,predicate)=>{for(const item of items)if(predicate(item))return item;throw new Error('Missing actual ready ledger');}};
 await runInNewContext('(async()=>{'+helper+assignment+'})()',context);
 const actual=name.startsWith('game.')?context.game[name.split('.')[1]]:context.finalCase.deploy;
 assert.equal(actual,ready,'Deployment must retain the actual battle/Run cards, not the transient unpublished view: '+name);
}
console.log('PASS three actual deploy selections ignore transient empty Shop projection');
'''
        result = subprocess.run([r'C:/Program Files/nodejs/node.exe', '--input-type=module', '-e', script,
                                 str(TOOLS.parents[1] / 'e2e/helpers/lastStandJourney.mjs')], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def projection_fixture(self, empty=False):
        keys = ['cannonAttack', 'launcherAttack', 'hullCapacity', 'armor', 'cannonCycle', 'fieldRepair']
        levels = [1, 0, 0, 0, 0, 0]
        identity = {'load': 2, 'timeOrigin': 2000}
        shop = dict(identity, seq=11, t=11, phase='result' if empty else 'workshop', mode='Permanent', open=not empty,
                    spendable=not empty, salvage=2, permanentLevels=levels,
                    cards=[] if empty else [{'key': key, 'trackId': i, 'p': levels[i]} for i, key in enumerate(keys)])
        layout = dict(identity, seq=10, t=10, phase=shop['phase'], shopControls=[{'name': 'ShopEntry', 'active': not empty, 'interactable': True}])
        state = dict(identity, seq=12, t=12, phase=shop['phase'], wallet=2, level=1)
        return shop, {'shopStates': [shop], 'controlsOnly': [layout], 'states': [state]}

    def admit_projection(self, shop, records):
        helper = getattr(verifier, '_verify_recovery_shop_projection', None)
        if helper:
            return helper(shop, records)
        # Exercise the existing unconditional six-card clause for behavioral RED.
        source = inspect.getsource(verifier.verify_shop_recovery)
        first = source.index('    def cards(state):')
        body = textwrap.dedent(source[first:source.index('\n    actions, bound, edges', first)])
        namespace = {'need': _unit_need, 'keys': {'cannonAttack', 'launcherAttack', 'hullCapacity', 'armor', 'cannonCycle', 'fieldRepair'}}
        exec(compile(body, '<actual-old-card-clause>', 'exec'), namespace, namespace)
        return namespace['cards'](shop)

    def test_recovery_empty_projection_requires_actual_committed_levels_and_closed_controls(self):
        shop, records = self.projection_fixture(True)
        self.admit_projection(shop, records)
        for fault in ('missing-levels', 'short-levels', 'bool-level', 'excess-level', 'open', 'spendable',
                      'foreign-state', 'stale-controls', 'active-control', 'wrong-wallet', 'wrong-phase'):
            candidate, trace = deepcopy((shop, records))
            if fault == 'missing-levels': candidate.pop('permanentLevels')
            elif fault == 'short-levels': candidate['permanentLevels'].pop()
            elif fault == 'bool-level': candidate['permanentLevels'][0] = True
            elif fault == 'excess-level': candidate['permanentLevels'][0] = 4
            elif fault == 'open': candidate['open'] = True
            elif fault == 'spendable': candidate['spendable'] = True
            elif fault == 'foreign-state': trace['states'][0]['timeOrigin'] = 1000
            elif fault == 'stale-controls': trace['controlsOnly'][0]['t'] = -2000
            elif fault == 'active-control': trace['controlsOnly'][0]['shopControls'][0]['active'] = True
            elif fault == 'wrong-wallet': trace['states'][0]['wallet'] = 3
            else: candidate['phase'] = 'battle'
            trace['shopStates'][0] = candidate
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_PROJECTION:'):
                self.admit_projection(candidate, trace)

    def test_recovery_ready_projection_keeps_all_six_cards_and_committed_values(self):
        shop, records = self.projection_fixture()
        self.admit_projection(shop, records)
        for fault in ('missing-levels', 'short-cards', 'wrong-level', 'wrong-track', 'empty-ready'):
            candidate, trace = deepcopy((shop, records))
            if fault == 'missing-levels': candidate.pop('permanentLevels')
            elif fault == 'short-cards': candidate['cards'].pop()
            elif fault == 'wrong-level': candidate['cards'][3]['p'] = 1
            elif fault == 'wrong-track': candidate['cards'][3]['trackId'] = 2
            else: candidate['cards'] = []
            trace['shopStates'][0] = candidate
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_PROJECTION:'):
                self.admit_projection(candidate, trace)

    def test_confirmation_integration_committed_levels_publish_even_without_cards(self):
        for empty in (False, True):
            fixture = self.confirmation_publication_fixture()
            for row in list(fixture['records']['shopStates']):
                changes = {'permanentLevels': [card['p'] for card in row['cards']]}
                if empty: changes['cards'] = []
                _mutate_recovery_row(fixture, 'shopStates', row, changes)
                envelope = fixture['records']['runtime'][row['seq']]
                payload = json.loads(envelope['text'].split('ST_LS_SHOP_STATE ')[1])
                payload['permanentLevels'] = changes['permanentLevels']
                envelope['text'] = 'ST_LS_SHOP_STATE ' + json.dumps(payload)
            self.admit_confirmation_publications(fixture)
            row = fixture['case']['provisional_shop']
            levels = list(row['permanentLevels']); levels[3] = 1
            _mutate_recovery_row(fixture, 'shopStates', row, {'permanentLevels': levels})
            with self.subTest(empty=empty), self.assertRaisesRegex(AssertionError, '^RECOVERY_CONFIRMATION: unit-case$'):
                self.admit_confirmation_publications(fixture)
            # The same actual publication is admissible only after application confirmation.
            for event in fixture['records']['storageEvents']:
                if event['mode'] == 'pass':
                    event['t'] = event['order'] = 17
                    _rewrite_storage_event(event)
            self.admit_confirmation_publications(fixture)

    def test_recovery_document_origin_retains_delayed_old_observations(self):
        import subprocess
        script = r'''
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const all=readFileSync(process.argv[1],'utf8'), source=all.slice(all.indexOf('async function runShopRecoveryJourney('));
const mapping=source.indexOf('const documentLoads='), listener=source.indexOf("page.on('console',message=>{");
const body=source.slice(mapping<0?listener:mapping,source.indexOf("    page.on('pageerror'",listener));
const records={runtime:[],shopStates:[],purchases:[],combat:[],states:[],encounters:[],controlsOnly:[],input:[],storageEvents:[],geometry:[]};
let callback;
const context={assert,Number,Map,records,messages:[],load:1,report:{},observerError:null,persist(){},
 page:{on(name,fn){assert.equal(name,'console');callback=fn;}}};
runInNewContext(body,context);
const emit=(tag,value)=>callback({text:()=>tag+JSON.stringify(value),type:()=>'log',location:()=>({})});
const runtime=(origin,t,action)=>({timeOrigin:origin,t,text:'ST_LS_STATE '+JSON.stringify({action,phase:'battle'})});
emit('ST_TEST_SHOP ',runtime(1000,10,'first'));
context.load=2;
emit('ST_TEST_SHOP ',runtime(2000,10,'new-document'));
emit('ST_TEST_SHOP ',runtime(1000,30,'delayed-old-document'));
for(const tag of ['ST_TEST_INPUT ','ST_TEST_STORAGE ','ST_TEST_GEOMETRY '])emit(tag,{timeOrigin:1000,t:31,kind:'unit',op:'unit'});
assert.equal(context.observerError,null);
assert.deepEqual(Array.from(records.runtime,row=>[row.load,row.timeOrigin,row.seq]),[[1,1000,0],[2,2000,1],[1,1000,2]],
 'Late actual old-document runtime keeps its original load without dropping/reclocking');
assert.deepEqual(Array.from(records.states,row=>row.load),[1,2,1]);
assert.deepEqual(Array.from(context.messages,row=>row.load),[1,2,1,1,1,1],'Raw stamped console records retain the same actual origin');
for(const key of ['input','storageEvents','geometry'])assert.equal(records[key][0].load,1,'Every stamped observation retains its real origin: '+key);
assert.equal(records.runtime[2].t,30);assert.equal(records.runtime[2].text,'ST_LS_STATE {"action":"delayed-old-document","phase":"battle"}');
emit('ST_TEST_SHOP ',runtime(3000,1,'unknown-conflicting-origin'));
assert.ok(context.observerError,'A second unseen document cannot silently replace the established current origin');
assert.ok(context.report.observer_failure.raw.includes('3000'),'Invalid observation remains diagnostic evidence');
console.log('PASS actual late-document collection and conflicting-origin refusal');
'''
        result = subprocess.run([r'C:/Program Files/nodejs/node.exe', '--input-type=module', '-e', script,
                                 str(TOOLS.parents[1] / 'e2e/helpers/lastStandJourney.mjs')], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_terminal_away_waits_for_actual_living_combat_before_hiding(self):
        import subprocess
        script = r'''
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const all=readFileSync(process.argv[1],'utf8'), source=all.slice(all.indexOf('async function runShopRecoveryJourney('));
const start=source.indexOf('const terminalReady='), helper=start<0?'':source.slice(start,source.indexOf('    const claimReady=',start));
const first=source.indexOf('let terminalOther,terminalError;'), last=source.indexOf('      finalCase.defeat=await',first);
const identity={load:3,timeOrigin:3000};
const deployed={...identity,t:1,tick:0,action:'deploy',run:1,status:'Running',hp:120};
const good={...identity,t:67000,tick:1340,action:'tick',run:1,status:'Running',hp:115,kills:24,paused:false,
 catchingUp:false,failed:false,callbackSteps:1,documentHidden:false,documentFocused:true};
const rows=[{...good,t:100,tick:2,hp:120}, {...good,timeOrigin:2000}, {...good,catchingUp:true},good];
const records={encounters:[deployed],input:[]};let seen=0,hidden=false;
const finalCase={deploy:{...identity,t:2,tick:0,runId:3}};
const clock=async()=>({...identity,t:67010+(hidden?100:0),hidden,focused:!hidden});
const context={assert,records,finalCase,load:3,nativeMode:true,current:items=>items.at(-1),clock,check:assert.ok,
 until:async(items,offset,predicate,seconds)=>{assert.ok(seconds<=90);for(const row of rows){items.push(row);seen++;if(predicate(row))return row;}throw new Error('No real ready combat');},
 native:{context:{async newPage(){assert.equal(seen,4,'Do not hide a fresh run before actual living, settled combat is ready');
   return {async goto(){},async bringToFront(){hidden=true;}};}}},page:{async waitForFunction(){assert.ok(hidden);}}};
await runInNewContext('(async()=>{'+helper+source.slice(first,last)+'}finally{}})()',context);
assert.equal(seen,4);assert.equal(finalCase.pre_hide.encounter,good);assert.equal(finalCase.pre_hide.clock.hidden,false);
assert.equal(finalCase.terminal_away.begin.hidden,true);
console.log('PASS actual observation-driven terminal-away orchestration');
'''
        result = subprocess.run([r'C:/Program Files/nodejs/node.exe', '--input-type=module', '-e', script,
                                 str(TOOLS.parents[1] / 'e2e/helpers/lastStandJourney.mjs')], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_terminal_away_admission_rejects_stale_dead_or_foreign_pre_hide(self):
        identity = {'load': 3, 'timeOrigin': 3000}
        deployed = dict(identity, action='deploy', run=1, tick=0, t=1)
        observed = dict(identity, action='tick', run=1, tick=1340, t=67000, hp=115, kills=24, status='Running',
                        paused=False, catchingUp=False, failed=False, callbackSteps=1, documentHidden=False, documentFocused=True)
        clock = dict(identity, t=67010, hidden=False, focused=True)
        begin = dict(identity, t=67110, hidden=True, focused=False)
        defeat = dict(identity, run=1, t=78000, tick=1557, status='Defeated', documentHidden=True, documentFocused=False)
        game = {'deploy': dict(identity, runId=3, tick=0, t=2), 'pre_hide': {'deploy': deployed, 'encounter': observed, 'clock': clock},
                'defeat': defeat, 'terminal_away': {'begin': begin}}
        report = {'terminal_case': game}; records = {'encounters': [deployed, observed, defeat], 'clocks': [clock, begin]}
        helper = getattr(verifier, '_verify_recovery_terminal_away_start', None)
        if helper:
            helper(report, records)
        # Old admission has no pre-hide boundary at all. An absent clause is an
        # actual method gap, not a browser fixture or qualification substitute.
        for fault in ('fresh-run', 'terminal', 'stale', 'foreign-document', 'wrong-run', 'pending-debt', 'visible-defeat'):
            candidate = deepcopy(report); trace = deepcopy(records)
            ready = candidate['terminal_case']['pre_hide']; old = deepcopy(ready['encounter'])
            if fault == 'fresh-run': ready['encounter'].update(tick=0, hp=120)
            elif fault == 'terminal': ready['encounter'].update(status='Defeated', hp=0)
            elif fault == 'stale':
                ready['clock']['t'] += 5000
                candidate['terminal_case']['terminal_away']['begin']['t'] += 5000
            elif fault == 'foreign-document': ready['encounter']['timeOrigin'] = 2000
            elif fault == 'wrong-run': ready['encounter']['run'] = 2
            elif fault == 'pending-debt': ready['encounter']['catchingUp'] = True
            else: candidate['terminal_case']['defeat']['documentHidden'] = False
            _replace_recovery_copies(trace, old, ready['encounter'])
            if fault == 'stale':
                trace['clocks'][0] = deepcopy(ready['clock'])
                trace['clocks'][1] = deepcopy(candidate['terminal_case']['terminal_away']['begin'])
            if fault == 'visible-defeat': trace['encounters'][-1] = deepcopy(candidate['terminal_case']['defeat'])
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_TERMINAL_START:'):
                if helper: helper(candidate, trace)

    def test_method_claim_waits_for_result_and_current_control(self):
        """Execute the real readiness closure, with bounded observed transitions."""
        import subprocess
        script = r'''
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(process.argv[1],'utf8');
const first=source.indexOf('const claimReady=',source.indexOf('async function runShopRecoveryJourney('));
const identity={load:4,timeOrigin:4000}, records={states:[],controlsOnly:[]};
const settling={...identity,t:10,phase:'settling',saveState:'ready',pendingRunId:3};
const ready={...settling,t:30,phase:'result'};
const layout=(t,changes={})=>({...identity,t,phase:'result',controls:[{name:'Claim',active:true,interactable:true}],...changes});
const rows=[{state:settling,layout:layout(10,{controls:[{name:'Claim',active:false,interactable:false}]})},
 {state:{...ready,timeOrigin:3000},layout:layout(20,{timeOrigin:3000})},
 {state:{...ready,pendingRunId:2},layout:layout(25)},
 {state:ready,layout:layout(29,{phase:'settling'})}, {state:ready,layout:layout(31)}];
let observed=0,clicks=0;
const context={records,load:4,current:rows=>rows.at(-1),check:assert.ok,
 storage:async()=>({load:4,timeOrigin:4000,t:32,data:{pendingDefeat:{runId:3,reward:1}}}),
 until:async(items,start,predicate,seconds)=>{assert.ok(seconds<=10);for(const row of rows){
   records.states.push(row.state);records.controlsOnly.push(row.layout);observed++;
   const value=items.at(-1);if(predicate(value))return value;}
   throw new Error('No admissible actual observation');},
 click:async()=>{clicks++;assert.ok(observed===5,'Claim must await current result/control, not terminal accounting');}};
if(first<0){
 // This is the actual pre-correction terminal input, not a replacement producer.
 const begin=source.indexOf("finalCase.claim_action=await click('Claim');");
 assert.ok(begin>=0);await runInNewContext('(async()=>{const finalCase={};'+source.slice(begin,source.indexOf('\n',begin))+'})()',context);
} else {
 const closure=source.slice(first,source.indexOf('    const captureFailure=',first));
 const actual=runInNewContext('(()=>{'+closure+';return claimReady;})()',context);
 const result=await actual(3,4000);
 assert.equal(observed,5,'Reject settling, foreign documents, wrong runs and stale controls');
 assert.equal(result.state,ready);assert.equal(result.layout.t,31);
 assert.equal(result.storage.data.pendingDefeat.reward,1);
 assert.equal(clicks,0,'Readiness observes; only the existing input owner clicks');
}
console.log('PASS actual Claim readiness sequence');
'''
        result = subprocess.run([r'C:/Program Files/nodejs/node.exe', '--input-type=module', '-e', script,
                                 str(TOOLS.parents[1] / 'e2e/helpers/lastStandJourney.mjs')],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def admit_method(self, report):
        helper = getattr(verifier, '_verify_recovery_method', None)
        if helper:
            return helper(report)
        # The old real admission prefix admitted v1 with no compiled layer.
        _legacy_unit_fragment("    need(isinstance(report, dict)", '\n    native =', {'report': report})

    def test_method_admission_requires_both_layers(self):
        old = {'schema': 'singedterra-shop-recovery/v1'}
        with self.assertRaisesRegex(AssertionError, '^RECOVERY_METHOD:'):
            self.admit_method(old)
        report = {'schema': 'singedterra-shop-recovery/v2', 'verification_method': 'compiled-and-browser/v1'}
        with self.assertRaisesRegex(AssertionError, '^RECOVERY_COMPILED:'):
            self.admit_method(report)
        with self.assertRaisesRegex(AssertionError, '^RECOVERY_COMPILED:'):
            verifier.verify_shop_recovery(report)

    def compiled_fixture(self, directory):
        """Explicit invented unit files; never a runtime/Unity receipt."""
        import hashlib
        root = directory / 'unit-worktree'; project = root / 'campaign-unity/Unity'
        source = project / 'Assets/Editor/LastStandShopChecks.cs'
        source.parent.mkdir(parents=True); source.write_text('// invented unit source')
        editor = directory / 'unit-Unity.exe'; editor.write_bytes(b'unit executable')
        sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
        sources = {source.relative_to(root).as_posix(): sha(source)}
        methods = {'RunIncome': ['test_income_hidden_partition_and_terminal_snapshot', 'test_income_final_tick_refresh_and_next_run'],
                   'RunSettle': ['test_settle_purchase_old_stats_and_debt_refusal', 'test_settle_pause_focus_close_and_stale_input']}
        descriptor = {'schema': 'singedterra-shop-compiled-boundaries/v1', 'methods': {}}
        for method, tests in methods.items():
            evidence = directory / method; evidence.mkdir()
            log = evidence / 'unity-editor.log'
            log.write_text('ST_LS_SHOP_COMPILED\n' + ''.join('ST_LS_SHOP_PASS '+name+'\n' for name in tests))
            archived = evidence / 'source-archive' / source.relative_to(root)
            archived.parent.mkdir(parents=True); archived.write_bytes(source.read_bytes())
            assemblies = {}
            for name in ('Assembly-CSharp.dll', 'Assembly-CSharp-Editor.dll'):
                path = evidence / 'compiled-assemblies' / name; path.parent.mkdir(exist_ok=True)
                path.write_bytes(('unit '+name).encode()); assemblies[name] = sha(path)
            invocation = {'argv': [str(editor), '-batchmode', '-nographics', '-quit', '-projectPath', str(project),
                '-executeMethod', 'LastStandShopChecks.'+method, '-logFile', str(log)],
                'cwd': str(root), 'source_sha256': sources, 'unity_sha256': sha(editor), 'pid': 123}
            result = {'exit': 0, 'timed_out': False, 'source_unchanged': True, 'source_sha256_after': sources,
                      'compiled_assemblies_sha256': assemblies, 'log_sha256': sha(log)}
            for name, value in (('invocation.json', invocation), ('result.json', result)):
                (evidence / name).write_text(json.dumps(value))
            descriptor['methods'][method] = {'directory': str(evidence),
                'files': {name: sha(evidence / name) for name in ('invocation.json', 'result.json', 'unity-editor.log')}}
        return root, editor, descriptor

    def test_method_compiled_layers_reject_missing_failed_stale_and_wrong_binding(self):
        import tempfile
        import hashlib
        with tempfile.TemporaryDirectory(prefix='st-method-unit-') as temp:
            root, editor, descriptor = self.compiled_fixture(Path(temp))
            report = {'schema': 'singedterra-shop-recovery/v2', 'verification_method': 'compiled-and-browser/v1',
                      'compiled_boundaries': descriptor}
            if not hasattr(verifier, '_verify_recovery_method'):
                report['schema'] = 'singedterra-shop-recovery/v1'  # Original method's accepted envelope for target RED.
            with patch.object(verifier, 'ROOT', root / 'campaign-unity'), patch.object(verifier, 'EDITOR', editor):
                self.admit_method(report)
                # A complete compiled layer can never replace actual browser evidence.
                with self.assertRaises(AssertionError):
                    verifier.verify_shop_recovery(report)
                for fault in ('missing-layer', 'failed', 'timed-out', 'source-changed', 'wrong-method',
                              'missing-identity', 'failed-identity', 'stale-source', 'stale-archive', 'stale-assembly'):
                    candidate = deepcopy(report); method = candidate['compiled_boundaries']['methods']['RunSettle']
                    evidence = Path(method['directory']); edited = None; original = None
                    if fault == 'missing-layer':
                        del candidate['compiled_boundaries']['methods']['RunIncome']
                    else:
                        filename = {'failed': 'result.json', 'timed-out': 'result.json', 'source-changed': 'result.json',
                                    'wrong-method': 'invocation.json', 'missing-identity': 'unity-editor.log',
                                    'failed-identity': 'unity-editor.log', 'stale-source': 'source',
                                    'stale-archive': 'archive', 'stale-assembly': 'assembly'}[fault]
                        edited = {'source': root / 'campaign-unity/Unity/Assets/Editor/LastStandShopChecks.cs',
                                  'archive': evidence / 'source-archive/campaign-unity/Unity/Assets/Editor/LastStandShopChecks.cs',
                                  'assembly': evidence / 'compiled-assemblies/Assembly-CSharp.dll'}.get(filename, evidence / filename)
                        original = edited.read_bytes()
                        if filename.endswith('.json'):
                            value = json.loads(original)
                            if fault == 'failed': value['exit'] = 1
                            elif fault == 'timed-out': value['timed_out'] = True
                            elif fault == 'source-changed': value['source_unchanged'] = False
                            else: value['argv'][7] = 'LastStandShopChecks.RunIncome'
                            edited.write_text(json.dumps(value))
                        elif filename == 'unity-editor.log':
                            edited.write_bytes(original.replace(b'ST_LS_SHOP_PASS test_settle_purchase_old_stats_and_debt_refusal',
                                b'ST_LS_SHOP_FAIL test_settle_purchase_old_stats_and_debt_refusal' if fault == 'failed-identity' else b'NOT_A_TEST'))
                            result_path = evidence / 'result.json'; saved_result = result_path.read_bytes()
                            value = json.loads(saved_result); value['log_sha256'] = hashlib.sha256(edited.read_bytes()).hexdigest()
                            result_path.write_text(json.dumps(value))
                            method['files']['result.json'] = hashlib.sha256(result_path.read_bytes()).hexdigest()
                        else: edited.write_bytes(original + b' changed')
                        if filename in method['files']:
                            method['files'][filename] = hashlib.sha256(edited.read_bytes()).hexdigest()
                    try:
                        with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_COMPILED:'):
                            self.admit_method(candidate)
                    finally:
                        if edited: edited.write_bytes(original)
                        if fault in ('missing-identity', 'failed-identity'): result_path.write_bytes(saved_result)

    def test_method_terminal_accepts_truthful_zero_kill_and_actual_spending(self):
        report, records = self.terminal_fixture()
        report['schema'] = 'singedterra-shop-recovery/v2'
        game = report['terminal_case']; game['purchases'] = []
        game['final_step']['combat']['events'] = [{'kind': 'RangedHit', 'killed': False, 'slot': 0}]
        game['defeat']['kills'] = 9
        game['terminal']['finalAccounting'].update(uniqueKills=9, earnedScrap=27, spentScrap=0, finalScrap=27)
        game['result']['storage']['data']['pendingDefeat']['kills'] = 9
        game['terminal_away']['staged']['storage']['data']['pendingDefeat']['kills'] = 9
        for snapshot in (game['result'], game['terminal_away']['staged'], game['claimed']):
            snapshot['storage']['data']['tierRecords']['tier-goals-v1']['bestKills1'] = 9
        verifier._verify_recovery_terminal_boundaries(report, records, False)
        verifier._verify_recovery_terminal_boundaries(report, records, True)
        for fault in ('lost-credit', 'double-credit', 'invented-spend'):
            candidate = deepcopy(report); accounting = candidate['terminal_case']['terminal']['finalAccounting']
            accounting['earnedScrap' if fault != 'invented-spend' else 'spentScrap'] += -3 if fault == 'lost-credit' else 3
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_FINAL_STEP_KILL:'):
                verifier._verify_recovery_terminal_boundaries(candidate, records, False)

    def test_method_caught_up_purchase_is_distinct_from_pending_debt(self):
        report, records = self.debt_fixture(True)
        report['schema'] = 'singedterra-shop-recovery/v2'
        action = report['actions'][0]; result = report['gameplay']['purchase']
        observed = dict(records['encounters'][0], t=9, tick=256, catchingUp=False, callbackSteps=1)
        records['encounters'] = [observed]
        report['gameplay'].update(purchase_action=0, purchase_boundary={'kind': 'caught-up', 'encounter': observed})
        del report['gameplay']['catchup_purchase']
        helper = getattr(verifier, '_verify_recovery_purchase_boundary', verifier._verify_recovery_catchup_purchase)
        helper(report, records)
        for fault in ('false-pending', 'pending-at-input', 'foreign-document', 'late-observation'):
            candidate = deepcopy(report); trace = deepcopy(records)
            boundary = candidate['gameplay']['purchase_boundary']
            if fault == 'false-pending':
                boundary['kind'] = 'pending-debt'
            elif fault == 'pending-at-input':
                trace['encounters'].append(dict(observed, t=11, catchingUp=True))
            else:
                boundary['encounter']['timeOrigin' if fault == 'foreign-document' else 't'] = 9999
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_(PENDING_DEBT|PURCHASE_BOUNDARY):'):
                helper(candidate, trace)

    def producer_unit(self, case):
        """Execute actual T22 closures with inert sinks, never qualify a runtime."""
        import subprocess
        worktree = TOOLS.parents[1]
        script = r'''
// Bounded source-unit regression only. No browser, OS input, storage or native
// qualification. Actual recovery closures execute with inert observation/file sinks.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,basename} from 'node:path';
import {runInNewContext} from 'node:vm';

const source=readFileSync(process.argv[2],'utf8');
const selected=process.argv[3]??'all';
const begin=source.indexOf('async function runShopRecoveryJourney(');
const end=source.indexOf('// Passive probes translated verbatim',begin);
assert.ok(begin>=0&&end>begin,'Actual T22 producer boundary must exist');
const producer=source.slice(begin,end);
const between=(text,left,right)=>{
  const first=text.indexOf(left),last=text.indexOf(right,first);
  assert.ok(first>=0&&last>first,'Actual source closure boundary exists: '+left);
  return text.slice(first,last);
};
const checkpoints=between(producer,'const persist=','  const check=');
const controls=between(producer,'const placeOwned=','    const loadGame=');
const retained=between(source,'function retainWindowFailure(','function ownedNativeWindowSnapshot(');
const outcomes=[];
const test=async(name,body)=>{
  if(selected!=='all'&&selected!==name)return;
  try{const observations=await body();outcomes.push({name,status:'pass',observations});}
  catch(error){outcomes.push({name,status:'fail',error:String(error),stack:error.stack});}
};

await test('checkpoints',async()=>{
  const writes=[],serializeCounts={records:0,messages:0};
  const records={runtime:[{raw:'unit-observation-'+'.'.repeat(32768)}],input:[{kind:'unit-pointer'}],storageEvents:[{raw:'unit-storage'}]};
  for(const rows of Object.values(records))Object.defineProperty(rows,'toJSON',{value(){serializeCounts.records++;return [...this];}});
  const messages=[{type:'unit-log',text:'complete-unit-console'}];
  Object.defineProperty(messages,'toJSON',{value(){serializeCounts.messages++;return [...this];}});
  const report={status:'running',normal_speed:true,actions:[{name:'Pause'}],checks:[{name:'unit-check',pass:true}],records};
  const context={writeFileSync:(path,raw)=>writes.push({path:basename(path),raw}),path:'inert/result.json',join,
    output:'inert',report,records,messages,load:11};
  const persist=runInNewContext('(()=>{'+checkpoints+';return persist;})()',context);
  const issues=[];
  const expect=(body)=>{try{body();}catch(error){issues.push(error.message);}};
  persist();
  expect(()=>assert.equal(serializeCounts.records,0,'An active checkpoint must not serialize runtime arrays'));
  expect(()=>assert.equal(serializeCounts.messages,0,'An active checkpoint must not serialize the full console'));
  expect(()=>assert.deepEqual(writes.map(row=>row.path),['progress.json'],'An active checkpoint writes only its bounded progress record'));
  expect(()=>assert.ok(writes.reduce((size,row)=>size+Buffer.byteLength(row.raw),0)<=8192,'An active checkpoint is bounded to 8 KiB'));
  const progressFile=writes.find(row=>row.path==='progress.json');
  expect(()=>assert.ok(progressFile,'A small durable progress record remains available'));
  if(progressFile){
    const progress=JSON.parse(progressFile.raw);
    expect(()=>assert.equal(progress.status,'running'));
    expect(()=>assert.equal(progress.load,11));
    expect(()=>assert.equal(progress.actions,1));
    expect(()=>assert.equal(progress.checks,1));
    expect(()=>assert.equal(progress.messages,1));
    expect(()=>assert.deepEqual(progress.records,{runtime:1,input:1,storageEvents:1}));
  }
  for(const status of ['pass','failed']){
    writes.length=0;report.status=status;
    if(status==='failed'){report.error='controlled unit failure';report.observer_failure={error:'retained observer failure'};}
    persist();
    const full=writes.find(row=>row.path==='result.json'),consoleFile=writes.find(row=>row.path==='console.json');
    expect(()=>assert.ok(full&&consoleFile,'Terminal/failure checkpoint must retain complete report and console'));
    if(full&&consoleFile){
      expect(()=>assert.deepEqual(JSON.parse(full.raw),JSON.parse(JSON.stringify(report)),'Every terminal/failure row and witness is retained exactly'));
      expect(()=>assert.deepEqual(JSON.parse(consoleFile.raw),JSON.parse(JSON.stringify(messages)),'Complete console is retained'));
    }
  }
  assert.deepEqual(issues,[],'Checkpoint regression obligations');
  return {intermediate_byte_limit:8192,terminal_states:['pass','failed'],retains_all_rows:true};
});

await test('failure_flush',async()=>{
  const writes=[];
  const context={assert,process:{env:{ST_SHOP_TEST_EVIDENCE:'inert',ST_SHOP_QUALIFICATION:'background-native'}},
    admitEvidenceParent:value=>value,mkdirSync(){},join,randomUUID:()=> 'unit-owned-id',
    writeFileSync:(path,raw)=>writes.push({path:basename(path),raw}),
    bindShopPlayerRuntime:async()=>{throw new Error('controlled unit admission failure');},
    classifyBrowserEvidence:()=>({consoleErrors:[],requestErrors:[],httpErrors:[]})};
  const run=runInNewContext('('+producer+')',context);
  const result=await run({baseURL:'http://unit.invalid/',chromium:{},fitting:'repair'});
  assert.equal(result.status,'failed');
  const full=writes.find(row=>row.path==='result.json');
  assert.ok(full,'The actual producer finally block must flush a complete failure report');
  const report=JSON.parse(full.raw);
  assert.equal(report.error,'Error: controlled unit admission failure');
  assert.equal(report.cleanup,'complete');assert.equal(report.native_qualified,false);
  assert.deepEqual(Object.keys(report.records),['runtime','shopStates','purchases','combat','states','encounters','controlsOnly','input','storage','storageEvents','clocks','geometry']);
  assert.ok(writes.some(row=>row.path==='console.json'),'The actual failure path retains its console');
  return {actual_producer_failure_retained:true,browser_created:false};
});

await test('native_history',async()=>{
  const count=12,events=[],report={actions:[],checks:[]};let failNext=false;
  const layout={seq:0,timeOrigin:1,width:1366,height:768,controls:[{name:'Pause',x:5,y:5,width:100,height:50,active:true,interactable:true}],shopControls:[]};
  const records={controlsOnly:[layout],input:[],geometry:[]};let time=0,pointer={x:0,y:0};
  const retain=runInNewContext('('+retained.trim()+')');
  const page={
    async bringToFront(){},async waitForFunction(){},async waitForTimeout(){},
    async evaluate(value){
      if(typeof value==='function'){
        const row={x:0,y:0,width:1366,height:768,layoutSeq:layout.seq,t:++time,timeOrigin:1};
        records.geometry.push(row);return row;
      }
      if(value==='performance.now()')return ++time;
    },
    mouse:{async move(x,y){pointer={x,y};},async down(){},async up(){records.input.push({...pointer,kind:'pointerup',t:++time});}}
  };
  const native={context:{}};
  const context={assert,nativeMode:true,native,page,report,records,load:1,observerError:null,
    current:rows=>rows.at(-1),check:(value,label)=>assert.ok(value,label),persist(){},
    until:async(rows,start,predicate)=>{const row=rows.slice(start).findLast(predicate);assert.ok(row,'Unit emitted observation exists');return row;},
    ensureOwnedNativeForeground:async({report:local,kind,role})=>{
      const row={kind,role,status:failNext?'refused':'verified',unit_only:true,identity:events.length};events.push(row);
      retain(local,'native_foreground_preconditions',row);
      retain(local,'native_activations',{kind,status:'verified',unit_only:true});
      retain(local,'native_activation_cleanup_failures',{kind,scope:'unit-cleanup-fixture'});
      if(failNext)throw new Error('controlled unit foreground refusal');
      return row;
    }};
  const click=runInNewContext('(()=>{'+controls+';return click;})()',context);
  for(let index=0;index<count;index++)await click('Pause');
  assert.equal(report.actions.length,count,'Actual recovery click closure completed every input');
  assert.equal(report.native_foreground_preconditions?.length,count,'Every actual input needs its own retained foreground witness beyond eight actions');
  assert.deepEqual(JSON.parse(JSON.stringify(report.native_foreground_preconditions)),events,'Input evidence order and object content remain complete');
  assert.equal(report.native_activations?.length,count,'Per-call activation evidence must be retained too');
  assert.equal(report.native_activation_cleanup_failures?.length,count,'Per-call cleanup failure evidence must not be lost');
  failNext=true;
  await assert.rejects(click('Pause'),/controlled unit foreground refusal/,'Actual foreground refusal must still stop input');
  assert.equal(report.actions.length,count,'Refused foreground cannot add an action');
  assert.deepEqual(JSON.parse(JSON.stringify(report.native_foreground_preconditions)),events,'A failed call retains its actual refusal and all earlier witnesses');
  assert.equal(report.native_activations?.length,count+1,'A failed call retains its activation evidence');
  assert.equal(report.native_activation_cleanup_failures?.length,count+1,'A failed call retains cleanup evidence');
  const original={};for(let index=0;index<count;index++)retain(original,'unit-history',{index});
  assert.equal(original['unit-history'].length,8,'The original native helper keeps its unchanged bounded diagnostic policy');
  assert.equal(original['unit-history_dropped'],4);
  return {completed_actions:count,retained_input_witnesses:count,original_helper_limit:8,native_qualification:false};
});

console.log(JSON.stringify({scope:'Source-only actual-closure unit checks; no runtime or native qualification',outcomes},null,2));
process.exitCode=outcomes.some(row=>row.status==='fail')?1:0;
'''
        result = subprocess.run([r'C:/Program Files/nodejs/node.exe', '--input-type=module', '-',
                                 str(worktree / 'e2e/helpers/lastStandJourney.mjs'), case],
                                input=script, cwd=worktree, text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        outcomes = json.loads(result.stdout)['outcomes']
        self.assertEqual([row['name'] for row in outcomes], [case])
        self.assertEqual(outcomes[0]['status'], 'pass')

    def test_recovery_checkpoints_do_not_serialize_full_active_evidence(self):
        self.producer_unit('checkpoints')

    def test_recovery_finally_retains_complete_failure_evidence(self):
        self.producer_unit('failure_flush')

    def test_recovery_native_inputs_keep_all_foreground_witnesses(self):
        self.producer_unit('native_history')

    def confirmation(self, fault='denied'):
        desired = {'credits': 3, 'pendingDefeat': None, 'permanentLevels': {'armor': 1}}
        state = {'saveState': 'ready', 'wallet': 3, 'pendingRunId': 0,
                 'load': 1, 'timeOrigin': 1000, 't': 30, 'seq': 2}
        case = {'fault': fault, 'recovered': {'state': state,
            'storage': {'data': desired}, 'shop': {'cards': [{'key': 'armor', 'p': 1}],
                'load': 1, 'timeOrigin': 1000, 't': 31}},
            'repeated_failure': {'storage': {'t': 10, 'load': 1, 'timeOrigin': 1000}}}
        action = {'before': 15, 'after': 28, 'load': 1, 'timeOrigin': 1000}
        raw = json.dumps(desired)
        events = [{'op': 'set', 'mode': 'pass', 'outcome': 'stored', 'value': raw, 'actual': raw,
                   't': 20, 'load': 1, 'timeOrigin': 1000, 'seq': 0},
                  {'op': 'get', 'mode': 'pass', 'outcome': 'return', 'value': raw, 'actual': raw,
                   't': 21, 'load': 1, 'timeOrigin': 1000, 'seq': 1}]
        return case, desired, events, action

    def admit_confirmation(self, case, desired, events, action):
        helper = getattr(verifier, '_verify_recovery_confirmation', None)
        if helper:
            return helper(case, desired, events, action, 'unit-case')
        _legacy_unit_fragment("        need(recovered['state']['saveState']", "\n        if 'reload' in case:",
            {'recovered': case['recovered'], 'desired': desired,
             'cards': lambda shop: {row['key']: row for row in shop['cards']}, 'label': 'unit-case'})

    def test_confirmation_requires_application_read_before_publication(self):
        for fault in ('denied', 'uncertain', 'mismatch'):
            case, desired, events, action = self.confirmation(fault)
            self.admit_confirmation(case, desired, events, action)
            for mutation in ('missing-read', 'wrong-bytes', 'foreign-document', 'late-read'):
                changed = deepcopy(events)
                if mutation == 'missing-read':
                    changed.pop()
                elif mutation == 'wrong-bytes':
                    changed[-1]['value'] = '{"credits":999}'
                elif mutation == 'foreign-document':
                    changed[-1].update(load=2, timeOrigin=2000)
                else:
                    changed[-1]['t'] = 40
                with self.subTest(fault=fault, mutation=mutation), self.assertRaisesRegex(
                        AssertionError, '^RECOVERY_CONFIRMATION: unit-case$'):
                    self.admit_confirmation(case, desired, changed, action)

    def test_denied_confirmation_requires_set_then_read(self):
        case, desired, events, action = self.confirmation()
        for changed in (events[1:], [dict(events[0], t=25), events[1]]):
            with self.subTest(events=changed), self.assertRaisesRegex(AssertionError, '^RECOVERY_CONFIRMATION: unit-case$'):
                self.admit_confirmation(case, desired, changed, action)
        case['fault'] = 'uncertain'
        prior_write = dict(events[0], t=12, mode='uncertain')
        self.admit_confirmation(case, desired, [prior_write, events[1]], action)

    def confirmation_publication_fixture(self, fault='uncertain'):
        """Invented coherent rows for the actual caller clause, never a report."""
        identity = {'load': 1, 'timeOrigin': 1000, 'documentHidden': False, 'documentFocused': True}
        levels = {key: 0 for key in ('cannonAttack', 'launcherAttack', 'hullCapacity', 'armor', 'cannonCycle', 'fieldRepair')}
        desired = {'credits': 3, 'pendingDefeat': None, 'permanentLevels': dict(levels, armor=1)}
        records = {'runtime': [], 'states': [], 'shopStates': [], 'storageEvents': []}
        def emit(collection, payload, t):
            tag = 'ST_LS_STATE ' if collection == 'states' else 'ST_LS_SHOP_STATE '
            seq = len(records['runtime'])
            envelope = dict(identity, seq=seq, order=seq, t=t, text=tag + json.dumps(payload))
            records['runtime'].append(envelope)
            row = dict(json.loads(envelope['text'][len(tag):]), **{key: value for key, value in envelope.items() if key != 'text'})
            records[collection].append(row)
            return row
        failure = emit('states', {'saveState': 'retry', 'wallet': 4, 'pendingRunId': 0}, 10)
        failed_shop = emit('shopStates', {'salvage': 4, 'cards': [{'key': key, 'p': level} for key, level in levels.items()]}, 11)
        provisional_state = emit('states', {'saveState': 'retry', 'wallet': 4, 'pendingRunId': 0}, 18)
        provisional_shop = emit('shopStates', {'salvage': 4, 'cards': deepcopy(failed_shop['cards'])}, 19)
        recovered_state = emit('states', {'saveState': 'ready', 'wallet': 3, 'pendingRunId': 0}, 30)
        recovered_shop = emit('shopStates', {'salvage': 3, 'cards': [{'key': key, 'p': level}
                              for key, level in desired['permanentLevels'].items()]}, 31)
        raw = json.dumps(desired)
        for op, t, mode in [('set', 20 if fault == 'denied' else 9, 'pass' if fault == 'denied' else fault), ('get', 21, 'pass')]:
            event = dict(op=op, t=t, load=1, timeOrigin=1000, mode=mode, value=raw, actual=raw,
                         outcome='stored' if op == 'set' else 'return', seq=len(records['storageEvents']), order=t)
            _rewrite_storage_event(event); records['storageEvents'].append(event)
        case = {'fault': fault, 'retry_action': 0, 'failure': failure, 'failed_shop': failed_shop,
                'repeated_failure': {'state': failure, 'shop': failed_shop, 'storage': {'t': 14}},
                'recovered': {'state': recovered_state, 'shop': recovered_shop, 'storage': {'data': desired}},
                'provisional_state': provisional_state, 'provisional_shop': provisional_shop}
        # JSON copies mirror real retained witnesses; later mutations must update
        # the raw envelope, canonical row and every independent witness copy.
        return json.loads(json.dumps({'case': case, 'desired': desired, 'records': records,
            'actions': [{'name': 'RetrySave', 'load': 1, 'timeOrigin': 1000, 'before': 15, 'after': 28}]}))

    def admit_confirmation_publications(self, fixture):
        for key, tag in [('states', 'ST_LS_STATE '), ('shopStates', 'ST_LS_SHOP_STATE ')]:
            for row in fixture['records'][key]:
                envelope = fixture['records']['runtime'][row['seq']]
                expected = dict(json.loads(envelope['text'][len(tag):]),
                                **{key: value for key, value in envelope.items() if key != 'text'})
                self.assertEqual(row, expected, 'Unit mutation must retain raw/derived coherence')
        case = fixture['case']
        # Execute the actual current caller selection AND confirmation call.
        # This bounded clause never passes the whole-report admission gates.
        _legacy_unit_fragment("        retry = actions[case['retry_action']]", "\n        need(recovered['state']['saveState']",
            dict(fixture, recovered=case['recovered'], failure=case['failure'], failed_shop=case['failed_shop'],
                 cards=lambda shop: {row['key']: row for row in shop['cards']}, label='unit-case',
                 _verify_recovery_confirmation=verifier._verify_recovery_confirmation))

    def test_confirmation_integration_early_wallet_while_retry(self):
        for fault in ('denied', 'uncertain', 'mismatch'):
            for collection, witness, field in [('states', 'provisional_state', 'wallet'), ('shopStates', 'provisional_shop', 'salvage')]:
                for wallet in (3, 5):
                    fixture = self.confirmation_publication_fixture(fault)
                    self.admit_confirmation_publications(fixture)
                    _mutate_recovery_row(fixture, collection, fixture['case'][witness], {field: wallet})
                    with self.subTest(fault=fault, collection=collection, wallet=wallet), self.assertRaisesRegex(
                            AssertionError, '^RECOVERY_CONFIRMATION: unit-case$'):
                        self.admit_confirmation_publications(fixture)

    def test_confirmation_integration_partial_level_with_old_wallet(self):
        for fault in ('denied', 'uncertain', 'mismatch'):
            for level in (1, 2):
                fixture = self.confirmation_publication_fixture(fault)
                self.admit_confirmation_publications(fixture)
                row = fixture['case']['provisional_shop']
                cards = [dict(card, p=level) if card['key'] == 'armor' else card for card in row['cards']]
                _mutate_recovery_row(fixture, 'shopStates', row, {'cards': cards})
                self.assertEqual(row['salvage'], fixture['case']['failed_shop']['salvage'])
                with self.subTest(fault=fault, level=level), self.assertRaisesRegex(AssertionError, '^RECOVERY_CONFIRMATION: unit-case$'):
                    self.admit_confirmation_publications(fixture)

    def test_confirmation_integration_accepts_confirmed_partial_publications(self):
        for fault in ('denied', 'uncertain', 'mismatch'):
            fixture = self.confirmation_publication_fixture(fault)
            for event in fixture['records']['storageEvents']:
                if event['mode'] == 'pass':
                    event['t'] = event['order'] = 16 if event['op'] == 'set' else 17
                    _rewrite_storage_event(event)
            _mutate_recovery_row(fixture, 'states', fixture['case']['provisional_state'], {'wallet': 3})
            row = fixture['case']['provisional_shop']
            cards = [dict(card, p=1) if card['key'] == 'armor' else card for card in row['cards']]
            _mutate_recovery_row(fixture, 'shopStates', row, {'cards': cards})
            with self.subTest(fault=fault):
                self.admit_confirmation_publications(fixture)

    def test_confirmation_integration_preserves_ready_publication_bound(self):
        for fault in ('denied', 'uncertain', 'mismatch'):
            fixture = self.confirmation_publication_fixture(fault)
            _mutate_recovery_row(fixture, 'states', fixture['case']['provisional_state'], {'saveState': 'ready'})
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_CONFIRMATION: unit-case$'):
                self.admit_confirmation_publications(fixture)

    def pointer(self):
        layout = {'seq': 0, 'load': 1, 't': 1, 'timeOrigin': 1000, 'width': 800, 'height': 600,
                  'controls': [{'name': 'Claim', 'active': True, 'interactable': True,
                                'x': 100, 'y': 100, 'width': 100, 'height': 50}], 'shopControls': []}
        geometry = {'x': 20, 'y': 30, 'width': 400, 'height': 300, 't': 2,
                    'timeOrigin': 1000, 'load': 1, 'layoutSeq': 0}
        action = {'name': 'Claim', 'x': 95, 'y': 92.5, 'load': 1, 'timeOrigin': 1000,
                  'before': 3, 'after': 6, 'layoutSeq': 0, 'canvas': geometry}
        pair = [dict(kind=kind, t=t, x=95, y=92.5, area='gameplay', load=1,
                     timeOrigin=1000, button=0, target='unity-canvas', focused=True, hidden=False)
                for kind, t in [('pointerdown', 4), ('pointerup', 5)]]
        return action, layout, pair

    def admit_pointer(self, action, layout, pair):
        helper = getattr(verifier, '_verify_recovery_pointer_target', None)
        if helper:
            return helper(action, layout, pair)
        _legacy_unit_fragment('    actions, bound, edges = ', '    used_actions = set()',
            {'report': {'actions': [action]}, 'records': {'controlsOnly': [layout], 'input': pair}})

    def test_pointer_edges_must_be_inside_named_projected_control(self):
        action, layout, pair = self.pointer()
        self.admit_pointer(action, layout, pair)
        for point in ((220, 220), (69, 92.5), (121, 92.5)):
            changed_action = dict(action, x=point[0], y=point[1])
            changed_pair = [dict(row, x=point[0], y=point[1]) for row in pair]
            with self.subTest(point=point), self.assertRaisesRegex(AssertionError, '^RECOVERY_CONTROL_TARGET: Claim$'):
                self.admit_pointer(changed_action, layout, changed_pair)

    def test_pointer_geometry_must_match_document_and_observation_order(self):
        action, layout, pair = self.pointer()
        for updates in ({'timeOrigin': 2000}, {'load': 2}, {'t': 7}, {'layoutSeq': 1}, {'width': float('nan')}):
            candidate = deepcopy(action); candidate['canvas'].update(updates)
            with self.subTest(updates=updates), self.assertRaisesRegex(AssertionError, '^RECOVERY_CONTROL_GEOMETRY: Claim$'):
                self.admit_pointer(candidate, layout, pair)

    def test_pending_debt_cannot_be_replaced_by_a_settled_purchase(self):
        helper = getattr(verifier, '_verify_recovery_catchup_purchase', None)
        with self.assertRaisesRegex(AssertionError, '^RECOVERY_PENDING_DEBT:'):
            if helper:
                helper({}, {'combat': []})
            else:
                _legacy_unit_fragment("    need(all(row['model']['repairAmount'] == 3 ", '\n    defeat, terminal =',
                    {'records': {'combat': [{'load': 1, 'tick': 10, 'model': {'repairAmount': 3}}]},
                     'deploy': {'load': 1}, 'purchase': {'tick': 10}})

    def test_terminal_requires_a_kill_in_the_final_admitted_step(self):
        helper = getattr(verifier, '_verify_recovery_terminal_boundaries', None)
        game = {'defeat': {'action': 'terminal', 'status': 'Defeated', 'hp': 0, 'failed': False,
                          'tick': 100, 't': 16000, 'kills': 3},
                'terminal': {'hasFinalAccounting': True, 'scrap': 0, 'open': False,
                    'finalAccounting': {'runId': 1, 'uniqueKills': 3, 'earnedScrap': 9, 'spentScrap': 5, 'finalScrap': 4}}}
        with self.assertRaisesRegex(AssertionError, '^RECOVERY_FINAL_STEP_KILL:'):
            if helper:
                helper({'gameplay': game}, {'combat': []}, False)
            else:
                _legacy_unit_fragment('    defeat, terminal =', '\n    result_data =',
                    {'game': game, 'deploy': {'runId': 1, 't': 0}, 'pause': {'elapsed_ms': 10000}})

    def test_semantic_guards_do_not_accept_detached_witness_errors(self):
        state = {'wallet': 2, 'seq': 0, 'load': 1, 't': 1, 'timeOrigin': 1000}
        snapshot = {'data': {'credits': 0}, 'raw': '{"credits":0}', 'label': 'refresh',
                    'load': 1, 'timeOrigin': 1000, 't': 2}
        event = dict(snapshot, op='snapshot', seq=0); event.pop('data')
        _rewrite_storage_event(event)
        report = {'storage_cases': {'claim-uncertain': {'failure': deepcopy(state)}},
                  'gameplay': {'refreshes': [{'storage': deepcopy(snapshot)}]},
                  'records': {'states': [state], 'storage': [snapshot], 'storageEvents': [event],
                    'runtime': [{'text': 'ST_LS_STATE {"wallet":2}', 'seq': 0, 'load': 1, 't': 1, 'timeOrigin': 1000}]}}
        subject = ShopJourneyGuardTests('test_shop_guard_background_uncertain_save_and_reward_replay')
        subject.background_record = lambda: deepcopy(report)
        with patch.object(verifier, 'verify_shop_recovery', side_effect=AssertionError('Detached recovery storage witness')):
            with self.assertRaises(AssertionError):
                subject.test_shop_guard_background_uncertain_save_and_reward_replay()

    def test_coherent_mutations_preserve_raw_records_and_all_witness_copies(self):
        state = {'wallet': 2, 'seq': 0, 'load': 1, 't': 1, 'timeOrigin': 1000}
        report = json.loads(json.dumps({'records': {'states': [state],
            'runtime': [{'text': 'ST_LS_STATE {"wallet":2}', 'seq': 0, 'load': 1, 't': 1, 'timeOrigin': 1000}]},
            'failure': state, 'nested': {'failure': state}}))
        _mutate_recovery_row(report, 'states', report['failure'], {'wallet': 3})
        self.assertEqual(report['failure'], report['records']['states'][0])
        self.assertEqual(report['nested']['failure'], report['failure'])
        self.assertEqual(json.loads(report['records']['runtime'][0]['text'][12:]), {'wallet': 3})
        stored = {'data': {'credits': 0}, 'raw': '{"credits":0}', 'label': 'refresh', 't': 2, 'load': 1, 'timeOrigin': 1000}
        event = dict(stored, op='snapshot', seq=0, order=5); event.pop('data'); _rewrite_storage_event(event)
        report = json.loads(json.dumps({'records': {'storage': [stored], 'storageEvents': [event]}, 'witness': stored}))
        _mutate_recovery_snapshot(report, report['witness'], {'credits': 1})
        self.assertEqual(report['witness'], report['records']['storage'][0])
        self.assertEqual(json.loads(report['witness']['raw']), {'credits': 1})
        raw = json.loads(report['records']['storageEvents'][0]['emittedRaw'][16:])
        self.assertEqual(raw['raw'], report['witness']['raw'])


    def test_uncertain_confirmation_cannot_use_a_later_candidate_write(self):
        case, desired, events, action = self.confirmation('uncertain')
        events[0]['t'] = events[1]['t'] + 1
        with self.assertRaisesRegex(AssertionError, '^RECOVERY_CONFIRMATION: unit-case$'):
            self.admit_confirmation(case, desired, events, action)

    def debt_fixture(self, accepted=False):
        identity = {'load': 1, 'timeOrigin': 1000}
        pending = dict(identity, t=20, tick=128, catchingUp=True, paused=False, status='Running', callbackSteps=128)
        settled = dict(pending, t=21 if accepted else 23, tick=256, catchingUp=False)
        action = dict(identity, name='ShopCard_fieldRepairBuy', before=10, pointer_up_t=11)
        result = dict(identity, t=22, tick=256 if accepted else 128, accepted=accepted,
                      mode='Run', actionId=action['name'], intentRunId=1, chargedScrap=5 if accepted else 0,
                      refusal='None' if accepted else 'CatchingUp')
        bought = result if accepted else dict(result, t=25, tick=256, accepted=True, chargedScrap=5, refusal='None')
        before = dict(identity, t=9, tick=0)
        boundary = {'status': 'observed', 'pending': pending, 'settled': settled, 'attempt': action,
                    'result': result, 'before': before}
        report = {'actions': [action], 'gameplay': {'deploy': {'runId': 1}, 'purchase': bought, 'catchup_purchase': boundary}}
        records = {'encounters': [pending, settled], 'purchases': [result] if accepted else [result, bought],
                   'shopStates': [before], 'combat': [dict(identity, tick=tick, model={'repairAmount': 3}) for tick in (128, 256)]}
        return report, records

    def test_pending_debt_accepts_real_boundary_shapes_and_rejects_bad_order_or_effect(self):
        for accepted in (False, True):
            report, records = self.debt_fixture(accepted)
            verifier._verify_recovery_catchup_purchase(report, records)
        for fault, reason in [('settled-before-input', 'Buy did not arrive before actual debt settlement'),
                              ('stale-pending-observation', 'Buy did not arrive before actual debt settlement'),
                              ('new-stats-in-old-steps', 'old elapsed steps used new stats'),
                              ('charged-refusal', 'unresolved attempt charged or queued an effect')]:
            report, records = self.debt_fixture()
            boundary = report['gameplay']['catchup_purchase']
            if fault == 'settled-before-input':
                boundary['attempt']['pointer_up_t'] = 24
            elif fault == 'stale-pending-observation':
                boundary['pending']['t'] = 8
                records['encounters'].insert(1, dict(boundary['settled'], t=9))
            elif fault == 'new-stats-in-old-steps':
                records['combat'][0]['model']['repairAmount'] = 4
            else:
                boundary['result']['chargedScrap'] = 1
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_PENDING_DEBT: ' + reason + '$'):
                verifier._verify_recovery_catchup_purchase(report, records)

    def terminal_fixture(self):
        identity = {'load': 2, 'timeOrigin': 2000}
        combat = [dict(identity, tick=tick, t=50*tick, runId=3,
                       events=[{'kind': 'Cannon', 'killed': True, 'slot': tick}]) for tick in range(1, 11)]
        defeat = dict(identity, tick=10, t=500, kills=10, hp=0, action='terminal', status='Defeated', failed=False,
                      documentHidden=True, documentFocused=False)
        accounting = {'runId': 3, 'uniqueKills': 10, 'earnedScrap': 30, 'spentScrap': 25, 'finalScrap': 5}
        terminal = dict(identity, t=501, hasFinalAccounting=True, finalAccounting=accounting, scrap=0, open=False)
        prior = {'version': 3, 'credits': 1, 'nextRunId': 3, 'lastFinalizedRunId': 1, 'pendingDefeat': None,
                 'permanentLevels': {key: 0 for key in ('cannonAttack', 'launcherAttack', 'hullCapacity', 'armor', 'cannonCycle', 'fieldRepair')},
                 'selectedTier': 1, 'tierRecords': {'tier-goals-v1': {'bestTicks1': 0, 'bestKills1': 0,
                 'bestTicks2': 0, 'bestKills2': 0, 'tierTwoUnlocked': False}}}
        expected = dict(prior, nextRunId=4, tierRecords={'tier-goals-v1': {'bestTicks1': 10, 'bestKills1': 10,
                        'bestTicks2': 0, 'bestKills2': 0, 'tierTwoUnlocked': False}},
                        pendingDefeat={'runId': 3, 'elapsedTicks': 10, 'kills': 10, 'reward': 1, 'tier': 1,
                        'profileVersion': 'tier-goals-v1', 'isLimit': False, 'newBestTime': True,
                        'newBestKills': True, 'unlockedTierTwo': False})
        staged = {'state': dict(identity, t=502, wallet=1), 'shop': terminal,
                  'storage': dict(identity, t=503, data=deepcopy(expected)),
                  'clock': dict(identity, t=504, hidden=True, focused=False)}
        begin, end, returned = [dict(identity, t=t, hidden=hidden, focused=not hidden)
                                for t, hidden in ((490, True), (510, True), (520, False))]
        events = [dict(identity, t=t, kind=kind, globalTarget=True, hidden=hidden, focused=not hidden)
                  for t, kind, hidden in ((489, 'visibilitychange', True), (515, 'focus', False))]
        game = {'deploy': dict(identity, t=0, runId=3), 'defeat': defeat, 'terminal': terminal,
                'final_step': {'combat': combat[-1]}, 'before': {'storage': {'data': prior}},
                'result': {'storage': {'data': deepcopy(expected)}, 'state': {'wallet': 1}},
                'claimed': {'storage': {'data': dict(expected, credits=2, pendingDefeat=None, lastFinalizedRunId=3)}, 'state': {'wallet': 2}},
                'claim_action': 0, 'terminal_away': {'status': 'observed', 'begin': begin, 'end': end,
                    'returned': returned, 'staged': staged, 'events': events}}
        report = {'terminal_case': game, 'actions': [{'before': 525}]}
        records = {'combat': combat, 'clocks': [begin, end, returned, staged['clock']], 'input': events,
                   'states': [staged['state']], 'shopStates': [terminal], 'storage': [staged['storage']]}
        return report, records

    def test_terminal_boundary_accepts_complete_unit_trace_and_rejects_missing_final_income(self):
        report, records = self.terminal_fixture()
        verifier._verify_recovery_terminal_boundaries(report, records, False)
        verifier._verify_recovery_terminal_boundaries(report, records, True)
        for fault in ('no-final-kill', 'omitted-final-income', 'wrong-pending-kills'):
            report, records = self.terminal_fixture()
            game = report['terminal_case']
            if fault == 'no-final-kill':
                game['final_step']['combat']['events'][0]['killed'] = False
            elif fault == 'omitted-final-income':
                game['terminal']['finalAccounting']['uniqueKills'] -= 1
            else:
                game['result']['storage']['data']['pendingDefeat']['kills'] -= 1
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_FINAL_STEP_KILL:'):
                verifier._verify_recovery_terminal_boundaries(report, records, False)

    def test_current_progression_contract_rejects_unknown_or_inconsistent_tier_state(self):
        report, _ = self.terminal_fixture()
        valid = report['terminal_case']['result']['storage']['data']
        self.assertTrue(verifier._current_progression_record(valid))
        for fault in ('future-version', 'unknown-profile', 'invented-unlock', 'locked-selection',
                      'temporary-state', 'bool-count', 'lost-record', 'wrong-tier', 'limit-reward'):
            value = deepcopy(valid)
            if fault == 'future-version': value['version'] = 4
            elif fault == 'unknown-profile': value['tierRecords']['unknown'] = value['tierRecords'].pop('tier-goals-v1')
            elif fault == 'invented-unlock': value['tierRecords']['tier-goals-v1']['tierTwoUnlocked'] = True
            elif fault == 'locked-selection': value['selectedTier'] = 2
            elif fault == 'temporary-state': value['scrap'] = 3
            elif fault == 'bool-count': value['tierRecords']['tier-goals-v1']['bestKills1'] = True
            elif fault == 'lost-record': value['tierRecords']['tier-goals-v1']['bestTicks1'] = 9
            elif fault == 'wrong-tier': value['pendingDefeat']['tier'] = 2
            else: value['pendingDefeat']['isLimit'] = True
            with self.subTest(fault=fault):
                self.assertFalse(verifier._current_progression_record(value))

    def test_terminal_contract_updates_independent_maxima_and_exact_goal_unlock(self):
        report, _ = self.terminal_fixture()
        prior = report['terminal_case']['before']['storage']['data']
        prior['tierRecords']['tier-goals-v1'].update(bestTicks1=1199, bestKills1=30)
        result = verifier._terminal_progression_record(prior, 3, 1200, 4)
        self.assertEqual(result['tierRecords']['tier-goals-v1'], {'bestTicks1': 1200, 'bestKills1': 30,
                         'bestTicks2': 0, 'bestKills2': 0, 'tierTwoUnlocked': True})
        self.assertTrue(result['pendingDefeat']['unlockedTierTwo'])
        self.assertTrue(result['pendingDefeat']['newBestTime'])
        self.assertFalse(result['pendingDefeat']['newBestKills'])
        self.assertEqual(prior['tierRecords']['tier-goals-v1']['bestTicks1'], 1199)

    def test_unfocused_terminal_requires_actual_document_and_unclaimed_storage(self):
        for fault in ('visible-terminal', 'foreign-transition', 'automatic-claim', 'late-manual-claim'):
            report, records = self.terminal_fixture()
            game = report['terminal_case']
            if fault == 'visible-terminal':
                game['defeat']['documentHidden'] = False
            elif fault == 'foreign-transition':
                game['terminal_away']['events'][0]['load'] = 99
            elif fault == 'automatic-claim':
                game['terminal_away']['staged']['storage']['data']['credits'] += 1
            else:
                report['actions'][0]['before'] = 500
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, '^RECOVERY_UNFOCUSED_TERMINAL:'):
                verifier._verify_recovery_terminal_boundaries(report, records, True)


class ShopJourneyGuardTests(unittest.TestCase):
    def __str__(self):
        return f'{self._testMethodName} ({type(self).__module__}.{type(self).__qualname__})'

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

    def test_shop_guard_vertical_admission_entrypoint(self):
        self.assertTrue(callable(getattr(verifier, 'verify_shop_vertical', None)),
                        'Maintained verifier has no Shop vertical admission behavior')
        with self.assertRaises(AssertionError, msg='An empty report cannot satisfy a real Shop journey'):
            verifier.verify_shop_vertical({})

    def test_current_control_fixture_matches_authored_hud_inventory(self):
        """Keep parser fixtures bound to current authored control identities."""
        scripts = TOOLS.parent / 'Unity/Assets/Scripts'
        core_source = (scripts / 'LastStandLoopHud.cs').read_text(encoding='utf8')
        settings_source = (scripts / 'LastStandSettingsHud.cs').read_text(encoding='utf8')
        action_names = dict(re.findall(r'(\w+) = Action\("([^"]+)"', core_source))
        action_fields = re.search(r'actions = new\[\] \{([^}]+)\}', core_source).group(1)
        actual_core = [action_names[field.strip()] for field in action_fields.split(',')]
        actual_settings = re.findall(r'Button\("([^"]+)",', settings_source)
        self.assertIn('new Button[4]', settings_source)
        actual_settings += ['SettingsTab' + str(index) for index in range(4)]
        for channel in re.findall(r'Volume\("([^"]+)",', settings_source):
            actual_settings += [channel + 'Minus', channel + 'Plus']
        fixture = _current_control_fixture()
        self.assertCountEqual(actual_core, [row['name'] for row in fixture['controls']])
        self.assertCountEqual(actual_settings, [row['name'] for row in fixture['settingsControls']])

    def test_shop_controls_only_complete_prefix(self):
        """Synthetic current inventory and truncation, never browser qualification."""
        import subprocess
        source = TOOLS.parents[1] / 'e2e/helpers/lastStandJourney.mjs'
        fixture = _current_control_fixture()
        script = r"""
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const [source,fixture]=process.argv.slice(1);
const actual=await import(pathToFileURL(source));
const current=JSON.parse(fixture);
const raw='ST_LS_HUD_LAYOUT '+JSON.stringify({...current,graphics:[{text:'synthetic parser fixture '.repeat(1000)}]});
const truncated=raw.slice(0,8190);
assert.equal(truncated.length,8190,'Explicit synthetic current truncation fixture');
assert.equal(typeof actual.readShopControlObservation,'function','Shop controls-only reader is required');
const controls=actual.readShopControlObservation(raw);
assert.equal(controls.observationScope,'complete-controls-only');
assert.equal(controls.graphicsTruncated,false);
assert.equal(controls.raw,raw,'Exact synthetic parser input retained');
assert.equal(Object.hasOwn(controls,'graphics'),false,'No missing graphics fabricated');
assert.equal(controls.controls.length,14);assert.equal(controls.shopControls.length,11);assert.equal(controls.settingsControls.length,33);
assert.equal(new Set([...controls.controls,...controls.shopControls,...controls.settingsControls].map(c=>c.name)).size,58);
assert.throws(()=>actual.readShopControlObservation(truncated),/Complete controls/,'Expanded inventory must be complete; truncated new controls cannot qualify');
const prefix=raw.slice('ST_LS_HUD_LAYOUT '.length).split(',"graphics":')[0];
const value=JSON.parse(prefix+'}');
const complete=fields=>'ST_LS_HUD_LAYOUT '+JSON.stringify({...fields,graphics:[]});
assert.equal(actual.readShopControlObservation(complete(value)).graphicsTruncated,false);
const cases={
  'incomplete-control-array':raw.slice(0,raw.indexOf('"shopControls"')+40),
  'unexpected-short-tail':raw.slice(0,-1),
  'corrupt-graphics-tail':raw.slice(0,raw.indexOf(',"graphics":')+12)+'@',
  'duplicate-controls':complete({...value,controls:value.controls.map((v,i)=>i===0?value.controls[1]:v)}),
  'missing-tier-control':complete({...value,controls:value.controls.filter(v=>v.name!=='ToggleTier')}),
  'missing-effects-control':complete({...value,controls:value.controls.filter(v=>v.name!=='Effects')}),
  'missing-speed-control':complete({...value,controls:value.controls.filter(v=>v.name!=='SpeedRate')}),
  'missing-settings-inventory':complete(Object.fromEntries(Object.entries(value).filter(([key])=>key!=='settingsControls'))),
  'duplicate-settings-control':complete({...value,settingsControls:value.settingsControls.map((v,i)=>i===0?value.settingsControls[1]:v)}),
  'missing-settings-control':complete({...value,settingsControls:value.settingsControls.slice(1)}),
  'unexpected-settings-control':complete({...value,settingsControls:value.settingsControls.map((v,i)=>i===0?{...v,name:'Unexpected'}:v)}),
  'unexpected-core-control':complete({...value,controls:value.controls.map(v=>v.name==='ToggleTier'?{...v,name:'Unexpected'}:v)}),
  'duplicate-shop-control':complete({...value,shopControls:value.shopControls.map((v,i)=>i===0?value.shopControls[1]:v)}),
  'unexpected-shop-control':complete({...value,shopControls:value.shopControls.map((v,i)=>i===0?{...v,name:'Unexpected'}:v)}),
  'missing-control':complete({...value,shopControls:value.shopControls.slice(1)}),
  'malformed-control':complete({...value,controls:value.controls.map((v,i)=>i===0?{...v,width:'44'}:v)})
};
for(const [name,candidate]of Object.entries(cases)){
  assert.throws(()=>actual.readShopControlObservation(candidate),undefined,'Must reject '+name);
  console.log('PASS controls_only_rejects '+name);
}
assert.throws(()=>actual.retainRuntimeObservation({text:truncated,t:1,timeOrigin:2},1,'inert',
  {states:[],encounters:[],hits:[],layouts:[],cues:[]}),SyntaxError,'Original full-layout parser stays strict');
console.log('PASS controls_only_preserves_original_strict_parser');
"""
        result = subprocess.run([r'C:/Program Files/nodejs/node.exe', '--input-type=module', '-e', script,
                                 str(source), json.dumps(fixture)], cwd=TOOLS.parents[1], capture_output=True, timeout=30)
        if os.environ.get('ST_SHOP_TEST_EVIDENCE'):
            output = Path(os.environ['ST_SHOP_TEST_EVIDENCE'])
            output.mkdir(parents=True, exist_ok=True)
            (output / 'synthetic-controls.stdout.txt').write_bytes(result.stdout)
            (output / 'synthetic-controls.stderr.txt').write_bytes(result.stderr)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf8', 'replace'))

    def test_shop_controls_only_python_replay(self):
        """Replay synthetic current inputs through the actual pure reader."""
        import ast
        import math
        source = ast.parse((TOOLS / 'verify_last_stand_loop.py').read_text(encoding='utf8'))
        owner = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'verify_shop_vertical')
        functions = [node for node in owner.body if isinstance(node, ast.FunctionDef) and node.name in ('require', 'read_controls')]
        self.assertEqual({node.name for node in functions}, {'require', 'read_controls'})
        namespace = {'json': json, 'math': math}
        exec(compile(ast.Module(body=functions, type_ignores=[]), '<actual Shop verifier pure reader>', 'exec'), namespace)
        value = _current_control_fixture()
        raw = 'ST_LS_HUD_LAYOUT ' + json.dumps(dict(value, graphics=[]), separators=(',', ':'))
        expected = dict(value, observationScope='complete-controls-only', graphicsTruncated=False, raw=raw)
        self.assertEqual(namespace['read_controls'](raw), expected)
        truncated = ('ST_LS_HUD_LAYOUT ' + json.dumps(dict(value, graphics=[{'text': 'synthetic parser fixture ' * 1000}]), separators=(',', ':')))[:8190]
        with self.assertRaisesRegex(AssertionError, 'Controls were not complete'):
            namespace['read_controls'](truncated)
        for key in ('controls', 'shopControls', 'settingsControls'):
            for fault in ('missing', 'duplicate', 'unexpected'):
                candidate = deepcopy(value)
                if fault == 'missing': candidate[key].pop()
                elif fault == 'duplicate': candidate[key][0] = deepcopy(candidate[key][1])
                else: candidate[key][0]['name'] = 'Unexpected'
                broken = 'ST_LS_HUD_LAYOUT ' + json.dumps(dict(candidate, graphics=[]), separators=(',', ':'))
                with self.subTest(collection=key, fault=fault), self.assertRaisesRegex(AssertionError, 'Missing or repeated observed controls'):
                    namespace['read_controls'](broken)
        print('PASS synthetic_current_controls_python_full_and_rejected_truncation_exact_union', flush=True)

    def test_recovery_current_control_inventory_is_exact(self):
        """Execute the actual recovery inventory block on synthetic current inputs."""
        import ast
        source = ast.parse((TOOLS / 'verify_last_stand_loop.py').read_text(encoding='utf8'))
        owner = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'verify_shop_recovery')
        block = next(node for node in ast.walk(owner) if isinstance(node, ast.If)
                     and ast.unparse(node.test) == "key == 'controlsOnly'")
        code = compile(ast.Module(body=block.body, type_ignores=[]), '<actual recovery inventory block>', 'exec')
        def admit(value):
            namespace = {'value': dict(value, graphics=[]), 'need': verifier._recovery_need,
                         'observation': {'text': 'synthetic current controls'}}
            exec(code, namespace)
        admit(_current_control_fixture())
        for key in ('controls', 'shopControls', 'settingsControls'):
            for fault in ('missing', 'duplicate', 'unexpected'):
                candidate = _current_control_fixture()
                if fault == 'missing': candidate[key].pop()
                elif fault == 'duplicate': candidate[key][0] = deepcopy(candidate[key][1])
                else: candidate[key][0]['name'] = 'Unexpected'
                with self.subTest(collection=key, fault=fault), self.assertRaisesRegex(AssertionError, 'Incomplete recovery controls'):
                    admit(candidate)

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

    # ACTION_CORRECTION_METHODS_START
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
    # ACTION_CORRECTION_METHODS_END

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

    def test_shop_observer_output_is_external_and_preserves_closed_evidence(self):
        """Exercise actual selection/mkdir code; intercept before any write."""
        import ast
        import hashlib
        from unittest.mock import patch

        worktree = TOOLS.parents[1]
        closed = Path(r'C:/Users/brenn/codearbiter-review-integration-20261006/mechanics-shop-feature-20261009/t21-evidence/observer-failure-fix').resolve()
        followup = closed.parent / 'observer-proof-followup'
        candidate = Path(os.environ.get('ST_SHOP_OBSERVER_GUARD_SOURCE', __file__)).resolve()
        self.assertTrue(candidate == Path(__file__).resolve() or candidate.is_relative_to(followup),
                        'Only actual guard or a task-owned private guard copy is inspected')
        text = candidate.read_text(encoding='utf8')
        tree = ast.parse(text)
        methods = [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)
                   and node.name == 'test_shop_observer_callback_failure_is_retained']
        self.assertEqual(len(methods), 1, 'Unique actual observer method')
        method = methods[0]
        stop = next(i for i, node in enumerate(method.body)
                    if isinstance(node, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == 'script' for t in node.targets))
        prefix = ast.Module(body=method.body[:stop], type_ignores=[])
        actual = compile(ast.fix_missing_locations(prefix), str(candidate), 'exec')
        print('OUTPUT_SETUP_PASS actual observer setup/selection/mkdir captured; source=' +
              hashlib.sha256(candidate.read_bytes()).hexdigest(), flush=True)

        class InterceptedCreation(Exception):
            pass

        def decision(value, closed_marker=None):
            attempts = []
            actual_is_file = Path.is_file

            def intercept(path, *args, **kwargs):
                attempts.append(path.resolve())
                raise InterceptedCreation('actual mkdir intercepted before mutation')

            rejection = None
            with patch.dict(os.environ):
                os.environ.pop('ST_SHOP_OBSERVER_OUTPUT_ROOT', None)
                if value is not None:
                    os.environ['ST_SHOP_OBSERVER_OUTPUT_ROOT'] = str(value)
                with patch.object(Path, 'mkdir', intercept), patch.object(Path, 'is_file',
                        lambda path: path.resolve() == closed_marker if closed_marker is not None
                        and path.name == 'SEALED.json' else actual_is_file(path)):
                    try:
                        exec(actual, dict(globals(), self=self))
                    except InterceptedCreation:
                        pass
                    except AssertionError as error:
                        rejection = error
            return attempts, rejection

        for name, value in [('absent', None), ('closed-input', closed),
                            ('repository', worktree), ('escaped', followup / '..' / 'escaped-output'),
                            ('relative', Path(os.path.relpath(followup / 'relative-owned-output', worktree)))]:
            attempts, rejection = decision(value)
            self.assertEqual(attempts, [], 'Actual output policy must reject ' + name + ' before mkdir')
            self.assertIsNotNone(rejection, 'Actual output policy must reject ' + name)
            print('PASS observer_output_rejects ' + name, flush=True)
        closed_selected = followup / 'inert-closed-output' / 'descendant'
        attempts, rejection = decision(closed_selected, closed_selected.parent / 'SEALED.json')
        self.assertEqual(attempts, [], 'Actual output policy must reject closed external ancestor before mkdir')
        self.assertIsNotNone(rejection, 'Actual output policy must reject closed external ancestor')
        print('PASS observer_output_rejects inert-closed-external-ancestor; filesystem observation only', flush=True)
        selected = followup / 'intercepted-owned-output'
        attempts, rejection = decision(selected)
        self.assertIsNone(rejection, 'Valid caller-selected external output is admitted')
        self.assertEqual(len(attempts), 1, 'Actual output creation boundary reached once')
        self.assertTrue(attempts[0].is_relative_to(selected.resolve()),
                        'Actual output must remain beneath selected external root')
        self.assertFalse(attempts[0].is_relative_to(closed), 'Closed input cannot receive output')
        self.assertFalse(attempts[0].is_relative_to(worktree.resolve()), 'Repository cannot receive output')
        print('PASS observer_output_selected_external actual mkdir intercepted; zero writes', flush=True)
