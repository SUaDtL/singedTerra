"""Imported renderer resources are omitted only during Web export, then restored."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from unity_check_runner import PROJECT, run_checks


class WebRendererResourcesTests(unittest.TestCase):
    def test_scene_and_resources_renderers_restore_after_success_and_failure(self):
        code, log = run_checks("LastStandWebRendererChecks.Run", [Path(__file__),
            PROJECT / "Assets/Materials/ArtRenderer.asset",
            PROJECT / "Assets/Resources/ArtDirection/ConceptRenderer.asset"])
        self.assertEqual(code, 0, log[-10000:])
        self.assertIn("ST_LS_WEB_RENDERER_PASS scene_and_resources_normal_and_failure_restore", log)


if __name__ == "__main__":
    unittest.main()
