"""Imported scene/controller checks with explicit artificial clock scope."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "last_stand_ui"))
import unity_check_runner


class WaveIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        previous = unity_check_runner.EVIDENCE
        unity_check_runner.EVIDENCE = unity_check_runner.ROOT / "campaign-unity/Evidence/waves-integration"
        try:
            cls.code, cls.log = unity_check_runner.run_checks("LastStandWaveChecks.Run", [
                unity_check_runner.PROJECT / "Assets/Editor/LastStandWaveChecks.cs",
                unity_check_runner.PROJECT / "Assets/Editor/LastStandTestPreferencesScope.cs",
                unity_check_runner.PROJECT / "Assets/Scenes/LastStandPrototype.unity", Path(__file__)])
        finally:
            unity_check_runner.EVIDENCE = previous

    def case(self, name):
        self.assertEqual(self.code, 0, self.log[-7000:])
        self.assertIn("ST_LS_WAVE_PASS " + name, self.log)

    def test_clear_retry_resume_boundary(self): self.case(self._testMethodName)
    def test_navigation_cancel_and_durable_abandon(self): self.case(self._testMethodName)
    def test_terminal_uncertainty_and_no_payout(self): self.case(self._testMethodName)
    def test_confirmed_receipts_survive_retry_and_terminal(self): self.case(self._testMethodName)
    def test_simultaneous_clear_death_receipt_and_retry(self): self.case(self._testMethodName)
