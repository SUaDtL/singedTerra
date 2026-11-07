"""Compile and execute the real Last Stand progression and storage boundary.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_loop -p test_loop_model.py -v
"""
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp
from last_stand_source_closure import complete_sources

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
MODEL = PROJECT / "Unity/Assets/Scripts/LastStandProgression.cs"
STORE = PROJECT / "Unity/Assets/Scripts/LastStandStore.cs"
CATALOG = PROJECT / "Unity/Assets/Scripts/LastStandUpgradeCatalog.cs"
TRACK = PROJECT / "Unity/Assets/Scripts/MechanicsShopModel.cs"
DRIVER = Path(__file__).with_name("Program.cs")


class LastStandModelTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-loop-model-")
        cls.executable = Path(cls.output.name) / "LastStandModelTests.exe"
        build = compile_csharp(cls.executable, complete_sources(MODEL.parent, [MODEL, STORE, CATALOG, TRACK, DRIVER]), warnings_as_errors=False, timeout_seconds=60)
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(f"Pinned C# compilation failed:\n{build.stdout}{build.stderr}")

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        run = run_csharp(self.executable, [name], timeout_seconds=30)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        return run.stdout.strip()

    def test_defeat_reward_idempotence(self):
        self.assertEqual(self.case("defeat"), "PASS defeat")

    def test_non_defeat_no_reward(self):
        self.assertEqual(self.case("excluded"), "PASS excluded")

    def test_upgrade_prices_cap_and_next_run(self):
        self.assertEqual(self.case("upgrade"), "PASS upgrade")

    def test_save_shape_and_reload(self):
        self.assertEqual(self.case("reload"), "PASS reload")

    def test_storage_failure_retry(self):
        self.assertEqual(self.case("failure"), "PASS failure")

    def test_uncertain_write_reconciliation(self):
        self.assertEqual(self.case("uncertain"), "PASS uncertain")
