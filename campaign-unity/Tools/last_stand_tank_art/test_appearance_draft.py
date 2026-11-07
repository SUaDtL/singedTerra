"""Exercise the actual cosmetic draft value without Unity or player storage."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp


class AppearanceDraftTests(unittest.TestCase):
    def test_preview_apply_cancel_and_replacement_profile(self):
        scripts = Path(__file__).resolve().parents[2] / "Unity/Assets/Scripts"
        with tempfile.TemporaryDirectory(prefix="st-appearance-draft-") as folder:
            executable = Path(folder) / "AppearanceDraftChecks.exe"
            sources = [scripts / name for name in (
                "Content/LastStandTankAppearance.cs", "Application/LastStandValueDraft.cs", "LastStandAppearanceSession.cs")]
            sources.append(Path(__file__).with_name("AppearanceDraftChecks.cs"))
            result = compile_csharp(executable, sources, warnings_as_errors=True, timeout_seconds=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = run_csharp(executable, [], timeout_seconds=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("PASS appearance draft lifecycle", result.stdout)


if __name__ == "__main__":
    unittest.main()
