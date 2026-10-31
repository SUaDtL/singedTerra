"""Actual campaign transactions; gifted fixture strength is not earned-player proof."""
from pathlib import Path
import sys
import tempfile
import unittest
TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp
class CampaignTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="st-campaign-")
        cls.exe = Path(cls.temp.name) / "CampaignChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        cls.sources = complete_sources(scripts, [scripts / n for n in ("LastStandProgression.cs", "LastStandTierHudText.cs", "LastStandGuidance.cs", "Content/LastStandContentManifest.cs")])
        compile_csharp(cls.exe, cls.sources + [Path(__file__).with_name("CampaignChecks.cs")], warnings_as_errors=True)
    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()
    def case(self, name):
        result = run_csharp(self.exe, [name], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)
    def test_tier_unlock_does_not_promote_active_run(self): self.case("sequential")
    def test_only_first_locked_tier_visible(self): self.case("preview")
    def test_milestone_unlock_and_receipt_exactly_once(self): self.case("atomic")
    def test_compact_goal_names_actual_bonus_and_unlock(self): self.case("discovery")
    def test_manual_roadmap_is_shared_readonly_and_retains_run_edition(self): self.case("manual")
    def test_each_fitting_receipt_waits_for_the_actual_saved_milestone(self): self.case("fittings")
