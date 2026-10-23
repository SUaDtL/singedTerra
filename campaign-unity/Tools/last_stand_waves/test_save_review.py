"""Regression for restored quote epochs without changing durable run accounting."""
from pathlib import Path
import unittest
from test_catalogs import execute

SOURCES = [
    "MechanicsShopModel.cs", "LastStandUpgradeCatalog.cs", "LastStandTierCatalog.cs",
    "LastStandProgression.cs", "LastStandStore.cs", "LastStandRunClock.cs",
    "LastStandSpeedPolicy.cs", "EncounterModel.cs", "EncounterProfile.cs",
    "LastStandShopState.cs", "LastStandWaveCatalog.cs", "LastStandRewardCatalog.cs",
    "LastStandSaveJson.cs", "LastStandRunCheckpoint.cs", "LastStandProgressionSave.cs",
    "LastStandLegacySave.cs", "LastStandSelection.cs",
]


class SaveReviewTests(unittest.TestCase):
    def case(self, name):
        output = execute(Path(__file__).with_name("WavesSaveReviewChecks.cs"), SOURCES, name)
        self.assertEqual(output.strip(), "PASS " + name)

    def test_exhausted_restored_epoch_allows_pause_resume(self):
        self.case("lifecycle")

    def test_exhausted_restored_epoch_allows_kill_income(self):
        self.case("income")

    def test_exhausted_restored_epoch_allows_one_purchase(self):
        self.case("purchase")

    def test_exhausted_restored_epoch_allows_terminal_accounting(self):
        self.case("finalize")

    def test_invalid_paid_evidence_and_stale_live_quote_still_fail(self):
        self.case("controls")
