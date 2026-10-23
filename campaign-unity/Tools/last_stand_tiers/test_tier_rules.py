"""Compile and exercise the production tier catalog and combat profiles."""
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources


SCRIPTS = Path(__file__).resolve().parents[2] / "Unity/Assets/Scripts"
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"


class TierRulesTests(unittest.TestCase):
    def test_exact_tier_hull_scaling_and_legacy_parity(self):
        with tempfile.TemporaryDirectory(prefix="st-tier-rules-") as folder:
            executable = Path(folder) / "Checks.exe"
            sources = [SCRIPTS / name for name in (
                "EncounterModel.cs", "EncounterProfile.cs", "LastStandTierCatalog.cs"
            )] + [Path(__file__).with_name("TierRulesChecks.cs")]
            sources = complete_sources(SCRIPTS, sources)
            build = subprocess.run([str(MONO), str(CSC), "-nologo", f"-out:{executable}", *map(str, sources)],
                                   capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
            self.assertEqual(build.returncode, 0, build.stdout + build.stderr)
            run = subprocess.run([str(MONO), str(executable)], capture_output=True, text=True,
                                 encoding="utf-8-sig", timeout=30)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
