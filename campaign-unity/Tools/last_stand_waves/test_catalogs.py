"""Execute the production wave/tier/reward catalogs, including authored-data rejection."""
from pathlib import Path
import subprocess
import tempfile
import unittest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources

SCRIPTS = Path(__file__).resolve().parents[2] / "Unity/Assets/Scripts"
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"


def execute(source, names, case, *, timeout_seconds=120):
    names = list(names)
    if "LastStandUpgradeCatalog.cs" in names and "LastStandEconomyCatalog.cs" not in names:
        names.append("LastStandEconomyCatalog.cs")
    with tempfile.TemporaryDirectory(prefix="st-waves-") as folder:
        executable = Path(folder) / "Checks.exe"
        build = subprocess.run([str(MONO), str(CSC), "-nologo", f"-out:{executable}",
                                *map(str,complete_sources(SCRIPTS,[SCRIPTS / name for name in names])), str(source)],
                               capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
        if build.returncode:
            raise AssertionError(build.stdout + build.stderr)
        run = subprocess.run([str(MONO), str(executable), case], capture_output=True, text=True,
                             encoding="utf-8-sig", timeout=timeout_seconds)
        if run.returncode:
            raise AssertionError(run.stdout + run.stderr)
        return run.stdout


class CatalogTests(unittest.TestCase):
    def check_case(self, case):
        execute(Path(__file__).with_name("CatalogChecks.cs"),
                ["LastStandTierCatalog.cs", "LastStandWaveCatalog.cs", "LastStandRewardCatalog.cs"], case)

    def test_finite_rosters_and_stable_reward_ids(self):
        self.check_case("rosters")

    def test_eighteen_tiers_use_bounded_selection_and_keyed_records(self):
        self.check_case("expansion")

    def test_invalid_catalogs_are_rejected(self):
        self.check_case("invalid")

    def test_generator_scales_beyond_two_thousand_waves(self):
        self.check_case("depth")
