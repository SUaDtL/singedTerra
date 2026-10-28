"""Run imported Mechanics Shop deployment checks with one owned pinned Editor.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_shop -p test_shop_ui.py -v -k deploy
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import uuid

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "campaign-unity/Unity"
UNITY = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe")


def source_hashes():
    paths = []
    for directory in ("Assets/Scripts", "Assets/Editor", "Assets/Scenes", "ProjectSettings"):
        paths.extend(p for p in (PROJECT / directory).rglob("*") if p.is_file())
    paths.extend(p for p in (PROJECT / "Packages").glob("*.json") if p.is_file())
    return {str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(paths)}


class ShopUiTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    @classmethod
    def setUpClass(cls):
        cls.runs = {}

    @classmethod
    def run_checks(cls, method):
        if method in cls.runs:
            return cls.runs[method]
        base = os.environ.get("ST_SHOP_TEST_EVIDENCE")
        if not base:
            base = tempfile.mkdtemp(prefix="st-shop-ui-evidence-")
        evidence = Path(base) / ("editor-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                                 + "-" + uuid.uuid4().hex[:8])
        evidence.mkdir(parents=True, exist_ok=False)
        env = os.environ.copy()
        if os.name == "nt":
            common = Path(env.get("ProgramData", "C:/ProgramData"))
            if not common.is_dir():
                raise RuntimeError("ProgramData unavailable")
            env.setdefault("ProgramData", str(common))
            env.setdefault("ALLUSERSPROFILE", str(common))
            env["ST_LS_PROJECT_CHECK"] = str(PROJECT)
            check = "$p=$env:ST_LS_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"
            ownership = subprocess.run(["powershell.exe", "-NoProfile", "-Command", check], env=env,
                                       capture_output=True, text=True, timeout=30)
            (evidence / "ownership.json").write_text(json.dumps({"exit": ownership.returncode,
                "stdout": ownership.stdout, "stderr": ownership.stderr}, indent=2), encoding="utf-8")
            if ownership.returncode:
                raise RuntimeError("Unity Editor already owns this project")
        before = source_hashes()
        for relative in before:
            archive = evidence / "source-archive" / relative
            archive.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, archive)
        log = evidence / "unity-editor.log"
        argv = [str(UNITY), "-batchmode", "-nographics", "-quit", "-projectPath", str(PROJECT),
                "-executeMethod", "LastStandShopChecks." + method, "-logFile", str(log)]
        if method in ("RunInput", "RunRenderFollowup", "RunCompactScroll", "RunCompactReading", "RunFirstSessionClarity"):
            argv.remove("-nographics")  # Real rendered raycast/mask input fixture.
        startup = None
        if os.name == "nt":
            startup = subprocess.STARTUPINFO()
            startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startup.wShowWindow = subprocess.SW_HIDE
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, encoding="utf-8", errors="replace", startupinfo=startup)
        (evidence / "invocation.json").write_text(json.dumps({"argv": argv, "cwd": str(ROOT),
            "pid": process.pid, "source_sha256": before,
            "unity_sha256": hashlib.sha256(UNITY.read_bytes()).hexdigest()}, indent=2), encoding="utf-8")
        timed_out = False
        try:
            stdout, stderr = process.communicate(timeout=300)
        except subprocess.TimeoutExpired:
            timed_out = True
            process.kill()  # Only the directly launched owned Editor PID.
            stdout, stderr = process.communicate()
        after = source_hashes()
        assemblies = {}
        for assembly in (PROJECT / "Library/ScriptAssemblies").glob("Assembly-CSharp*.dll"):
            target = evidence / "compiled-assemblies" / assembly.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(assembly, target)
            assemblies[assembly.name] = hashlib.sha256(target.read_bytes()).hexdigest()
        cls.log = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
        cls.exit_code = process.returncode
        (evidence / "stdout.txt").write_text(stdout, encoding="utf-8")
        (evidence / "stderr.txt").write_text(stderr, encoding="utf-8")
        (evidence / "result.json").write_text(json.dumps({"exit": process.returncode,
            "timed_out": timed_out, "source_unchanged": before == after, "source_sha256_after": after,
            "compiled_assemblies_sha256": assemblies,
            "log_sha256": hashlib.sha256(log.read_bytes()).hexdigest() if log.exists() else None}, indent=2),
            encoding="utf-8")
        print("Unity evidence:", evidence, file=sys.stderr)
        if timed_out:
            raise AssertionError("Owned Unity Editor exceeded its 300-second bound")
        if before != after:
            raise AssertionError("Deployment check source changed during the owned Editor launch")
        if "ST_LS_SHOP_COMPILED" not in cls.log:
            raise AssertionError("Unity did not complete actual-source compilation and enter the driver:\n"
                                 + cls.log[-10000:])
        print("Actual-source Unity compilation succeeded", file=sys.stderr)
        cls.runs[method] = (cls.exit_code, cls.log)
        return cls.runs[method]

    def test_deploy_frozen_permanent_snapshot_and_fittings(self):
        self.exit_code, self.log = self.run_checks("RunDeploy")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def income_case(self):
        self.exit_code, self.log = self.run_checks("RunIncome")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_income_hidden_partition_and_terminal_snapshot(self):
        self.income_case()

    def test_income_final_tick_refresh_and_next_run(self):
        self.income_case()

    def settle_case(self):
        self.exit_code, self.log = self.run_checks("RunSettle")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_settle_purchase_old_stats_and_debt_refusal(self):
        self.settle_case()

    def test_settle_pause_focus_close_and_stale_input(self):
        self.settle_case()

    def test_permanent_notification_reentry_is_one_purchase(self):
        code, log = self.run_checks("RunPermanentNotificationReentry")
        self.assertEqual(code, 0, log[-10000:])
        self.assertIn("ST_LS_SHOP_PASS " + self._testMethodName, log)

    def test_research_heartbeat_refreshes_displayed_shop_revision(self):
        code, log = self.run_checks("RunResearchHeartbeat")
        self.assertEqual(code, 0, log[-10000:])
        for name in (self._testMethodName, "test_research_heartbeat_failed_save_disables_displayed_purchase",
                     "test_research_heartbeat_preserves_run_shop"):
            self.assertIn("ST_LS_SHOP_PASS " + name, log)

    def test_battle_shop_tabs_live_cards_and_refusal_feedback(self):
        self.exit_code, self.log = self.run_checks("RunBattleShop")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_first_session_clarity_live_goal_and_purchase_lifetimes(self):
        self.exit_code, self.log = self.run_checks("RunFirstSessionClarity")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_workshop_garage_post_claim_prices_and_save_error(self):
        self.exit_code, self.log = self.run_checks("RunWorkshop")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_workshop_committed_levels_observation_without_cards(self):
        self.exit_code, self.log = self.run_checks("RunWorkshopObservation")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_workshop_webgl_layout_transport_complete_graphics(self):
        """Replay real WebGL emissions through the unchanged full-layout reader.

        ST_SHOP_HUD_LAYOUT_REPORT must name a fresh real Shop player result.json
        bound to the currently packaged source/export. ST_SHOP_TEST_EVIDENCE is
        the output directory. Editor logging alone cannot satisfy this test.
        """
        report = os.environ.get("ST_SHOP_HUD_LAYOUT_REPORT")
        evidence = os.environ.get("ST_SHOP_TEST_EVIDENCE")
        self.assertTrue(report and evidence,
                        "Set ST_SHOP_HUD_LAYOUT_REPORT to a real source-bound WebGL report "
                        "and ST_SHOP_TEST_EVIDENCE to the evidence output directory")
        script = r"""
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.argv[1], reportPath=process.argv[2];
const moduleAt=relative=>import(pathToFileURL(join(root,relative)).href);
const {retainRuntimeObservation}=await moduleAt('e2e/helpers/lastStandJourney.mjs');
const {verifyLastStandSource}=await moduleAt('scripts/assets/verify-last-stand-source.mjs');
const {verifyLastStandPayload}=await moduleAt('scripts/assets/verify-last-stand.mjs');
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const payload=join(root,'client/public/last-stand');
const {lock,manifest}=verifyLastStandSource(root);
verifyLastStandPayload(payload,root);
const report=JSON.parse(readFileSync(reportPath,'utf8')), binding=report.binding;
assert.equal(report.schema,'singedterra-shop-player/v1');
assert.equal(report.status,'pass');
assert.equal(binding.build,manifest.source.build);
assert.equal(binding.manifest_sha256,sha(join(payload,'asset-manifest.json')));
assert.equal(binding.source_lock_sha256,sha(join(root,'campaign-unity/docs/last-stand-web/source-lock.json')));
assert.equal(binding.receipt_sha256,lock.receiptSha256);
assert.equal(binding.source_inventory_sha256,lock.closure.sha256);
for(const [relative,item] of Object.entries(binding.served))
  assert.equal(item.sha256,sha(join(payload,relative)),'Observed runtime bytes: '+relative);
