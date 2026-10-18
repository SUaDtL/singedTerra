"""Compile and execute the actual pure clock and unchanged encounter model.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_ui -p test_background_clock.py -v
ST_CLOCK_BASELINE=1 explicitly selects the existing EncounterSession scheduling
for pre-implementation RED, with test-only Unity/view scaffolding in the driver.
The ordinary invocation always compiles LastStandRunClock itself.
"""
from pathlib import Path
import os
import subprocess
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

PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
DRIVER = Path(__file__).with_name("BackgroundClockChecks.cs")


class BackgroundClockTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-background-clock-")
        cls.executable = Path(cls.output.name) / "BackgroundClockChecks.exe"
        baseline = os.environ.get("ST_CLOCK_BASELINE") == "1"
        sources = [SCRIPTS / "EncounterModel.cs", SCRIPTS / "EncounterProfile.cs", SCRIPTS / "LastStandTierCatalog.cs", DRIVER]
        sources.append(SCRIPTS / ("EncounterSession.cs" if baseline else "LastStandRunClock.cs"))
        command = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{cls.executable}"]
        if baseline:
            command.append("-define:ST_CLOCK_BASELINE")
        command.extend(str(path) for path in sources)
        build = subprocess.run(command, capture_output=True, text=True,
                               encoding="utf-8-sig", timeout=60)
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(f"Pinned C# compilation failed (not behavioral RED):\n{build.stdout}{build.stderr}")

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        run = subprocess.run([str(MONO), str(self.executable), name], capture_output=True,
                             text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(run.stdout.strip(), "PASS " + name)

    def test_clock_partition_equivalence(self):
        self.case("clock_partition_equivalence")

    def test_fractional_carry_and_duplicate_callbacks(self):
        self.case("fractional_carry_and_duplicate_callbacks")

    def test_budget_retains_debt(self):
        self.case("budget_retains_debt")

    def test_pause_excludes_elapsed_time(self):
        self.case("pause_excludes_elapsed_time")

    def test_invalid_clock_is_rejected(self):
        self.case("invalid_clock_is_rejected")
