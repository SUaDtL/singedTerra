from pathlib import Path
import unittest
from test_catalogs import execute


class FittingCatalogTests(unittest.TestCase):
    def test_explicit_identity_and_milestone_availability(self):
        execute(Path(__file__).with_name("FittingCatalogChecks.cs"), [
            "LastStandSelection.cs", "LastStandUpgradeCatalog.cs", "LastStandTierCatalog.cs",
            "LastStandWaveCatalog.cs", "MechanicsShopModel.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs"], "catalog")
