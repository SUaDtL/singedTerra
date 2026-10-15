"""T-07: actual Unity outcome/workshop/save-recovery Canvas and owner checks.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_ui -p test_hud_outcomes.py -v
"""
from pathlib import Path
import unittest
import unity_check_runner


class HudOutcomeTests(unittest.TestCase):
    def __str__(self):
        return f"{self._testMethodName} (test_hud_outcomes.HudOutcomeTests)"

    @classmethod
    def setUpClass(cls):
        # Only this task's ordinary evidence destination changes. The imported
        # shared runner, root/project/tool binding and earlier evidence stay intact.
        unity_check_runner.EVIDENCE = Path(
            r"C:\Users\brenn\codearbiter-review-integration-20261006\ui-t07-author-20261008")
        cls.exit_code, cls.log = unity_check_runner.run_checks("LastStandHudChecks.RunOutcomes")

    def check_case(self, name):
        summary = "\n".join(line for line in self.log.splitlines()
                            if "ST_LS_HUD_" in line or "error CS" in line)
        self.assertTrue("ST_LS_HUD_PASS " + name in self.log, summary or self.log[-3000:])
        self.assertNotIn("ST_LS_HUD_FAIL " + name, self.log)
        self.assertEqual(self.exit_code, 0, summary or self.log[-3000:])

    def test_settling_pending_and_claim_states(self):
        self.check_case(self._testMethodName)

    def test_workshop_purchase_cap_and_redeploy_gates(self):
        self.check_case(self._testMethodName)

    def test_storage_errors_retry_and_profile_readability(self):
        self.check_case(self._testMethodName)


if __name__ == "__main__":
    unittest.main()