const tag='ST_LS_HUD_LAYOUT ', rows=report.records.runtime.filter(row=>row.text.startsWith(tag));
assert.ok(rows.length>0,'Actual WebGL layout emissions are required');
const fresh=()=>({states:[],encounters:[],hits:[],layouts:[],cues:[]});
let longerThanDebugLimit=0, visibleShop=0;
for(const row of rows) {
  assert.ok(Number.isFinite(row.t) && Number.isFinite(row.timeOrigin) && row.load>0,'Actual document clock');
  const output=fresh();
  assert.doesNotThrow(()=>retainRuntimeObservation(row,row.load,'layout-transport',output),
    'Complete WebGL HUD diagnostic must reach the unchanged strict reader');
  assert.equal(output.layouts.length,1);
  const expected=JSON.parse(row.text.slice(tag.length)), actual=output.layouts[0];
  assert.deepEqual(actual.graphics,expected.graphics,'Retain every actual measured graphic unchanged');
  assert.ok(Array.isArray(actual.graphics) && actual.graphics.length>0,'Nonempty complete graphics');
  assert.equal(actual.coordinates,'top-left');
  const paths=actual.graphics.map(item=>item.path);
  assert.equal(new Set(paths).size,paths.length,'Every observed graphic has its own path');
  for(const key of ['cannonAttack','launcherAttack','hullCapacity','armor','cannonCycle','fieldRepair'])
    for(const suffix of ['Title','Levels','CurrentEffect','NextEffect','Price','Refusal'])
      assert.ok(paths.some(path=>path.endsWith('/ShopCard_'+key+suffix)),
        'Complete late shop graphics: '+key+suffix);
  for(const graphic of actual.graphics) {
    for(const field of ['x','y','width','height','fontCssSize','preferredWidthCss','preferredHeightCss'])
      assert.ok(Number.isFinite(graphic[field]),'Measured graphic field '+field);
    assert.equal(typeof graphic.active,'boolean');
    assert.equal(typeof graphic.text,'string');
  }
  if(actual.graphics.some(item=>item.active && /\/ShopCard_.*Title$/.test(item.path)))visibleShop++;
  if(row.text.length>8190) {
    longerThanDebugLimit++;
    assert.throws(()=>retainRuntimeObservation({...row,text:row.text.slice(0,8190)},row.load,
      'negative-truncation',fresh()),SyntaxError,'Reject the original diagnostic truncation');
  }
  assert.throws(()=>retainRuntimeObservation({...row,text:row.text.slice(0,-1)},row.load,
    'negative-partial',fresh()),SyntaxError,'Reject a missing closing object');
}
assert.ok(longerThanDebugLimit>0,'Exercise actual diagnostics beyond the former 8190-character limit');
assert.ok(visibleShop>0,'At least one live shop must supply actual visible card graphics');
console.log(JSON.stringify({report:reportPath,reportSha256:sha(reportPath),build:binding.build,
  sourceInventorySha256:binding.source_inventory_sha256,rows:rows.length,longerThanDebugLimit,visibleShop}));
