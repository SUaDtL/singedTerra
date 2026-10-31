"""Compile and exercise the production tier catalog and combat profiles."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp
from last_stand_source_closure import complete_sources


SCRIPTS = Path(__file__).resolve().parents[2] / "Unity/Assets/Scripts"


class TierRulesTests(unittest.TestCase):
    def test_exact_tier_hull_scaling_and_legacy_parity(self):
        with tempfile.TemporaryDirectory(prefix="st-tier-rules-") as folder:
            executable = Path(folder) / "Checks.exe"
            sources = [SCRIPTS / name for name in (
                "EncounterModel.cs", "EncounterProfile.cs", "LastStandTierCatalog.cs"
            )] + [Path(__file__).with_name("TierRulesChecks.cs")]
            sources = complete_sources(SCRIPTS, sources)
            build = compile_csharp(executable, sources, warnings_as_errors=False, timeout_seconds=60)
            self.assertEqual(build.returncode, 0, build.stdout + build.stderr)
            run = run_csharp(executable, [], timeout_seconds=30)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
