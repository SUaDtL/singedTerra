"""Pinned imported presentation checks, with no player storage or native input."""
from pathlib import Path
import unittest

import unity_check_runner


class CombatFeedbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        prior = unity_check_runner.EVIDENCE
        unity_check_runner.EVIDENCE = unity_check_runner.ROOT / "campaign-unity/Evidence/first-session-polish"
        try:
            # The shared runner binds every production and Editor C# source,
            # including the shared geometry owner and both new module types.
            cls.exit_code, cls.log = unity_check_runner.run_checks(
                "LastStandCombatFeedbackChecks.Run", extra_inputs=[Path(__file__),
                unity_check_runner.PROJECT / "Assets/Scenes/LastStandPrototype.unity",
                unity_check_runner.PROJECT / "ProjectSettings/ProjectSettings.asset"])
        finally:
            unity_check_runner.EVIDENCE = prior

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
    def test_current_geometry_and_retained_position(self): self.check_case(self._testMethodName)
    def test_campaign_weapon_feedback(self): self.check_case(self._testMethodName)
    def test_role_silhouettes_and_persistent_warning(self): self.check_case(self._testMethodName)


if __name__ == "__main__":
    unittest.main()
