"""Exercise tier records against the compiled production transaction owner."""
from pathlib import Path
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SCRIPTS = PROJECT / "Unity/Assets/Scripts"

class TierProgressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-tier-progression-")
        cls.executable = Path(cls.output.name) / "TierProgressionChecks.exe"
        sources = [SCRIPTS / name for name in (
            "MechanicsShopModel.cs", "LastStandUpgradeCatalog.cs", "LastStandTierCatalog.cs",
            "LastStandProgression.cs", "LastStandStore.cs",
        )] + [Path(__file__).with_name("TierProgressionChecks.cs")]
        build = subprocess.run([str(MONO), str(CSC), "-nologo", "-warnaserror+",
            f"-out:{cls.executable}", *map(str, sources)], capture_output=True,
            text=True, encoding="utf-8-sig", timeout=60)
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
        self.assertEqual(run.stdout.strip(), "PASS " + name)

    def test_terminal_records_unlock_and_recovery(self):
        self.case("terminal")

    def test_tier_migration_strict_schema_and_failure_recovery(self):
        self.case("migration")
