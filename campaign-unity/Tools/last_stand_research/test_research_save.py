"""Production research/history codec roundtrips inside the real partial owner."""
from pathlib import Path
import sys
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT / "Tools"))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp
SCRIPTS = PROJECT / "Unity/Assets/Scripts"



class ResearchSaveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-research-save-")
        cls.exe = Path(cls.output.name) / "ResearchSaveChecks.exe"
        names = ["LastStandResearchCatalog.cs", "LastStandResearchClock.cs", "LastStandResearchState.cs",
                 "LastStandProgressionResearchSave.cs", "LastStandRunHistory.cs", "LastStandProgression.cs",
                 "LastStandProgressionSave.cs", "LastStandLegacySave.cs", "LastStandSaveJson.cs", "LastStandStore.cs",
                 "LastStandRunCheckpoint.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs", "LastStandSelection.cs",
                 "LastStandTierCatalog.cs", "LastStandWaveCatalog.cs", "LastStandRewardCatalog.cs", "EncounterModel.cs",
                 "EncounterProfile.cs", "LastStandShopState.cs", "LastStandUpgradeCatalog.cs", "LastStandEconomyCatalog.cs",
                 "MechanicsShopModel.cs"]
        # The profile transaction partial is added by the integrating owner.
        if (SCRIPTS / "LastStandProgressionResearch.cs").exists():
            names.append("LastStandProgressionResearch.cs")
        try:
            cls.build = compile_csharp(cls.exe, complete_sources(SCRIPTS, [SCRIPTS / p for p in names]) +
                [Path(__file__).with_name("ResearchSaveChecks.cs")])
        except Exception:
            cls.output.cleanup()
            raise


    @classmethod
    def tearDownClass(cls): cls.output.cleanup()

    def check(self, case):
        result = run_csharp(self.exe, [case], timeout_seconds=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + case)

    def test_research_roundtrip_and_next_completion(self): self.check("research")
    def test_malformed_research_rejected(self): self.check("invalid_research")
    def test_twenty_recent_history_and_large_counters_roundtrip(self): self.check("history")
    def test_malformed_history_rejected(self): self.check("invalid_history")
