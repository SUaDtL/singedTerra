"""Compile and execute the real Last Stand progression and storage boundary.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_loop -p test_loop_model.py -v
"""
from pathlib import Path
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
MODEL = PROJECT / "Unity/Assets/Scripts/LastStandProgression.cs"
STORE = PROJECT / "Unity/Assets/Scripts/LastStandStore.cs"
DRIVER = Path(__file__).with_name("Program.cs")


class LastStandModelTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-loop-model-")
        cls.executable = Path(cls.output.name) / "LastStandModelTests.exe"
        build = subprocess.run(
            [str(MONO), str(CSC), "-nologo", f"-out:{cls.executable}",
             str(MODEL), str(STORE), str(DRIVER)],
            capture_output=True, text=True, encoding="utf-8-sig", timeout=60,
        )
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(f"Pinned C# compilation failed:\n{build.stdout}{build.stderr}")

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        run = subprocess.run([str(MONO), str(self.executable), name], capture_output=True,
                             text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        return run.stdout.strip()

    def test_defeat_reward_idempotence(self):
        self.assertEqual(self.case("defeat"), "True,True,True,False,1,0,1")

    def test_non_defeat_no_reward(self):
        self.assertEqual(self.case("excluded"), "True,True,0,False,0,False")

    def test_upgrade_prices_cap_and_next_run(self):
        self.assertEqual(self.case("upgrade"), "20,20,1,30,1,2,40,3,50,False,3,0,False,False,0,0")

    def test_save_shape_and_reload(self):
        self.assertEqual(self.case("reload"), "2,0,1,7,4,True;True;blocked;False,blocked;blocked,blocked")

    def test_storage_failure_retry(self):
        self.assertEqual(self.case("failure"), "False,0,True,True,1,False,1,blocked,False")

    def test_uncertain_write_reconciliation(self):
        self.assertEqual(self.case("uncertain"), "False,0,True,1,False,1,False,True,True,1")
