"""Behavioral tests of the production clock, session and unchanged combat model.

Run: C:/Python314/python.exe -B -m unittest discover -s campaign-unity/Tools/last_stand_controls -p test_speed.py -v
No Unity Editor or graphics process is launched. Presentation-only scaffolding
lets the actual session own all simulation calls.
"""
from pathlib import Path
import sys
import os
import subprocess
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources


PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SCRIPTS = PROJECT / "Unity/Assets/Scripts"


class SpeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-speed-")
        cls.executable = Path(cls.output.name) / "SpeedChecks.exe"
        names = ["EncounterModel.cs", "EncounterProfile.cs", "LastStandTierCatalog.cs",
                 "LastStandRunClock.cs", "EncounterSession.cs", "LastStandUpgradeCatalog.cs",
                 "LastStandShopState.cs", "MechanicsShopModel.cs"]
        if (SCRIPTS / "LastStandSpeedPolicy.cs").exists():
            names.append("LastStandSpeedPolicy.cs")
        sources = [SCRIPTS / name for name in names]
        fault = os.environ.get("ST_SPEED_FAULT")
        if fault:
            faults = {
                "unscaled-admission": ("LastStandRunClock.cs", "elapsed * LastPositiveSpeed", "elapsed"),
                "resume-releases-menu": ("LastStandRunClock.cs", "ManualPaused = false;", "ManualPaused = false; MenuPaused = false;"),
                "terminal-mixed-units": ("EncounterSession.cs", "timestamp - runClock.LastStepTimestamp", "runClock.PendingSeconds"),
            }
            if fault not in faults:
                raise AssertionError("Unknown closed fault fixture")
            name, before, after = faults[fault]
            actual = SCRIPTS / name
            value = actual.read_text(encoding="utf-8")
            if value.count(before) != 1:
                raise AssertionError("Fault fixture must match exactly once")
            temporary = Path(cls.output.name) / name
            temporary.write_text(value.replace(before, after), encoding="utf-8")
            sources[sources.index(actual)] = temporary
        sources.append(Path(__file__).with_name("SpeedChecks.cs"))
        sources = complete_sources(SCRIPTS, sources)
        argv = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{cls.executable}"]
        build = subprocess.run(argv + [str(path) for path in sources], capture_output=True,
                               text=True, encoding="utf-8-sig", timeout=60)
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError("Compilation failed, not behavioral RED:\n" + build.stdout + build.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = subprocess.run([str(MONO), str(self.executable), name], capture_output=True,
                                text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_cue_callback_lifetime(self):
        self.case("cue_callback_lifetime")

    def test_half_speed_weighted_combat_parity(self):
        self.case("half_speed_weighted_combat_parity")

    def test_rate_boundary_fraction_and_retained_debt(self):
        self.case("rate_boundary_fraction_and_retained_debt")

    def test_pause_holds_resume_and_plus_from_zero(self):
        self.case("pause_holds_resume_and_plus_from_zero")

    def test_production_cap_and_invalid_rates(self):
        self.case("production_cap_and_invalid_rates")

    def test_future_policy_fixture_and_horizon(self):
        self.case("future_policy_fixture_and_horizon")

    def test_earned_cap_preserves_debt_pause_and_preference(self):
        self.case("earned_cap_preserves_debt_pause_and_preference")

    def test_save_hold_during_clock_action(self):
        self.case("save_hold_during_clock_action")

    def test_terminal_settling_uses_wall_seconds(self):
        self.case("terminal_settling_uses_wall_seconds")

    def test_focus_background_and_legacy_preserved(self):
        self.case("focus_background_and_legacy_preserved")
