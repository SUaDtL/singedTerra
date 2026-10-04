"""Thin launcher for the pinned real Unity Editor checks."""
from pathlib import Path
import os
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "campaign-unity" / "Unity"
EVIDENCE = ROOT / "campaign-unity" / "Evidence" / "last-stand-playable-loop" / "t02"
UNITY = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe")


class LastStandUnityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        log = EVIDENCE / "unity-editor.log"
        env = os.environ.copy()
        if os.name == "nt":
            common = Path(env.get("ProgramData", env.get("SystemDrive", "C:") + "/ProgramData"))
            if not common.is_dir():
                raise RuntimeError("ProgramData unavailable")
            env.setdefault("ProgramData", str(common))
            env.setdefault("ALLUSERSPROFILE", str(common))
            env["ST_LS_PROJECT_CHECK"] = str(PROJECT)
            check = "$p=$env:ST_LS_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"
            ownership = subprocess.run(["powershell.exe", "-NoProfile", "-Command", check], env=env, capture_output=True, text=True, timeout=30)
            if ownership.returncode:
                raise RuntimeError("Unity Editor already owns the project")
        command = [str(UNITY), "-batchmode", "-nographics", "-quit",
                   "-projectPath", str(PROJECT), "-executeMethod", "LastStandLoopChecks.Run",
                   "-logFile", str(log)]
        proc = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=300)
        cls.log = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
        cls.exit_code = proc.returncode
        (EVIDENCE / "unity-invocation.txt").write_text(
            " ".join(command) + "\nexit=" + str(proc.returncode) + "\n" +
            proc.stdout[-3000:] + "\n" + proc.stderr[-3000:], encoding="utf-8")

    def test_real_session_modes_and_damage(self):
        self.assertEqual(self.exit_code, 0, self.log[-5000:])
        self.assertIn("ST_LS_UNITY_PASS test_real_session_modes_and_damage", self.log, self.log[-5000:])

    def test_pause_terminal_ui_and_audio_lifecycle(self):
        self.assertEqual(self.exit_code, 0, self.log[-5000:])
        self.assertIn("ST_LS_UNITY_PASS test_pause_terminal_ui_and_audio_lifecycle", self.log, self.log[-5000:])


if __name__ == "__main__":
    unittest.main()
