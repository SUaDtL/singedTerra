"""Execute actual C# Field Console geometry with the pinned Unity Mono toolchain.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_ui -p test_hud_layout.py -v
ST_HUD_LAYOUT_BASELINE=1 executes the unchanged HUD's actual Refresh/Layout with
test-owned Unity scaffolding, solely for pre-implementation behavioral RED.
The ordinary invocation always compiles the production layout projection.
"""
from pathlib import Path
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
cache_dir = Path(__file__).with_name("__pycache__")
cache_file = cache_dir / f"{Path(__file__).stem}.{sys.implementation.cache_tag}.pyc"
cache_file.unlink(missing_ok=True)
if cache_dir.is_dir():
    try:
        cache_dir.rmdir()
    except OSError:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp

PROJECT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
DRIVER = Path(__file__).with_name("HudLayoutChecks.cs")


class HudLayoutTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-hud-layout-")
        cls.executable = Path(cls.output.name) / "HudLayoutChecks.exe"
        baseline = os.environ.get("ST_HUD_LAYOUT_BASELINE") == "1"
        source = SCRIPTS / ("LastStandLoopHud.cs" if baseline else "LastStandHudLayout.cs")
        build = compile_csharp(cls.executable, [source, DRIVER], warnings_as_errors=True, timeout_seconds=60, defines=('ST_HUD_LAYOUT_BASELINE',) if baseline else ())
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(f"Pinned C# compilation failed (not behavioral RED):\n{build.stdout}{build.stderr}")

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        run = run_csharp(self.executable, [name], timeout_seconds=30)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(run.stdout.strip(), "PASS " + name)

    def test_profiles_fit_without_overlap(self):
        self.case("profiles_fit_without_overlap")

    def test_battle_center_and_area_limits(self):
        self.case("battle_center_and_area_limits")

    def test_text_targets_and_long_notice_bounds(self):
        self.case("text_targets_and_long_notice_bounds")
