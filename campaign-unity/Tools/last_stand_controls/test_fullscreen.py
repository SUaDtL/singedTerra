"""Actual bridge/jslib refusal state checks without launching Unity Editor.

Run: C:/Python314/python.exe -B -m unittest discover -s campaign-unity/Tools/last_stand_controls -p test_fullscreen.py -v
Uses narrow host doubles; real browser permission and rendering remain separate.
"""
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp

PROJECT = Path(__file__).resolve().parents[2]


class FullscreenBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-fullscreen-")
        cls.executable = Path(cls.output.name) / "FullscreenBridgeChecks.exe"
        sources = [PROJECT / "Unity/Assets/Scripts/LastStandBrowserBridge.cs",
                   PROJECT / "Unity/Assets/Scripts/Platform/LastStandPlatform.cs",
                   PROJECT / "Unity/Assets/Scripts/Application/LastStandResearchCoordinator.cs",
                   Path(__file__).with_name("FullscreenBridgeChecks.cs")]
        sources = complete_sources(PROJECT / "Unity/Assets/Scripts", sources)
        result = compile_csharp(cls.executable, sources, warnings_as_errors=True, timeout_seconds=60)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Actual-source compilation failed (not behavioral RED):\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = run_csharp(self.executable, [name], timeout_seconds=30)
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
