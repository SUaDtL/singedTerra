"""Compile the actual pure choice navigator; no Unity or browser process.

These checks prove bounded catalog browsing, not rendered controls or gameplay admission.
"""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources

PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SOURCE = PROJECT / "Unity/Assets/Scripts/LastStandSelection.cs"
CHECKS = Path(__file__).with_name("SelectionChecks.cs")


def compile_checks(executable, source=SOURCE):
    dependencies = [SOURCE.parent / name for name in (
        "LastStandUpgradeCatalog.cs", "LastStandEconomyCatalog.cs", "MechanicsShopModel.cs", "LastStandTierCatalog.cs",
        "LastStandWaveCatalog.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs")]
    return subprocess.run([str(MONO), str(CSC), "-nologo", "-warnaserror+",
                           f"-out:{executable}", *map(str, complete_sources(SOURCE.parent, [source] + dependencies)), str(CHECKS)],
                          capture_output=True, text=True, encoding="utf-8-sig", timeout=60)


class SelectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-selection-")
        cls.executable = Path(cls.output.name) / "SelectionChecks.exe"
        result = compile_checks(cls.executable)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Actual-source compilation failed; not behavioral RED:\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = subprocess.run([str(MONO), str(self.executable), name], capture_output=True,
                                text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_large_catalog(self):
        self.case("large_catalog")

    def test_locked_preview(self):
        self.case("locked_preview")

    def test_stable_identity(self):
        self.case("stable_identity")

    def test_immutable_capture(self):
        self.case("immutable_capture")

    def test_invalid_catalog(self):
        self.case("invalid_catalog")

    def test_invalid_input(self):
        self.case("invalid_input")

    def test_single_choice(self):
        self.case("single_choice")

    def test_real_fitting_catalog(self):
        self.case("fitting_catalog")

    def assert_fault_detected(self, before, after, case, assertion):
        original = SOURCE.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
        self.assertEqual(original.count(before), 1, "Fault anchor changed; inspect the fixture")
        with tempfile.TemporaryDirectory(prefix="st-selection-fault-") as folder:
            source = Path(folder) / SOURCE.name
            source.write_text(original.replace(before, after), encoding="utf-8")
            executable = Path(folder) / "SelectionFault.exe"
            compiled = compile_checks(executable, source)
            self.assertEqual(compiled.returncode, 0, "Compile failure is not detection:\n" + compiled.stdout + compiled.stderr)
            result = subprocess.run([str(MONO), str(executable), case], capture_output=True,
                                    text=True, encoding="utf-8-sig", timeout=30)
            self.assertNotEqual(result.returncode, 0, "Deliberate fault escaped the behavior check")
            self.assertIn(assertion, result.stderr)

    def test_negative_control_hidden_tiers_are_detected(self):
        self.assert_fault_detected("if (firstLockedPreview && !option.Unlocked) previewBoundary = true;",
                                   "if (firstLockedPreview && option.Unlocked && false) previewBoundary = true;",
                                   "locked_preview", "visibility stops after first locked preview")

    def test_negative_control_locked_commit_is_detected(self):
        self.assert_fault_detected("if (!indices.TryGetValue(selectedId, out int next) || !options[next].Unlocked)",
                                   "if (!indices.TryGetValue(selectedId, out int next))",
                                   "locked_preview", "locked choice cannot become selected")
