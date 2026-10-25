"""Actual player-build scene admission with unsaved negative preview scenes."""
from pathlib import Path
import sys
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS / "last_stand_ui"))
from unity_check_runner import PROJECT, run_checks


class ContentValidationTests(unittest.TestCase):
    def test_build_hook_refuses_missing_and_duplicate_scene_bindings(self):
        scene = PROJECT / "Assets/Scenes/LastStandPrototype.unity"
        before = scene.read_bytes()
        code, log = run_checks("LastStandContentValidationChecks.Run", [
            Path(__file__), scene,
            PROJECT / "Assets/Editor/LastStandContentValidationChecks.cs",
        ])
        self.assertEqual(scene.read_bytes(), before, "Preview mutations changed the saved player scene")
        self.assertEqual(code, 0, log[-12000:])
        self.assertNotIn("ST_CONTENT_VALIDATION_CHECK_FAIL", log)
        for case in ("missing_composition_root", "duplicate_composition_root", "missing_battlefield",
                     "missing_tier_environment", "missing_environment_root", "missing_scene_light"):
            with self.subTest(case=case):
                self.assertIn("ST_CONTENT_VALIDATION_CHECK_PASS " + case, log)
