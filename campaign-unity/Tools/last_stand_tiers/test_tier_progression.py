"""Exercise tier records against the compiled production transaction owner."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp
from last_stand_source_closure import complete_sources


PROJECT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT / "Unity/Assets/Scripts"

class TierProgressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-tier-progression-")
        cls.executable = Path(cls.output.name) / "TierProgressionChecks.exe"
        sources = [SCRIPTS / name for name in (
            "MechanicsShopModel.cs", "LastStandUpgradeCatalog.cs", "LastStandTierCatalog.cs",
            "LastStandProgression.cs", "LastStandStore.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs",
        )] + [Path(__file__).with_name("TierProgressionChecks.cs")]
        sources = complete_sources(SCRIPTS, sources)
        build = compile_csharp(cls.executable, sources, warnings_as_errors=True, timeout_seconds=60)
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(f"Pinned C# compilation failed:\n{build.stdout}{build.stderr}")

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        run = run_csharp(self.executable, [name], timeout_seconds=30)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(run.stdout.strip(), "PASS " + name)

    def test_terminal_records_unlock_and_recovery(self):
        self.case("terminal")

    def test_tier_migration_strict_schema_and_failure_recovery(self):
        self.case("migration")
