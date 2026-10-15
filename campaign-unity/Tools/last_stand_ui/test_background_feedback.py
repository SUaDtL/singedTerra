"""Run actual imported controller/audio lifecycle checks with disposable saves."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "campaign-unity" / "Unity"
UNITY = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe")
EVIDENCE_ROOT = Path(r"C:\Users\brenn\codearbiter-review-integration-20261006\ui-t03-coverage-backfill-author")


class BackgroundFeedbackTests(unittest.TestCase):
    def __str__(self):
        return f"{self._testMethodName} (test_background_feedback.BackgroundFeedbackTests)"

    @classmethod
    def setUpClass(cls):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        evidence = EVIDENCE_ROOT / f"editor-{stamp}-{uuid.uuid4().hex[:8]}"
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
            if ownership.returncode:
                raise RuntimeError("Unity Editor already owns the project")
        log = evidence / "unity-editor.log"
        argv = [str(UNITY), "-batchmode", "-nographics", "-quit", "-projectPath", str(PROJECT),
                "-executeMethod", "LastStandBackgroundChecks.RunFeedback", "-logFile", str(log)]
        source_paths = ["Scripts/LastStandLoopController.cs", "Scripts/LastStandAudio.cs",
                        "Scripts/TankPresentation.cs", "Scripts/EncounterSession.cs",
                        "Editor/LastStandBackgroundChecks.cs", "Editor/LastStandLoopChecks.cs"]
        seals = {p: hashlib.sha256((PROJECT / "Assets" / p).read_bytes()).hexdigest() for p in source_paths}
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, encoding="utf-8", errors="replace")
        (evidence / "invocation.json").write_text(json.dumps({"argv": argv, "cwd": str(ROOT),
            "pid": process.pid, "source_sha256": seals}, indent=2))
        try:
            stdout, stderr = process.communicate(timeout=300)
        except subprocess.TimeoutExpired:
            process.kill()  # Only this owned launch, never another Editor.
            stdout, stderr = process.communicate()
            (evidence / "timeout.txt").write_text(stdout + "\n" + stderr)
            raise
        cls.log = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
        cls.exit_code = process.returncode
        (evidence / "result.json").write_text(json.dumps({"exit": process.returncode,
            "stdout": stdout, "stderr": stderr, "log_sha256": hashlib.sha256(log.read_bytes()).hexdigest() if log.exists() else None}, indent=2))
        print("Unity evidence:", evidence)

    def check_case(self, name):
        self.assertIn("ST_LS_BACKGROUND_PASS " + name, self.log, self.log[-10000:])
        self.assertNotIn("ST_LS_BACKGROUND_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_background_defeat_settles_once(self):
        self.check_case(self._testMethodName)

    def test_pause_excludes_settling_time(self):
        self.check_case(self._testMethodName)

    def test_focus_restores_current_cues_without_replay(self):
        self.check_case(self._testMethodName)

    def test_mute_and_profile_lifecycle_remain_isolated(self):
        self.check_case(self._testMethodName)


if __name__ == "__main__":
    unittest.main()
