"""Actual imported-scene chrome geometry and interaction; not rendered acceptance."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "last_stand_ui"))
import unity_check_runner


class SharedChromeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        previous = unity_check_runner.EVIDENCE
        unity_check_runner.EVIDENCE = unity_check_runner.ROOT / "campaign-unity/Evidence/waves-chrome"
        try:
            cls.code, cls.log = unity_check_runner.run_checks("LastStandLoopChecks.RunChromeChecks", [
                unity_check_runner.PROJECT / "Assets/Editor/LastStandLoopChecks.cs",
                unity_check_runner.PROJECT / "Assets/Editor/LastStandTestPreferencesScope.cs",
                unity_check_runner.PROJECT / "Assets/Scenes/LastStandPrototype.unity", Path(__file__)])
        finally:
            unity_check_runner.EVIDENCE = previous

    def check_case(self, name):
        self.assertEqual(self.code, 0, self.log[-7000:])
        self.assertIn("ST_LS_CHROME_PASS " + name, self.log)

    def test_backing_and_frame_share_clipped_outline(self): self.check_case(self._testMethodName)
    def test_all_menu_consumers_use_shared_chrome(self): self.check_case(self._testMethodName)
    def test_focus_and_hit_targets_preserved(self): self.check_case(self._testMethodName)
