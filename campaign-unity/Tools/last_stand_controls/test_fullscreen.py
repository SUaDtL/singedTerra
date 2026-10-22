"""Actual bridge/jslib refusal state checks without launching Unity Editor.

Run: C:/Python314/python.exe -B -m unittest discover -s campaign-unity/Tools/last_stand_controls -p test_fullscreen.py -v
Uses narrow host doubles; real browser permission and rendering remain separate.
"""
from pathlib import Path
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"


class FullscreenBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-fullscreen-")
        cls.executable = Path(cls.output.name) / "FullscreenBridgeChecks.exe"
        sources = [PROJECT / "Unity/Assets/Scripts/LastStandBrowserBridge.cs", Path(__file__).with_name("FullscreenBridgeChecks.cs")]
        result = subprocess.run([str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{cls.executable}"] + [str(p) for p in sources],
                                capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Actual-source compilation failed (not behavioral RED):\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = subprocess.run([str(MONO), str(self.executable), name], capture_output=True,
                                text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_legacy_refusal_preserves_observed_fullscreen(self):
        self.case("legacy_refusal_preserves_observed_fullscreen")

    def test_exit_refusal_preserves_actual_on_state(self):
        self.case("exit_refusal_preserves_actual_on_state")

    def test_enter_refusal_preserves_actual_off_state(self):
        self.case("enter_refusal_preserves_actual_off_state")

    def test_atomic_refusal_replaces_stale_state(self):
        self.case("atomic_refusal_replaces_stale_state")

    def test_change_event_clears_refusal_and_unsupported_disables(self):
        self.case("change_event_clears_refusal_and_unsupported_disables")

    def test_unknown_callback_does_not_invent_state(self):
        self.case("unknown_callback_does_not_invent_state")

    def test_actual_jslib_notifications(self):
        result = subprocess.run(["node", "--test", str(Path(__file__).with_name("fullscreen_browser.test.mjs"))],
                                capture_output=True, text=True, encoding="utf-8", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
