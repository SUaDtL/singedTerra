from pathlib import Path
import unittest
from test_catalogs import execute

class LongRunEconomyTests(unittest.TestCase):
    def check_case(self, case):
        execute(Path(__file__).with_name("EconomyChecks.cs"), ["LastStandTierCatalog.cs", "LastStandWaveCatalog.cs", "LastStandRewardCatalog.cs", "LastStandUpgradeCatalog.cs", "MechanicsShopModel.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs"], case)

    def test_existing_investments_preserved(self): self.check_case("legacy")
    def test_long_run_cost_and_effect_bounds(self): self.check_case("bounds")
    def test_lower_tier_farming_remains_viable_after_unlock(self): self.check_case("farm")
