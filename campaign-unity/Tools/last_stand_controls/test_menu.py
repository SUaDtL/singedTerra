"""Actual imported Unity controls suite; separate disposable preference/gameplay saves.

Run: C:/Python314/python.exe -B -m unittest discover -s campaign-unity/Tools/last_stand_controls -p test_menu.py -v
Launches the pinned Editor once, refusing an existing owner. This is not browser/media proof.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "campaign-unity/Unity"
UNITY = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe")
CASES = (
    "test_idle_controls_restore_after_focus_and_visibility",
    "test_scalable_selector_entries",
    "test_locked_tier_preview_preserves_admission",
    "test_unlocked_tier_and_fitting_selection",
    "test_selector_save_failure_restores_environment",
    "test_selector_environment_preflight_preserves_save",
    "test_selector_description_keyboard_scroll",
    "test_failed_deploy_retry_preserves_menu_hold",
    "test_existing_suite_preference_scope",
    "test_existing_suite_pipeline_scope",
    "test_settings_scroll_resets_and_content_contraction",
    "test_preferences_applied_before_deploy", "test_speed_and_independent_pause_holds",
    "test_modal_core_input_and_cancel_focus", "test_abandon_cancel_and_confirm_without_award",
    "test_reset_defaults_preserves_gameplay_and_pause", "test_failed_save_refuses_navigation",
    "test_display_owns_runtime_pipeline_clone", "test_guidance_optout_and_audio_sample_admission",
)
HASH_SCRIPT = """const fs=require('node:fs'),crypto=require('node:crypto');
const files=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))));"""


class MenuControllerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
        folder = ROOT / "campaign-unity/Evidence/last-stand-controls" / stamp
        folder.mkdir(parents=True, exist_ok=False)
        cls.log_path = folder / "unity-controls.log"
        env = os.environ.copy()
        common = Path(env.get("ProgramData", "C:/ProgramData"))
        if not common.is_dir():
            raise RuntimeError("ProgramData unavailable")
        env.setdefault("ProgramData", str(common))
        env.setdefault("ALLUSERSPROFILE", str(common))
        env["ST_LS_PROJECT_CHECK"] = str(PROJECT)
        ownership = subprocess.run(["powershell.exe", "-NoProfile", "-Command",
            "$p=$env:ST_LS_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"],
            env=env, capture_output=True, text=True, timeout=30)
        if ownership.returncode:
            raise RuntimeError("An existing Unity Editor owns this project; refusing a concurrent launch.")
        source_paths = sorted(set((PROJECT / "Assets/Scripts").rglob("*.cs")) |
                              set((PROJECT / "Assets/Editor").rglob("*.cs")) |
                              {PROJECT / "Assets/Scenes/LastStandPrototype.unity"})
        hashes = subprocess.run(["node", "-e", HASH_SCRIPT], input=json.dumps([str(p) for p in source_paths]),
                                capture_output=True, text=True, cwd=ROOT, timeout=30, check=True)
        argv = [str(UNITY), "-batchmode", "-nographics", "-quit", "-projectPath", str(PROJECT),
                "-executeMethod", "LastStandControlsChecks.Run", "-logFile", str(cls.log_path)]
        (folder / "invocation.json").write_text(json.dumps({"argv": argv, "cwd": str(ROOT),
            "source_sha256": json.loads(hashes.stdout), "cases": CASES}, indent=2), encoding="utf-8")
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, encoding="utf-8", errors="replace")
        try:
            stdout, stderr = process.communicate(timeout=600)
        except subprocess.TimeoutExpired:
            process.kill()  # This owned launch only, never another Editor.
            stdout, stderr = process.communicate()
            (folder / "timeout.txt").write_text(stdout + "\n" + stderr, encoding="utf-8")
            raise
        cls.exit_code = process.returncode
        cls.content = cls.log_path.read_text(encoding="utf-8", errors="replace") if cls.log_path.exists() else ""
        after_paths = sorted(set((PROJECT / "Assets/Scripts").rglob("*.cs")) |
                             set((PROJECT / "Assets/Editor").rglob("*.cs")) |
                             {PROJECT / "Assets/Scenes/LastStandPrototype.unity"})
        after = subprocess.run(["node", "-e", HASH_SCRIPT], input=json.dumps([str(p) for p in after_paths]),
                               capture_output=True, text=True, cwd=ROOT, timeout=30, check=True)
        if json.loads(hashes.stdout) != json.loads(after.stdout):
            raise RuntimeError("Controls source changed during the owned Editor launch")
        cls.extra_output = stdout + stderr
        (folder / "result.json").write_text(json.dumps({"exit": cls.exit_code, "stdout": stdout,
            "stderr": stderr, "passed": [name for name in CASES if "ST_LS_CONTROLS_PASS " + name in cls.content]}, indent=2), encoding="utf-8")
        print("Controls imported-scene evidence:", folder, flush=True)

    def test_imported_scene_controls(self):
        self.assertEqual(self.exit_code, 0, self.content[-10000:] + self.extra_output)
        for name in CASES:
            with self.subTest(case=name):
                self.assertIn("ST_LS_CONTROLS_PASS " + name, self.content)
                self.assertNotIn("ST_LS_CONTROLS_FAIL " + name, self.content)
