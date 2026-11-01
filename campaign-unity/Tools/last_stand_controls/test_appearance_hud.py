"""Imported Appearance UI behavior and geometry; not visual/device acceptance."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "last_stand_ui"))
import unity_check_runner


class AppearanceHudTests(unittest.TestCase):
    def test_imported_appearance_choices_lifecycle_and_accessibility(self):
        previous = unity_check_runner.EVIDENCE
        unity_check_runner.EVIDENCE = unity_check_runner.ROOT / "campaign-unity/Evidence/last-stand-tank/appearance-ui"
        try:
            code, log = unity_check_runner.run_checks("LastStandAppearanceChecks.Run", [
                Path(__file__), unity_check_runner.PROJECT / "Assets/Scenes/LastStandPrototype.unity"])
        finally:
            unity_check_runner.EVIDENCE = previous
        self.assertEqual(code, 0, log[-10000:])
        for name in ("named_choices_preview_and_cancel", "apply_reload_escape_and_exit",
                     "failed_save_and_live_battle_refuse", "responsive_scroll_keyboard_and_text",
                     "visible_tank_fills_preview_without_cropping"):
            self.assertIn("ST_LS_APPEARANCE_PASS " + name, log)
