"""T-08: actual Unity focus, native Submit and pointer/touch Canvas checks.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_ui -p test_hud_input.py -v
"""
from pathlib import Path
import importlib.util
import json
import subprocess
import tempfile
import uuid
import hashlib
import os
import difflib
import unittest
import unity_check_runner


def run_input_checks():
    """Pinned actual Editor with graphics for native Canvas depth/raycasting.

    The earlier shared runner uses -nographics. This task needs Canvas native
    batching, so its dedicated launch keeps the same source/tool/ownership
    safeguards and omits that flag. No earlier runner/test is changed.
    """
    root, project, unity = unity_check_runner.ROOT, unity_check_runner.PROJECT, unity_check_runner.UNITY
    evidence = unity_check_runner.EVIDENCE / ("editor-input-" + uuid.uuid4().hex[:8])
    evidence.mkdir(parents=True,exist_ok=False)
    env = os.environ.copy()
    common = Path(env.get("ProgramData", "C:/ProgramData"))
    if not common.is_dir():
        raise RuntimeError("ProgramData unavailable")
    env.setdefault("ProgramData",str(common)); env.setdefault("ALLUSERSPROFILE",str(common))
    env["ST_LS_PROJECT_CHECK"] = str(project)
    ownership = subprocess.run(["powershell.exe","-NoProfile","-Command",
        "$p=$env:ST_LS_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"],
        env=env,capture_output=True,text=True,timeout=30)
    if ownership.returncode:
        raise RuntimeError("Unity Editor already owns this project")
    log = evidence / "unity-editor.log"
    argv = [str(unity),"-batchmode","-quit","-projectPath",str(project),
            "-executeMethod","LastStandHudChecks.RunInput","-logFile",str(log)]
    # Native rendering round-trips only these three admitted art materials.
    # Keep a test-owned raw-byte fixture and reject every other observed shape.
    rounding = {
        "ST2_Char.mat": ("{r: 0.055, g: 0.042, b: 0.033, a: 1}",
                         "{r: 0.054999977, g: 0.04199999, b: 0.033, a: 1}"),
        "ST2_Edge.mat": ("{r: 0.17, g: 0.19, b: 0.18, a: 1}",
                         "{r: 0.16999996, g: 0.18999997, b: 0.17999998, a: 1}"),
        "ST2_Steel.mat": ("{r: 0.075, g: 0.09, b: 0.095, a: 1}",
                          "{r: 0.07499998, g: 0.089999996, b: 0.09499996, a: 1}"),
    }
    materials = {project/"Assets/SeedPack02/Generated/Materials"/name: values
                 for name,values in rounding.items()}
    material_before = {path:path.read_bytes() for path in materials}
    inputs = list((project/"Assets/Scripts").glob("*.cs")) + [project/"Assets/Editor/LastStandHudChecks.cs",
        project/"ProjectSettings/InputManager.asset",Path(__file__), root/"campaign-unity/Tools/make_web_entry.py",
        root/"campaign-unity/Tools/web-index-template.html", *materials]
    source = {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = subprocess.SW_HIDE
    process = subprocess.Popen(argv,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                               text=True,encoding="utf-8",errors="replace",startupinfo=startup)
    (evidence/"invocation.json").write_text(json.dumps({"argv":argv,"cwd":str(root),"pid":process.pid,
        "source_sha256":source,"unity_sha256":hashlib.sha256(unity.read_bytes()).hexdigest()},indent=2))
    timed_out=False
    try:
        stdout,stderr=process.communicate(timeout=300)
    except subprocess.TimeoutExpired:
        process.kill()  # Only this task's directly owned Editor.
        stdout,stderr=process.communicate()
        (evidence/"timeout.txt").write_text(stdout+"\n"+stderr,encoding="utf-8")
        timed_out=True
    fixture_records=[]
    for path,(original_color,render_color) in materials.items():
        before=material_before[path]; observed=path.read_bytes()
        if observed==before: continue
        before_text=before.decode("utf-8").replace("\r\n","\n")
        observed_text=observed.decode("utf-8").replace("\r\n","\n")
        old_line="    - _Color: "+original_color
        new_line="    - _Color: "+render_color
        expected=before_text.replace(old_line,new_line,1)
        valid=observed_text==before_text or (before_text.count(old_line)==1 and observed_text==expected)
        # Preserve both raw inputs before judging or restoring an owned write.
        fixture=evidence/"render-material-fixture";fixture.mkdir(exist_ok=True)
        (fixture/(path.name+".before")).write_bytes(before)
        (fixture/(path.name+".observed")).write_bytes(observed)
        (fixture/(path.name+".diff")).write_text("".join(difflib.unified_diff(
            before_text.splitlines(keepends=True),observed_text.splitlines(keepends=True),
            fromfile="before/"+path.name,tofile="observed/"+path.name)),encoding="utf-8")
        fixture_records.append({"path":path.relative_to(root).as_posix(),
            "before_sha256":hashlib.sha256(before).hexdigest(),
            "observed_sha256":hashlib.sha256(observed).hexdigest(),
            "known_roundtrip_shape":valid,"restored":valid})
        (fixture/"changes.json").write_text(json.dumps(fixture_records,indent=2))
        if not valid:
            raise RuntimeError("Unexpected material change; retained without restoring: "+str(path))
        path.write_bytes(before)
    content=log.read_text(encoding="utf-8",errors="replace") if log.exists() else ""
    after={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    (evidence/"result.json").write_text(json.dumps({"exit":process.returncode,"stdout":stdout,"stderr":stderr,
        "source_unchanged":source==after,"render_material_observed_writes":fixture_records,
        "log_sha256":hashlib.sha256(log.read_bytes()).hexdigest() if log.exists() else None},indent=2))
    if source != after:
        raise RuntimeError("Input source changed during the owned Editor launch")
    if timed_out:
        raise TimeoutError("Owned Editor timed out; bounded material fixture restored")
    print("Unity input evidence:",evidence)
    return process.returncode,content


class HudInputTests(unittest.TestCase):
    def __str__(self):
        return f"{self._testMethodName} (test_hud_input.HudInputTests)"

    @classmethod
    def setUpClass(cls):
        unity_check_runner.EVIDENCE = Path(
            r"C:\Users\brenn\codearbiter-review-integration-20261006\ui-t08-author-20261008")
        cls.exit_code, cls.log = run_input_checks()

    def check_case(self, name):
        summary = "\n".join(line for line in self.log.splitlines()
                            if "ST_LS_HUD_PASS" in line or "ST_LS_HUD_FAIL" in line or "error CS" in line)
        self.assertTrue("ST_LS_HUD_PASS " + name in self.log, summary or self.log[-3000:])
        self.assertNotIn("ST_LS_HUD_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, summary or self.log[-3000:])

    def test_visible_enabled_navigation_order(self):
        self.check_case(self._testMethodName)

    def test_keyboard_activation_and_focus_style(self):
        # Existing InputManager is the supported key owner; no second submit
        # poll or gameplay callback is introduced by the HUD.
        settings = (unity_check_runner.PROJECT / "ProjectSettings/InputManager.asset").read_text()
        submit = settings.split("m_Name: Submit")[1:]
        self.assertTrue(any("positiveButton: return" in value.split("m_Name:")[0] for value in submit))
        self.assertTrue(any("positiveButton: enter" in value.split("m_Name:")[0] and
                            "altPositiveButton: space" in value.split("m_Name:")[0] for value in submit))
        self.check_case(self._testMethodName)

    def test_pointer_targets_match_visual_bounds(self):
        self.check_case(self._testMethodName)

    def test_conditional_wrapper_focus_and_geometry(self):
        """Real DOM geometry/event boundary with a controlled loader only.

        This deliberately makes no Unity gameplay/export/input claim.
        """
        tools = unity_check_runner.ROOT / "campaign-unity/Tools"
        spec = importlib.util.spec_from_file_location("input_web_entry", tools / "make_web_entry.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as folder:
            build = Path(folder)
            (build / "Build").mkdir()
            for suffix in ("loader.js", "framework.js", "data", "wasm"):
                (build / "Build" / ("fixture." + suffix)).write_bytes(b"controlled loader")
            html = module.render_web_entry(build, "last-stand", tools.parent)
        script = r'''
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const html = JSON.parse(process.argv[1]);
(async()=>{
  const browser = await chromium.launch({headless:true});
  try {
    for (const [width,height] of [[1366,768],[1920,1080],[390,844],[844,390],[720,640]]) {
      const page = await browser.newPage({viewport:{width,height}});
      await page.route('http://wrapper.test/**',route=>{
        if(route.request().url().endsWith('.loader.js'))return route.fulfill({contentType:'application/javascript',body:`
          window.calls=[];window.nativeKeys=[];
          window.createUnityInstance=()=>{
            ['keydown','keyup','keypress'].forEach(type=>window.addEventListener(type,event=>{window.nativeKeys.push([type,event.key]);event.preventDefault()},true));
            return Promise.resolve({SendMessage:(...args)=>window.calls.push(args)});
          };`});
        return route.fulfill({contentType:'text/html',body:html});
      });
      await page.goto('http://wrapper.test/last-stand/');
      await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
      const geometry=await page.evaluate(()=>{
        const rect=selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,font:parseFloat(s.fontSize),text:e.textContent}};
        return {nav:rect('#last-stand-nav'),loss:rect('#last-stand-loss'),back:rect('#last-stand-return'),canvas:rect('canvas'),active:document.activeElement.id};
      });
      console.log('ST_LS_WRAPPER_GEOMETRY',width,height,JSON.stringify(geometry));
      for(const node of [geometry.nav,geometry.loss,geometry.back])assert.ok(node.font>=14,'native shell actual minimum 14px text');
      assert.ok(geometry.back.width>=44&&geometry.back.height>=44,'native Return actual target');
      assert.ok(geometry.back.bottom<=geometry.nav.bottom&&geometry.loss.bottom<=geometry.nav.bottom,'Return/disclosure fit navigation header');
      assert.ok(geometry.canvas.y>=geometry.nav.bottom&&geometry.canvas.bottom<=height+.5,'one available Canvas without outer overlap');
      assert.equal(geometry.active,'unity-canvas');
      assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),['LastStandLoopHud','NavigateKeyboard','enter-first'],'actual DOM Canvas focus enters one Unity navigation owner');
      await page.evaluate(()=>{window.calls=[];window.nativeKeys=[]});
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'unity-canvas','inner Tab keeps Canvas until owner boundary');
      assert.deepEqual(await page.evaluate(()=>window.calls),[['LastStandLoopHud','NavigateKeyboard','next']],'one Tab handoff');
      assert.equal(await page.evaluate(()=>window.nativeKeys.filter(x=>x[1]==='Tab').length),0,'no duplicate Unity native Tab');
      await page.keyboard.press('Shift+Tab');
      assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),['LastStandLoopHud','NavigateKeyboard','previous']);
      await page.keyboard.press('Enter');
      assert.ok(await page.evaluate(()=>window.nativeKeys.some(x=>x[1]==='Enter')),'existing native Submit key remains delivered');
      await page.evaluate(()=>window.dispatchEvent(new Event('st-last-stand-keyboard-exit')));
      assert.equal(await page.evaluate(()=>document.activeElement.id),'last-stand-return','owner boundary focuses actual native anchor');
      await page.evaluate(()=>{window.calls=[];window.nativeKeys=[]});
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'unity-canvas','native Tab returns from anchor to Canvas');
      assert.deepEqual(await page.evaluate(()=>window.calls),[['LastStandLoopHud','NavigateKeyboard','enter-first']]);
      await page.evaluate(()=>window.dispatchEvent(new Event('st-last-stand-keyboard-exit')));
      await page.evaluate(()=>{window.calls=[];window.nativeKeys=[]});
      await page.keyboard.press('Enter');
      assert.equal(page.url(),'http://wrapper.test/last-stand/','live Unity owns confirmation before Return navigation');
      assert.deepEqual(await page.evaluate(()=>window.calls),[
        ['LastStandLoopHud','NavigateKeyboard','enter-first'],['LastStandBrowserBridge','RequestReturn','']],
        'Return restores Canvas focus and sends one request to the existing confirmation owner');
      // Return moves focus to Canvas on click; its later keyup may arrive there.
      // Only a keydown/keypress can trigger the existing native Submit binding.
      assert.equal(await page.evaluate(()=>window.nativeKeys.filter(x=>x[1]==='Enter'&&x[0]!=='keyup').length),0,
        'native Return activation does not submit a newly focused Unity control');
      await page.close();
    }
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
'''
        result = subprocess.run(["node", "-e", script, json.dumps(html)],
                                cwd=unity_check_runner.ROOT, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=90)
        evidence = unity_check_runner.EVIDENCE / (("wrapper-red-" if result.returncode else "wrapper-green-") + uuid.uuid4().hex[:8])
        evidence.mkdir(exist_ok=False)
        (evidence / "result.json").write_text(json.dumps({"argv": ["node", "-e", "retained-script", "generated-html"],
            "cwd": str(unity_check_runner.ROOT), "exit": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr}, indent=2))
        (evidence / "script.js").write_text(script)
        (evidence / "generated.html").write_text(html,encoding="utf-8")
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)


if __name__ == "__main__":
    unittest.main()
