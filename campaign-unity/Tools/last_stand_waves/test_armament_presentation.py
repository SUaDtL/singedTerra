"""Imported module, model-driven feedback and projected callout; not pixel/audio acceptance."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "last_stand_ui"))
import unity_check_runner


class ArmamentPresentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        previous = unity_check_runner.EVIDENCE
        unity_check_runner.EVIDENCE = unity_check_runner.ROOT / "campaign-unity/Evidence/waves-armament"
        try:
            cls.code, cls.log = unity_check_runner.run_checks("LastStandArmamentChecks.Run", [
                unity_check_runner.PROJECT / "Assets/Editor/LastStandArmamentChecks.cs",
                unity_check_runner.PROJECT / "Assets/Editor/LastStandTestPreferencesScope.cs",
                unity_check_runner.PROJECT / "Assets/Scenes/LastStandPrototype.unity", Path(__file__)])
        finally:
            unity_check_runner.EVIDENCE = previous

    def check_case(self, name):
        self.assertEqual(self.code, 0, self.log[-7000:])
        self.assertIn("ST_LS_ARMAMENT_PASS " + name, self.log)

    def test_explicit_module_identity(self): self.check_case(self._testMethodName)
    def test_scattergun_outgoing_feedback_and_reduced_effects(self): self.check_case(self._testMethodName)
    def test_scattergun_callout_uses_actual_module(self): self.check_case(self._testMethodName)
