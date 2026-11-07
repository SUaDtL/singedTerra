from pathlib import Path
import unittest
from test_catalogs import execute

MODEL_SOURCES=["EncounterModel.cs", "EncounterProfile.cs", "LastStandTierCatalog.cs", "LastStandWaveCatalog.cs", "LastStandRewardCatalog.cs", "LastStandUpgradeCatalog.cs", "MechanicsShopModel.cs", "LastStandShopState.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs"]

class WaveModelTests(unittest.TestCase):
    def check_case(self,case): execute(Path(__file__).with_name("WaveModelChecks.cs"),MODEL_SOURCES,case)
    def test_unspawned_or_live_enemy_prevents_clear(self): self.check_case("cohort")
    def test_pause_and_speed_preserve_wave_outcomes(self): self.check_case("determinism")
    def test_long_run_has_bounded_state(self): self.check_case("long")
    def test_simultaneous_last_kill_and_defeat(self): self.check_case("mutual")
    def test_two_thousand_wave_checkpoint_and_numeric_bounds(self): self.check_case("2000")
    def test_five_thousand_wave_restore_and_bounded_state(self): self.check_case("5000")
    def test_shop_checkpoint_does_not_replay_kill_income_or_refill_hull(self): self.check_case("shop")
    def test_midwave_and_inconsistent_checkpoints_are_rejected(self): self.check_case("invalid")
    def test_scattergun_hits_distinct_targets_without_repair(self): self.check_case("scatter")
    def test_authored_eighteen_tiers_resolve_and_restore_without_fallback(self): self.check_case("tier-resolver")
