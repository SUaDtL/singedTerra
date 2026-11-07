"""Direct retained-edition and buildcraft profile contracts against production owners."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp

SCRIPTS = TOOLS.parent / "Unity/Assets/Scripts"
HERE = Path(__file__).resolve().parent


class BuildcraftFoundationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="st-buildcraft-")
        cls.exe = Path(cls.folder.name) / "BuildcraftChecks.exe"
        try:
            compile_csharp(cls.exe, complete_sources(SCRIPTS, [SCRIPTS / "LastStandProgression.cs"]) +
                           [HERE / "BuildcraftChecks.cs"])
        except Exception:
            cls.folder.cleanup()
            raise

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def case(self, name):
        run = run_csharp(self.exe, [name, str(HERE / "retained-baseline.json")], timeout_seconds=90)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(run.stdout.strip(), "PASS " + name)

    def test_four_retained_editions_keep_combat_prices_income_and_catalogs(self):
        self.case("retained")

    def test_new_runs_have_a_distinct_buildcraft_edition(self):
        self.case("edition")

    def test_campaign_expands_only_the_buildcraft_edition(self):
        self.case("campaign")

    def test_four_retained_checkpoint_payloads_survive_profile_migration(self):
        self.case("retained-save")

    def test_profile_schema_has_bounded_loadout_and_preset_fields(self):
        self.case("schema")

    def test_two_bay_loadout_validates_and_resumes_both_fittings(self):
        self.case("loadout")

    def test_preset_apply_is_atomic_and_only_affects_future_deployment(self):
        self.case("preset")

    def test_typed_bundles_grant_shared_permanent_entitlements(self):
        self.case("rewards")

    def test_retained_run_clear_and_migration_reconcile_without_duplicate_currency(self):
        self.case("retained-clear")

    def test_unearned_preset_is_rejected_without_overwriting_save(self):
        self.case("malformed")

    def test_retained_receipts_announce_reconciled_fitting_and_tier_unlocks(self):
        self.case("retained-receipt")


if __name__ == "__main__":
    unittest.main()
