"""Actual imported-scene consumers in reverse Unity Start order."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "last_stand_ui"))
import unity_check_runner


class StartupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        previous = unity_check_runner.EVIDENCE
        unity_check_runner.EVIDENCE = unity_check_runner.ROOT / "campaign-unity/Evidence/waves-startup"
        try:
            cls.code, cls.log = unity_check_runner.run_checks("LastStandStartupChecks.Run", [
                unity_check_runner.PROJECT / "Assets/Editor/LastStandStartupChecks.cs",
                unity_check_runner.PROJECT / "Assets/Editor/LastStandTestPreferencesScope.cs",
                unity_check_runner.PROJECT / "Assets/Scenes/LastStandPrototype.unity", Path(__file__)])
        finally:
            unity_check_runner.EVIDENCE = previous

    def case(self, name):
        self.assertEqual(self.code, 0, self.log[-7000:])
        self.assertIn("ST_LS_STARTUP_PASS " + name, self.log)

    def test_fresh_hud_before_tank_start(self): self.case(self._testMethodName)
    def test_saved_fitting_survives_late_start(self): self.case(self._testMethodName)
    def test_all_fittings_before_start_are_idempotent(self): self.case(self._testMethodName)
