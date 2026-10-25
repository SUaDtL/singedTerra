"""Production research/history codec roundtrips inside the real partial owner."""
from pathlib import Path
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"


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
        args = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{cls.exe}"]
        result = subprocess.run(args + [str(SCRIPTS / p) for p in names] + [str(Path(__file__).with_name("ResearchSaveChecks.cs"))],
                                capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Compilation failed, not behavioral RED:\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls): cls.output.cleanup()

    def check(self, case):
        result = subprocess.run([str(MONO), str(self.exe), case], capture_output=True, text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + case)

    def test_research_roundtrip_and_next_completion(self): self.check("research")
    def test_malformed_research_rejected(self): self.check("invalid_research")
    def test_twenty_recent_history_and_large_counters_roundtrip(self): self.check("history")
    def test_malformed_history_rejected(self): self.check("invalid_history")
