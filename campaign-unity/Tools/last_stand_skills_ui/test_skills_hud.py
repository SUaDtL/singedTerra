"""Real imported Skills controls; separate from native input/art acceptance."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "last_stand_ui"))
import unity_check_runner


class SkillsHudTests(unittest.TestCase):
    def test_imported_collection_builds_recovery_and_accessibility(self):
        previous = unity_check_runner.EVIDENCE
        unity_check_runner.EVIDENCE = unity_check_runner.ROOT / "campaign-unity/Evidence/last-stand-skills/ui"
        try:
            code, log = unity_check_runner.run_checks("LastStandSkillsChecks.Run", [
                Path(__file__), unity_check_runner.PROJECT / "Assets/Scenes/LastStandPrototype.unity"])
        finally:
            unity_check_runner.EVIDENCE = previous
        self.assertEqual(code, 0, log[-12000:])
        for name in ("locked_and_complete_pool_refuse_spending",
                     "draw_equip_apply_cancel_and_failed_save_retry",
                     "named_builds_capture_skills_and_cancel_navigation_draft",
                     "help_preserves_garage_only_collection_boundary",
                     "responsive_cards_controls_and_focus",
                     "prepared_build_deploys_and_admits_skills_across_resume",
                     "combat_controls_reenable_after_reconciliation"):
            self.assertIn("ST_LS_SKILLS_UI_PASS " + name, log)


if __name__ == "__main__":
    unittest.main()
