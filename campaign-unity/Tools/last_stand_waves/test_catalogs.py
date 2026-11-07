"""Execute the production wave/tier/reward catalogs, including authored-data rejection."""
from pathlib import Path
import tempfile
import unittest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import EDITOR, MONO, CSC, compile_csharp, run_csharp

SCRIPTS = Path(__file__).resolve().parents[2] / "Unity/Assets/Scripts"


def execute(source, names, case, *, timeout_seconds=120):
    names = list(names)
    if "LastStandUpgradeCatalog.cs" in names and "LastStandEconomyCatalog.cs" not in names:
        names.append("LastStandEconomyCatalog.cs")
    with tempfile.TemporaryDirectory(prefix="st-waves-") as folder:
        executable = Path(folder) / "Checks.exe"
        compile_csharp(executable, complete_sources(SCRIPTS, [SCRIPTS / name for name in names]) + [source],
                       warnings_as_errors=False, timeout_seconds=60)
        run = run_csharp(executable, [case], timeout_seconds=timeout_seconds)
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
