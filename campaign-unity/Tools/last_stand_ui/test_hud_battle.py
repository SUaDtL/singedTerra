"""T-06 oracles over actual imported Unity combat Canvas and state/action owners."""
from pathlib import Path
import unittest
import unity_check_runner
from datetime import datetime, timezone
import json
import os
import subprocess
import uuid




def run_runtime_checks():
    evidence = unity_check_runner.EVIDENCE / ("runtime-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    evidence.mkdir(parents=True, exist_ok=False)
    env = os.environ.copy()
    common = Path(env.get("ProgramData", "C:/ProgramData"))
    if not common.is_dir():
        raise RuntimeError("ProgramData unavailable")
    env.setdefault("ProgramData", str(common)); env.setdefault("ALLUSERSPROFILE", str(common))
    env["ST_LS_PROJECT_CHECK"] = str(unity_check_runner.PROJECT)
    check = "$p=$env:ST_LS_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"
    ownership = subprocess.run(["powershell.exe", "-NoProfile", "-Command", check], env=env, capture_output=True, text=True, timeout=30)
    if ownership.returncode:
        raise RuntimeError("Unity Editor already owns this project")
    root, project, unity = unity_check_runner.ROOT, unity_check_runner.PROJECT, unity_check_runner.UNITY
    log = evidence / "unity-editor.log"
    argv = [str(unity), "-batchmode", "-nographics", "-projectPath", str(project),
            "-executeMethod", "LastStandHudChecks.RunBattleRuntime", "-logFile", str(log)]
    def input_paths():
        return sorted(set((project / "Assets" / "Scripts").rglob("*.cs")) |
                      set((project / "Assets" / "Editor").rglob("*.cs")) |
                      {Path(__file__), root / "campaign-unity/Tools/contracts/last-stand-observation-v3.json", root / "campaign-unity/Tools/contracts/last-stand-observation-v4.json"})
    source = unity_check_runner.source_hashes(input_paths())
    process = subprocess.Popen(argv, cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding="utf-8", errors="replace")
    (evidence / "invocation.json").write_text(json.dumps({"argv": argv, "cwd": str(root), "pid": process.pid,
        "source_sha256": source, "unity_sha256": unity_check_runner.source_hashes([unity])[str(unity)]}, indent=2))
    try:
        stdout, stderr = process.communicate(timeout=150)
    except subprocess.TimeoutExpired:
        process.kill()  # Only the Editor launched by this test.
        stdout, stderr = process.communicate()
        (evidence / "timeout.txt").write_text(stdout + "\n" + stderr)
        raise
    content = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    after = unity_check_runner.source_hashes(input_paths())
    (evidence / "result.json").write_text(json.dumps({"exit": process.returncode, "stdout": stdout, "stderr": stderr,
        "source_unchanged": source == after, "log_sha256": unity_check_runner.source_hashes([log])[log.relative_to(root).as_posix() if log.is_relative_to(root) else str(log)] if log.exists() else None}, indent=2))
    if source != after:
        raise RuntimeError("Runtime HUD source changed during owned Editor launch")
    print("Unity runtime evidence:", evidence)
    return process.returncode, content

class HudBattleTests(unittest.TestCase):
    def __str__(self):
        return f"{self._testMethodName} (test_hud_battle.HudBattleTests)"

    @classmethod
    def setUpClass(cls):
        # T-06 appends fresh evidence; the shared runner and historical T-05
        # evidence remain byte-identical. Its ROOT/PROJECT/UNITY do not change.
        unity_check_runner.EVIDENCE = Path(
            r"C:\Users\brenn\codearbiter-review-integration-20261006\ui-t06-author-20261008")
        unity_check_runner.EVIDENCE = Path(r"C:\Users\brenn\codearbiter-review-integration-20261006\ui-t06-correction-20261008")
        cls.exit_code, cls.log = unity_check_runner.run_checks("LastStandHudChecks.RunBattle")
        cls.runtime_exit, cls.runtime_log = run_runtime_checks()

    def check_case(self, name):
        summary = "\n".join(line for line in self.log.splitlines()
                            if "ST_LS_HUD_" in line or "error CS" in line)
        self.assertTrue("ST_LS_HUD_PASS " + name in self.log, summary or self.log[-3000:])
        self.assertNotIn("ST_LS_HUD_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, summary or self.log[-3000:])

    def test_live_hull_time_kills_damage_and_fitting(self):
        self.check_case(self._testMethodName)

    def test_battle_chrome_geometry_and_contrast(self):
        self.check_case(self._testMethodName)
        self.check_case("test_battle_canvas_derived_geometry")

    def test_pause_mute_and_catchup_presentation(self):
        self.check_case(self._testMethodName)
        summary = "\n".join(line for line in self.runtime_log.splitlines() if "ST_LS_HUD_" in line or "error CS" in line)
        self.assertTrue("ST_LS_HUD_PASS test_current_layout_runtime_report" in self.runtime_log, summary or self.runtime_log[-3000:])
        self.assertNotIn("ST_LS_HUD_FAIL test_current_layout_runtime_report", self.runtime_log)
        self.assertEqual(self.runtime_exit, 0, summary or self.runtime_log[-3000:])


if __name__ == "__main__":
    unittest.main()
