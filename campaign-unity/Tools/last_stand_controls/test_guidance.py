"""Exercise actual optional guidance and navigation admission policies.

Run: C:/Python314/python.exe -B -m unittest discover -s campaign-unity/Tools/last_stand_controls -p test_guidance.py -v
Controller receipt admission and browser navigation require their integration checks.
"""
from pathlib import Path
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
SOURCE_NAMES = ("LastStandGuidance.cs", "LastStandUpgradeCatalog.cs", "MechanicsShopModel.cs",
                "LastStandRunClock.cs", "LastStandSpeedPolicy.cs")


def compile_checks(executable, overrides=None):
    overrides = overrides or {}
    sources = [overrides.get(name, SCRIPTS / name) for name in SOURCE_NAMES]
    sources.append(Path(__file__).with_name("GuidanceChecks.cs"))
    command = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{executable}"]
    command += [str(path) for path in sources]
    return subprocess.run(command, capture_output=True, text=True, encoding="utf-8-sig", timeout=60)


class GuidanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-guidance-")
        cls.executable = Path(cls.output.name) / "GuidanceChecks.exe"
        result = compile_checks(cls.executable)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Actual-source C# compilation failed:\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = subprocess.run([str(MONO), str(self.executable), name], capture_output=True,
                                text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_guidance_opt_outs_dismiss_independently(self):
        self.case("guidance_opt_outs_dismiss_independently")

    def test_confirmed_first_cannon_only(self):
        self.case("confirmed_first_cannon_only")

    def test_dismiss_and_new_session_do_not_recreate_suggestion(self):
        self.case("dismiss_and_new_session_do_not_recreate_suggestion")

    def test_explicit_help_survives_opt_out(self):
        self.case("explicit_help_survives_opt_out")

    def test_navigation_requires_ready_noncatchup(self):
        self.case("navigation_requires_ready_noncatchup")

    def test_navigation_confirmation_tracks_active_run(self):
        self.case("navigation_confirmation_tracks_active_run")

    def test_fault_navigation_without_confirmed_save_is_detected(self):
        source = SCRIPTS / "LastStandGuidance.cs"
        original_bytes = source.read_bytes()
        original = original_bytes.decode("utf-8-sig").replace("\r\n", "\n")
        before = 'saveState == "ready" && !catchingUp'
        self.assertEqual(original.count(before), 1, "Fault fixture anchor changed; review the fixture")
        with tempfile.TemporaryDirectory(prefix="st-navigation-fault-") as folder:
            mutant = Path(folder) / source.name
            mutant.write_text(original.replace(before, "!catchingUp", 1), encoding="utf-8")
            executable = Path(folder) / "NavigationFault.exe"
            result = compile_checks(executable, {source.name: mutant})
            self.assertEqual(result.returncode, 0, "Fault fixture must compile:\n" + result.stdout + result.stderr)
            case = "navigation_requires_ready_noncatchup"
            result = subprocess.run([str(MONO), str(executable), case], capture_output=True,
                                    text=True, encoding="utf-8-sig", timeout=30)
            self.assertNotEqual(result.returncode, 0, "Navigation fault escaped behavioral detection")
            self.assertIn("unconfirmed save must remain: save-error", result.stderr, result.stdout + result.stderr)
            self.assertNotIn("PASS " + case, result.stdout)
        self.assertEqual(source.read_bytes(), original_bytes, "Production source changed during fault check")
