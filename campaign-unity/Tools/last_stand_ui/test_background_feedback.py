"""Run actual imported controller/audio lifecycle checks with disposable saves."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "campaign-unity" / "Unity"
UNITY = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe")
EVIDENCE_ROOT = Path(os.environ.get("ST_LS_UI_EVIDENCE", str(ROOT / "campaign-unity/Evidence/last-stand-ui")))


def source_hashes():
    paths = []
    for directory in ("Assets/Scripts", "Assets/Editor", "Assets/Scenes", "ProjectSettings"):
        paths.extend(p for p in (PROJECT / directory).rglob("*") if p.is_file())
    paths.extend((PROJECT / "Packages").glob("*.json"))
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}


class BackgroundFeedbackTests(unittest.TestCase):
    def __str__(self):
        return f"{self._testMethodName} (test_background_feedback.BackgroundFeedbackTests)"

    @classmethod
    def setUpClass(cls):
        cls.runs = {}

    @classmethod
    def run_checks(cls, method):
        if method in cls.runs:
            return cls.runs[method]
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
            (evidence / "ownership.json").write_text(json.dumps({"exit": ownership.returncode,
                "stdout": ownership.stdout, "stderr": ownership.stderr}, indent=2), encoding="utf-8")
            if ownership.returncode:
                raise RuntimeError("Unity Editor already owns the project")
        log = evidence / "unity-editor.log"
        argv = [str(UNITY), "-batchmode", "-nographics", "-quit", "-projectPath", str(PROJECT),
                "-executeMethod", "LastStandBackgroundChecks." + method, "-logFile", str(log)]
        seals = source_hashes()
        for relative in seals:
            archived = evidence / "source-archive" / relative
            archived.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, archived)
        startup = None
        if os.name == "nt":
            startup = subprocess.STARTUPINFO()
            startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startup.wShowWindow = subprocess.SW_HIDE
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, encoding="utf-8", errors="replace", startupinfo=startup)
        (evidence / "invocation.json").write_text(json.dumps({"argv": argv, "cwd": str(ROOT),
            "pid": process.pid, "source_sha256": seals,
            "unity_sha256": hashlib.sha256(UNITY.read_bytes()).hexdigest()}, indent=2), encoding="utf-8")
        timed_out = False
        try:
            stdout, stderr = process.communicate(timeout=300)
        except subprocess.TimeoutExpired:
            timed_out = True
            process.kill()  # Only this owned launch, never another Editor.
            stdout, stderr = process.communicate()
        after = source_hashes()
        assemblies = {}
        for assembly in (PROJECT / "Library/ScriptAssemblies").glob("Assembly-CSharp*.dll"):
            archived = evidence / "compiled-assemblies" / assembly.name
            archived.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(assembly, archived)
            assemblies[assembly.name] = hashlib.sha256(archived.read_bytes()).hexdigest()
        cls.log = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
        cls.exit_code = process.returncode
        (evidence / "result.json").write_text(json.dumps({"exit": process.returncode,
            "stdout": stdout, "stderr": stderr, "timed_out": timed_out, "source_unchanged": seals == after,
            "source_sha256_after": after, "compiled_assemblies_sha256": assemblies,
            "log_sha256": hashlib.sha256(log.read_bytes()).hexdigest() if log.exists() else None}, indent=2), encoding="utf-8")
        print("Unity evidence:", evidence)
        if timed_out:
            raise AssertionError("Owned Unity Editor exceeded its 300-second bound")
        if seals != after:
            raise AssertionError("Background check source changed during the owned Editor launch")
        if "ST_LS_BACKGROUND_COMPILED" not in cls.log:
            raise AssertionError("Unity did not compile and enter the actual background checks:\n" + cls.log[-10000:])
        cls.runs[method] = (cls.exit_code, cls.log)
        return cls.runs[method]

    def check_case(self, name, method="RunFeedback"):
        self.exit_code, self.log = self.run_checks(method)
        self.assertTrue("ST_LS_BACKGROUND_PASS " + name in self.log, self.log[-10000:])
        self.assertFalse("ST_LS_BACKGROUND_FAIL " + name in self.log, self.log[-10000:])
        self.assertEqual(self.exit_code, 0, self.log[-10000:])

    def test_background_defeat_settles_once(self):
        self.check_case(self._testMethodName)

    def test_pause_excludes_settling_time(self):
        self.check_case(self._testMethodName)

    def test_focus_restores_current_cues_without_replay(self):
        self.check_case(self._testMethodName)

    def test_mute_and_profile_lifecycle_remain_isolated(self):
        self.check_case(self._testMethodName)

    def test_authoritative_first_hit_survives_feedback_suppression(self):
        self.check_case(self._testMethodName, "RunHitObservation")

    def test_actual_current_cue_admission(self):
        for name in ("test_current_cue_pair_expires_independently", "test_terminal_cue_includes_persistence_time"):
            self.check_case(name, "RunCueAdmission")


if __name__ == "__main__":
    unittest.main()
