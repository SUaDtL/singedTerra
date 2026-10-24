"""Behavior regressions compile the production C# economy and purchase owners."""
from pathlib import Path
import sys
import unittest

DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY.parent / "last_stand_waves"))
from test_catalogs import execute, SCRIPTS

NAMES = ["LastStandTierCatalog.cs", "LastStandWaveCatalog.cs", "LastStandRewardCatalog.cs",
         "LastStandUpgradeCatalog.cs", "MechanicsShopModel.cs", "LastStandShopState.cs",
         "LastStandRunClock.cs", "LastStandSpeedPolicy.cs"]


class UpgradeEconomyTests(unittest.TestCase):
    def case(self, name):
        sources = NAMES + [p.name for p in SCRIPTS.glob("LastStandEconomy*.cs")]
        self.assertEqual(execute(DIRECTORY / "EconomyProgressionChecks.cs", sources, name).strip(), "PASS " + name)

    def test_no_track_maxes_from_first_pass_wave_300_budget(self):
        self.case("onboarding")

    def test_late_wave_base_income_outgrows_flat_scrap_ceiling(self):
        self.case("income")

    def test_legacy_prices_roster_and_prospective_research_income_restore(self):
        self.case("legacy")

    def test_fractional_income_research_epochs_and_checkpoint_rollback(self):
        self.case("fraction")

    def test_bounded_income_prefix_matches_individual_production_wave_events(self):
        self.case("prefix")

    def test_permanent_starting_benefit_and_matched_build_scrap_savings(self):
        self.case("value")

    def test_bulk_quotes_are_exact_partial_affordable_and_cap_bounded(self):
        self.case("bulk-quotes")

    def test_bulk_intent_commits_once_rejects_stale_and_restores_paid_levels(self):
        self.case("bulk-ledger")

    def test_pinned_run_cards_and_bulk_effects_match_actual_combat(self):
        self.assertEqual(execute(DIRECTORY / "EconomyProjectionChecks.cs",
                                 ["LastStandShopPresentation.cs", "EncounterModel.cs"], "projection").strip(),
                         "PASS projection")


if __name__ == "__main__":
    unittest.main()
