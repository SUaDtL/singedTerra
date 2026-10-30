"""Read-only planner projections against real progression, shop and research owners."""
from pathlib import Path
import sys
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT / "Tools"))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class ProgressionPlannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-progression-planner-")
        cls.exe = Path(cls.output.name) / "ProgressionPlannerChecks.exe"
        scripts = PROJECT / "Unity/Assets/Scripts"
        names = ["LastStandProgressionPlanner.cs", "LastStandProgression.cs",
                 "LastStandShopPresentation.cs", "LastStandResearchPresentation.cs"]
        try:
            compile_csharp(cls.exe, complete_sources(scripts, [scripts / p for p in names]) +
                           [Path(__file__).with_name("ProgressionPlannerChecks.cs")], warnings_as_errors=True)
        except Exception:
            cls.output.cleanup()
            raise

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def check(self, case):
        result = run_csharp(self.exe, [case], timeout_seconds=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + case)

    def test_catalog_goal_provenance_and_no_mutation(self): self.check("catalog")
    def test_exact_shared_budget_effects_and_shortfall(self): self.check("budget")
    def test_fixed_pin_completion_clear_and_missing_catalog(self): self.check("pin")
    def test_active_queued_and_suspended_research_funding(self): self.check("funded")
    def test_caps_fitting_save_failure_and_active_checkpoint(self): self.check("restrictions")
    def test_completed_and_unsupported_research_snapshot(self): self.check("completed")
