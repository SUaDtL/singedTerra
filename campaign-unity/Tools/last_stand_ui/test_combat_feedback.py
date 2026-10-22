"""Pinned imported presentation checks, with no player storage or native input."""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "campaign-unity/Unity"
UNITY = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe")


def digest(path):
    # ADR-0017 approves Node's built-in SHA-256 for build/source provenance.
    script = ("const {readFileSync}=require('node:fs');"
              "const {createHash}=require('node:crypto');"
              "process.stdout.write(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'));")
    result = subprocess.run(["node", "-e", script, str(path)], cwd=ROOT,
                            capture_output=True, text=True, check=True, timeout=30)
    value = result.stdout.strip()
    if len(value) != 64 or any(char not in "0123456789abcdef" for char in value):
        raise RuntimeError("Invalid source-integrity digest")
    return value


class CombatFeedbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        evidence = ROOT / "campaign-unity/Evidence/first-session-polish" / (
            "combat-editor-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
        evidence.mkdir(parents=True, exist_ok=False)
        env = os.environ.copy()
        common = Path(env.get("ProgramData", "C:/ProgramData"))
        if not common.is_dir():
            raise RuntimeError("ProgramData unavailable")
        env.setdefault("ProgramData", str(common))
        env.setdefault("ALLUSERSPROFILE", str(common))
        env["ST_LS_PROJECT_CHECK"] = str(PROJECT)
        check = "$p=$env:ST_LS_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"
        owner = subprocess.run(["powershell.exe", "-NoProfile", "-Command", check], env=env,
                               capture_output=True, text=True, timeout=30)
        if owner.returncode:
            raise RuntimeError("Unity Editor already owns this project")
        inputs = [PROJECT / "Assets/Scripts" / name for name in (
            "EncounterView.cs", "ReviewCombatVisuals.cs", "TankPresentation.cs", "EncounterModel.cs",
            "EncounterProfile.cs", "LastStandTierCatalog.cs", "BattlefieldReview.cs")]
        inputs += [PROJECT / "Assets/Editor/LastStandCombatFeedbackChecks.cs",
                   PROJECT / "Assets/Scenes/LastStandPrototype.unity",
                   PROJECT / "ProjectSettings/ProjectSettings.asset", Path(__file__)]
        before = {str(p.relative_to(ROOT)): digest(p) for p in inputs}
        log = evidence / "unity-editor.log"
        argv = [str(UNITY), "-batchmode", "-nographics", "-quit", "-projectPath", str(PROJECT),
                "-executeMethod", "LastStandCombatFeedbackChecks.Run", "-logFile", str(log)]
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, encoding="utf-8", errors="replace")
        (evidence / "invocation.json").write_text(json.dumps({"argv": argv, "cwd": str(ROOT), "pid": process.pid,
            "source_sha256": before, "unity_sha256": digest(UNITY)}, indent=2), encoding="utf-8")
        try:
            stdout, stderr = process.communicate(timeout=300)
        except subprocess.TimeoutExpired:
            process.kill()  # Only the Editor this runner launched.
            stdout, stderr = process.communicate()
            (evidence / "timeout.txt").write_text(stdout + "\n" + stderr, encoding="utf-8")
            raise
        cls.log = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
        cls.exit_code = process.returncode
        after = {str(p.relative_to(ROOT)): digest(p) for p in inputs}
        (evidence / "result.json").write_text(json.dumps({"exit": cls.exit_code, "stdout": stdout,
            "stderr": stderr, "source_unchanged": before == after,
            "log_sha256": digest(log) if log.exists() else None}, indent=2), encoding="utf-8")
        print("Unity combat evidence:", evidence, flush=True)
        if before != after:
            raise RuntimeError("Presentation check inputs changed during owned Editor run")

    def check_case(self, name):
        summary = "\n".join(line for line in self.log.splitlines() if "ST_LS_COMBAT_" in line or "error CS" in line)
        self.assertTrue("ST_LS_COMBAT_PASS " + name in self.log, summary or self.log[-4000:])
        self.assertNotIn("ST_LS_COMBAT_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, summary or self.log[-4000:])

    def test_event_time_destruction(self): self.check_case(self._testMethodName)
    def test_reduced_informative_feedback(self): self.check_case(self._testMethodName)
    def test_toggle_clears_paused_flashes(self): self.check_case(self._testMethodName)
    def test_reduced_aim_recoil_and_restore(self): self.check_case(self._testMethodName)
    def test_model_and_pool_preservation(self): self.check_case(self._testMethodName)


if __name__ == "__main__":
    unittest.main()