"""
        result = subprocess.run([r"C:/Program Files/nodejs/node.exe", "--input-type=module", "-e", script,
                                 str(ROOT), report], cwd=ROOT, capture_output=True, timeout=60)
        output = Path(evidence)
        output.mkdir(parents=True, exist_ok=True)
        (output / "layout-transport.stdout.txt").write_bytes(result.stdout)
        (output / "layout-transport.stderr.txt").write_bytes(result.stderr)
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", "replace"))

    def input_case(self):
        self.exit_code, self.log = self.run_checks("RunInput")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_input_keyboard_pointer_same_intents_and_focus(self):
        self.input_case()

    def test_input_terminal_resize_and_no_world_leak(self):
        self.input_case()

    def test_input_compact_real_scroll_reaches_clipped_cards(self):
        self.exit_code, self.log = self.run_checks("RunCompactScroll")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_input_compact_shop_keeps_upgrade_readable(self):
        self.exit_code, self.log = self.run_checks("RunCompactReading")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def integration_case(self):
        self.exit_code, self.log = self.run_checks("RunIntegration")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_integration_two_fittings_effects_and_lifecycle(self):
        self.integration_case()

    def test_integration_old_save_conflict_and_legacy_parity(self):
        self.integration_case()

    def polish_case(self):
        self.exit_code, self.log = self.run_checks("RunPolish")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_shop_only_fitted_modules_visible_and_focusable(self):
        self.polish_case()

    def test_shop_plain_compact_readable_composition(self):
        self.polish_case()

    def render_followup_case(self):
        self.exit_code, self.log = self.run_checks("RunRenderFollowup")
        name = self._testMethodName
        self.assertIn("ST_LS_SHOP_PASS " + name, self.log, self.log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_shop_rendered_effect_separator(self):
        self.render_followup_case()

    def test_shop_price_line(self):
        code, log = self.run_checks("RunResearchSprint")
        self.assertIn("ST_LS_SHOP_PASS " + self._testMethodName, log, log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL ", log)
        self.assertEqual(code, 0, log[-10000:])

    def test_wave_information_surface(self):
        code, log = self.run_checks("RunResearchSprint")
        self.assertIn("ST_LS_SHOP_PASS " + self._testMethodName, log, log[-14000:])
        self.assertNotIn("ST_LS_SHOP_FAIL ", log)
        self.assertEqual(code, 0, log[-10000:])

    def test_shop_workshop_single_purchase_action(self):
        self.render_followup_case()
