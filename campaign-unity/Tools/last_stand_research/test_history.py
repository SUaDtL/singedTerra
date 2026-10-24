"""Execute production history code with the existing pinned Mono/Roslyn runtime.

This proves checkpoint arithmetic and bounded summaries, not rendered UI or storage integration.
"""
from pathlib import Path
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SOURCE = PROJECT / "Unity/Assets/Scripts/LastStandRunHistory.cs"
CHECKS = Path(__file__).with_name("HistoryChecks.cs")


def compile_checks(executable, source=SOURCE):
    return subprocess.run([str(MONO), str(CSC), "-nologo", "-warnaserror+",
                           f"-out:{executable}", str(source), str(CHECKS)],
                          capture_output=True, text=True, encoding="utf-8-sig", timeout=60)


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
        result = subprocess.run([str(MONO), str(self.executable), name], capture_output=True,
                                text=True, encoding="utf-8-sig", timeout=30)
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
            result = subprocess.run([str(MONO), str(executable), "terminal_time"], capture_output=True,
                                    text=True, encoding="utf-8-sig", timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("milestone excluded", result.stderr)
