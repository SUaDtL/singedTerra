"""All three skills fit beside the existing controls at supported viewports."""
from pathlib import Path
import sys
import tempfile
import unittest
TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_test_runtime import compile_csharp, run_csharp


class SkillLayoutTests(unittest.TestCase):
    def test_three_skills_have_full_targets_and_contained_labels_without_control_overlap(self):
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        with tempfile.TemporaryDirectory(prefix="st-skill-layout-") as folder:
            exe = Path(folder) / "SkillLayoutChecks.exe"
            compile_csharp(exe, [scripts / "LastStandHudLayout.cs", scripts / "LastStandSkillHudLayout.cs",
                                Path(__file__).with_name("SkillLayoutChecks.cs")])
            run = run_csharp(exe, [], timeout_seconds=30)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertEqual(run.stdout.strip(), "PASS geometry")


if __name__ == "__main__": unittest.main()
