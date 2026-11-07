r"""Compile the real Unity C# shop model and assert its fixture behavior.

Run: C:\Python314\python.exe -m unittest discover -s campaign-unity/Tools/last_stand_shop -p test_shop.py -v
"""

from pathlib import Path
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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp

PROJECT = Path(__file__).resolve().parents[2]
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
        build = compile_csharp(cls.executable, [MODEL, DRIVER], warnings_as_errors=False, timeout_seconds=60)
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
