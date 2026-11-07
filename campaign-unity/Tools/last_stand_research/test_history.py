"""Execute production history code with the existing pinned Mono/Roslyn runtime.

This proves checkpoint arithmetic and bounded summaries, not rendered UI or storage integration.
"""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp

PROJECT = Path(__file__).resolve().parents[2]
SOURCE = PROJECT / "Unity/Assets/Scripts/LastStandRunHistory.cs"
CHECKS = Path(__file__).with_name("HistoryChecks.cs")


def compile_checks(executable, source=SOURCE):
    return compile_csharp(executable, [source, CHECKS], warnings_as_errors=True, timeout_seconds=60)


class HistoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-history-")
        cls.executable = Path(cls.output.name) / "HistoryChecks.exe"
        result = compile_checks(cls.executable)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Actual-source compilation failed:\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = run_csharp(self.executable, [name], timeout_seconds=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_failed_terminal_wave_is_counted(self): self.case("terminal_time")
    def test_checkpoint_copy_and_resume(self): self.case("checkpoint_copy")
    def test_recent_bound_and_finalize_once(self): self.case("bounded_once")
    def test_real_time_median_and_limits(self): self.case("comparison")
    def test_invalid_and_overflow_inputs(self): self.case("validation")
    def test_immutable_snapshots(self): self.case("immutable")

    def test_negative_control_milestone_rate(self):
        original = SOURCE.read_text(encoding="utf-8")
        before = "(RepeatableSalvage + ResearchBonusSalvage) * (3600000.0 / ActiveMilliseconds)"
        self.assertEqual(original.count(before), 1)
        with tempfile.TemporaryDirectory(prefix="st-history-fault-") as folder:
            source = Path(folder) / SOURCE.name
            source.write_text(original.replace(before, "(RepeatableSalvage + ResearchBonusSalvage + MilestoneSalvage) * (3600000.0 / ActiveMilliseconds)"), encoding="utf-8")
            executable = Path(folder) / "HistoryFault.exe"
            result = compile_checks(executable, source)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = run_csharp(executable, ['terminal_time'], timeout_seconds=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("milestone excluded", result.stderr)
