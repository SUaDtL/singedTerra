r"""Compile the real Unity C# shop model and assert its fixture behavior.

Run: C:\Python314\python.exe -m unittest discover -s campaign-unity/Tools/last_stand_shop -p test_shop.py -v
"""

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
# unittest discovery may write this module's bytecode before its body runs.
# Remove only that generated cache entry so it cannot enter source snapshots.
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
MODEL = PROJECT / "Unity/Assets/Scripts/MechanicsShopModel.cs"
DRIVER = Path(__file__).with_name("Program.cs")


class ShopModelTests(unittest.TestCase):
    def __str__(self):
        # Python 3.14 adds the method twice to the verbose identity. Keep the
        # installed named-result collector's stable module.Class identity.
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-shop-model-")
        cls.executable = Path(cls.output.name) / "ShopModelTests.exe"
        build = subprocess.run(
            [str(MONO), str(CSC), "-nologo", f"-out:{cls.executable}", str(MODEL), str(DRIVER)],
            capture_output=True,
            text=True,
            encoding="utf-8-sig",
            timeout=60,
        )
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(f"Pinned C# compilation failed:\n{build.stdout}{build.stderr}")

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        run = subprocess.run(
            [str(MONO), str(self.executable), name],
            capture_output=True,
            text=True,
            encoding="utf-8-sig",
            timeout=30,
        )
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        return run.stdout.strip()

    def test_current_level_cap(self):
        self.assertEqual(self.case("level"), "5,0;4,1;3,2;rejected")

    def test_next_price_independent_of_persistent(self):
        self.assertEqual(self.case("price"), "0,7;1,11|10,7;11,11")

    def test_cap_refusal(self):
        self.assertEqual(self.case("cap"), "4,1,11;5,0,15;false,5,0,15;0,3,2,7")

    def test_new_run_reset_and_resume(self):
        self.assertEqual(self.case("lifecycle"), "true,1,3,11;true,1,3,11;0,2,7")

    def test_invalid_config(self):
        self.assertEqual(self.case("invalid"),
                         "zero:false;max:false;bounds:rejected;price:rejected;terminal:overflow,uncalled")
