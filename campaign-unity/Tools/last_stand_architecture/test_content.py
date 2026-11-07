"""Exercise authored additions through real selectors, wave rules and research state."""
from pathlib import Path
import sys
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS / "last_stand_waves"))
from test_catalogs import execute

SOURCES = ["LastStandResearchCatalog.cs", "Content/LastStandResearchDefinitions.cs",
           "Content/LastStandContentManifest.cs", "LastStandResearchState.cs",
           "LastStandResearchClock.cs", "LastStandResearchPresentation.cs",
           "LastStandTierCatalog.cs", "LastStandWaveCatalog.cs", "LastStandSelection.cs"]


class ContentTests(unittest.TestCase):
    def case(self, name):
        execute(Path(__file__).with_name("ContentChecks.cs"), SOURCES, name)

    def test_content_extension_reaches_runtime_without_scattered_counts(self):
        self.case("extension")

    def test_content_identity_and_reference_errors_fail_before_build(self):
        self.case("invalid")

    def test_legacy_content_identity_survives_catalog_extension(self):
        self.case("legacy")
