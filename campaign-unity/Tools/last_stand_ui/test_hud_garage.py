"""Behavioral oracles over the actual imported Unity Canvas, buttons and owners."""
import unittest
from unity_check_runner import run_checks


class HudGarageTests(unittest.TestCase):
    def __str__(self):
        return f"{self._testMethodName} (test_hud_garage.HudGarageTests)"

    @classmethod
    def setUpClass(cls):
        cls.exit_code, cls.log = run_checks("LastStandHudChecks.RunGarage")

    def check_case(self, name):
        summary = "\n".join(line for line in self.log.splitlines() if "ST_LS_HUD_" in line or "error CS" in line)
        self.assertTrue("ST_LS_HUD_PASS " + name in self.log, summary or self.log[-3000:])
        self.assertNotIn("ST_LS_HUD_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, self.log[-16000:])

    def test_live_values_and_fitting(self):
        self.check_case(self._testMethodName)

    def test_deploy_readiness_and_primary_hierarchy(self):
        self.check_case(self._testMethodName)

    def test_garage_profile_geometry_and_contrast(self):
        self.check_case(self._testMethodName)


if __name__ == "__main__":
    unittest.main()
