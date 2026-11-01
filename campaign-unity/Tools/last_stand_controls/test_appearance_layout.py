"""Execute the production Appearance layout without a Unity scene or camera."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp


class AppearanceLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-appearance-layout-")
        cls.executable = Path(cls.output.name) / "AppearanceLayoutChecks.exe"
        root = Path(__file__).resolve().parents[2]
        result = compile_csharp(cls.executable, [root / "Unity/Assets/Scripts/LastStandAppearanceLayout.cs",
                                               Path(__file__).with_name("AppearanceLayoutChecks.cs")],
                                warnings_as_errors=True, timeout_seconds=60)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError(result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = run_csharp(self.executable, [name], timeout_seconds=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_world_preview_and_controls_remain_separate(self):
        self.case("profiles")

    def test_invalid_viewports_refuse(self):
        self.case("invalid")
