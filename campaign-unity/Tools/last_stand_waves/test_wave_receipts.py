from pathlib import Path
import unittest
from test_catalogs import execute


class WaveReceiptTests(unittest.TestCase):
    def case(self, name):
        output = execute(Path(__file__).with_name("WaveReceiptChecks.cs"), [
            "LastStandHudLayout.cs", "LastStandTierHudText.cs", "LastStandTierCatalog.cs",
            "LastStandRewardCatalog.cs", "LastStandWaveCatalog.cs"], name)
        self.assertEqual(output.strip(), "PASS " + name)

    def test_receipt_leaves_controls_and_battlefield_clear(self):
        self.case("layout")

    def test_receipt_names_actual_reward_and_unlock(self):
        self.case("text")

    def test_open_shop_keeps_receipt_and_core_instruments_visible(self):
        self.case("shop")
