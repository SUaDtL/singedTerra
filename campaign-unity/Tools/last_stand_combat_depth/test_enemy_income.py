"""Actual model kills and durable ledger checks; synthetic cohorts are not earned play."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class EnemyIncomeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="st-enemy-income-")
        cls.exe = Path(cls.temp.name) / "EnemyIncomeChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        cls.build = compile_csharp(cls.exe, complete_sources(scripts, [scripts / "LastStandProgression.cs"]) +
                                  [Path(__file__).with_name("EnemyIncomeChecks.cs")], warnings_as_errors=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_enemy_values_keep_exactly_once_checkpoint_accounting(self): self.case("order")
    def test_high_wave_projection_has_no_wallet_sized_overflow(self): self.case("high")
    def test_bounded_cohort_prefix_matches_independent_authored_values(self): self.case("prefix")
    def test_empty_mask_still_requires_matching_edition(self): self.case("empty")
    def test_foreign_replayed_or_overflowing_observation_changes_nothing(self): self.case("admission")
    def test_atomic_boundary_faults_retry_and_reopen_exactly_once(self): self.case("faults")
    def test_typed_checkpoint_tampering_preserves_original_bytes(self): self.case("tamper")
    def test_legacy_tier_two_controller_path_retains_original_income(self): self.case("legacy")
