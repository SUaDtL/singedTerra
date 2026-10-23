"""Actual imported Unity scene/controller integration, with isolated test saves."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[3]
UNITY = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe")


class TierControllerTests(unittest.TestCase):
    def test_tier_goal_result_controller_and_layout(self):
        folder = ROOT / "campaign-unity/Evidence/last-stand-tier-progression" / (
            datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
        folder.mkdir(parents=True, exist_ok=False)
        log = folder / "unity-controller.log"
        env = os.environ.copy()
        common = Path(env.get("ProgramData", "C:/ProgramData"))
        self.assertTrue(common.is_dir())
        env.setdefault("ProgramData", str(common))
        env.setdefault("ALLUSERSPROFILE", str(common))
        project = ROOT / "campaign-unity/Unity"
        env["ST_LS_PROJECT_CHECK"] = str(project)
        ownership = subprocess.run(["powershell.exe", "-NoProfile", "-Command",
            "$p=$env:ST_LS_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"],
            env=env, capture_output=True, text=True, timeout=30)
        self.assertEqual(ownership.returncode, 0, "An existing Unity Editor owns this project.")
        def source_hashes():
            return {path.relative_to(project).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in sorted((project / "Assets").rglob("*.cs"))}
        before = source_hashes()
        argv = [str(UNITY), "-batchmode", "-nographics", "-quit", "-projectPath", str(project),
                "-executeMethod", "LastStandTierChecks.Run", "-logFile", str(log)]
        result = subprocess.run(argv, env=env, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=600)
        content = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
        print("Tier controller evidence:", folder, flush=True)
        self.assertEqual(result.returncode, 0, content[-6000:] + result.stdout + result.stderr)
        self.assertIn("ST_LS_TIER_PASS test_tier_goal_result_controller_and_layout", content)
        self.assertEqual(source_hashes(), before, "Assets C# changed during the controller check.")
        (folder / "source-binding.json").write_text(json.dumps({"sources": before,
            "marker": "ST_LS_TIER_PASS test_tier_goal_result_controller_and_layout"}, indent=2), encoding="utf-8")
