"""Real imported Armory UI checks; separate from native input/device acceptance."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "last_stand_ui"))
import unity_check_runner


class ArmoryHudTests(unittest.TestCase):
    def test_imported_build_preview_apply_resume_and_accessibility(self):
        previous = unity_check_runner.EVIDENCE
        unity_check_runner.EVIDENCE = unity_check_runner.ROOT / "campaign-unity/Evidence/last-stand-buildcraft/armory-ui"
        try:
            code, log = unity_check_runner.run_checks("LastStandArmoryChecks.Run", [
                Path(__file__), unity_check_runner.PROJECT / "Assets/Scenes/LastStandPrototype.unity"])
        finally:
            unity_check_runner.EVIDENCE = previous
        self.assertEqual(code, 0, log[-12000:])
        for name in ("locked_bay_preview_cancel_and_saved_bytes", "two_bays_named_presets_atomic_apply_and_resume",
                     "paid_effect_preview_matches_combat_without_changing_retained_run",
                     "unconfirmed_save_and_stale_draft_refuse", "responsive_controls_name_focus_and_scroll",
                     "compact_callouts_require_complete_labels_and_clear_panel_edges"):
            self.assertIn("ST_LS_ARMORY_PASS " + name, log)
