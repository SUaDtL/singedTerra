"""Actual imported meshes, cameras, UI projection and fitting lifecycle.

The caller must serialize this pinned Editor launch with other Unity work.
These transform checks do not establish rendered art quality or owner acceptance.
"""
from pathlib import Path
import sys
import unittest

UI_TOOLS = Path(__file__).resolve().parents[1] / "last_stand_ui"
sys.path.insert(0, str(UI_TOOLS))
import unity_check_runner

CASES = (
    "both_authored_modules_across_profiles",
    "hero_bounds_fit_and_invalid_or_active_framing_refuses",
    "independent_ui_camera_canvas_scale_and_dpr",
    "resize_same_owner_retains_actual_attachment",
    "inactive_behind_camera_offscreen_and_disabled",
    "actual_menu_and_encounter_lifecycle",
)


class FittingProjectionTests(unittest.TestCase):
    def test_imported_module_projection_and_lifecycle(self):
        source = unity_check_runner.PROJECT / "Assets/Editor/LastStandFittingChecks.cs"
        prior = unity_check_runner.EVIDENCE
        unity_check_runner.EVIDENCE = unity_check_runner.ROOT / "campaign-unity/Evidence/last-stand-fitting"
        try:
            code, log = unity_check_runner.run_checks("LastStandFittingChecks.Run", extra_inputs=[source, Path(__file__)])
        finally:
            unity_check_runner.EVIDENCE = prior
        summary = "\n".join(line for line in log.splitlines() if "ST_LS_FITTING_" in line or "error CS" in line)
        self.assertEqual(code, 0, summary or log[-6000:])
        for case in CASES:
            self.assertIn("ST_LS_FITTING_PASS " + case, log, summary)
            self.assertNotIn("ST_LS_FITTING_FAIL " + case, log, summary)


if __name__ == "__main__":
    unittest.main()
