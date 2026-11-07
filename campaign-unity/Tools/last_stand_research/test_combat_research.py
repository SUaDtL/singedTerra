"""Combat research extends the production paid-time owner and save transaction."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class CombatResearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="st-combat-research-")
        cls.exe = Path(cls.folder.name) / "CombatResearchChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        sources = complete_sources(scripts, [scripts / "LastStandProgressionPlanner.cs",
            scripts / "Application/LastStandResearchCoordinator.cs"])
        compile_csharp(cls.exe, [*sources, Path(__file__).with_name("CombatResearchChecks.cs")])

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name], timeout_seconds=45)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_earned_tracks_three_labs_and_six_prepaid_completions(self):
        self.case("entitlements")

    def test_legacy_two_lab_paid_work_migrates_losslessly(self):
        self.case("migration")

    def test_lab_planner_quotes_share_cost_effects_and_applicability(self):
        self.case("quotes")

    def test_completion_keeps_active_snapshot_and_updates_next_deployment(self):
        self.case("deployment")
