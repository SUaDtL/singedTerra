"""Run the production atomic progression owner under the pinned Unity Mono runtime."""
from pathlib import Path
import tempfile
import unittest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp

SCRIPTS = Path(__file__).resolve().parents[2] / "Unity/Assets/Scripts"


class CheckpointStoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-wave-save-")
        cls.executable = Path(cls.output.name) / "CheckpointChecks.exe"
        names = ["MechanicsShopModel.cs", "LastStandUpgradeCatalog.cs", "LastStandTierCatalog.cs",
                 "LastStandProgression.cs", "LastStandStore.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs", "EncounterModel.cs", "EncounterProfile.cs",
                 "LastStandShopState.cs", "LastStandWaveCatalog.cs", "LastStandRewardCatalog.cs",
                 "EncounterCheckpoint.cs", "LastStandShopCheckpoint.cs", "LastStandSaveJson.cs",
                 "LastStandRunCheckpoint.cs", "LastStandProgressionSave.cs", "LastStandLegacySave.cs", "LastStandSelection.cs"]
        sources = [SCRIPTS / name for name in names if (SCRIPTS / name).exists()]
        sources.append(Path(__file__).with_name("CheckpointStoreChecks.cs"))
        sources=complete_sources(SCRIPTS,sources)
        build = compile_csharp(cls.executable, sources, warnings_as_errors=True, timeout_seconds=60)
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(build.stdout + build.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        run = run_csharp(self.executable, [name], timeout_seconds=60)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(run.stdout.strip(), "PASS " + name)

    def test_starting_checkpoint_survives_reload(self):
        self.case("starting")

    def test_legacy_migration_preserves_pending_claim_once(self):
        self.case("migration")

    def test_checkpoint_rewards_commit_once_under_write_faults(self):
        self.case("faults")

    def test_midwave_purchase_and_cost_roll_back_together(self):
        self.case("rollback")

    def test_first_clear_rewards_and_unlocks_across_runs(self):
        self.case("milestones")

    def test_future_or_conflicting_save_preserves_original_bytes(self):
        self.case("invalid")

    def test_mutual_death_banks_and_finalizes_atomically(self):
        self.case("mutual")

    def test_permanent_purchases_preserve_active_deployment_stats(self):
        self.case("frozen")

    def test_five_thousand_wave_save_restore_and_bounded_size(self):
        self.case("late")
