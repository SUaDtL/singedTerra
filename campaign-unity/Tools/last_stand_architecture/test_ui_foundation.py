"""Imported Unity proof for a neutral consumer of the shared UI foundation."""
from pathlib import Path
import sys
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS / "last_stand_ui"))
from unity_check_runner import PROJECT, run_checks


class SharedUiFoundationTests(unittest.TestCase):
    def test_shared_modal_lifecycle_focus_and_scroll(self):
        exit_code, content = run_checks("LastStandUiFoundationChecks.Run", [
            PROJECT / "Assets/Editor/LastStandUiFoundationChecks.cs", Path(__file__),
        ])
        self.assertEqual(exit_code, 0, content[-12000:])
        self.assertIn("ST_LS_UI_FOUNDATION_PASS shared_modal_lifecycle_focus_and_scroll", content)
        self.assertNotIn("ST_LS_UI_FOUNDATION_FAIL", content)
