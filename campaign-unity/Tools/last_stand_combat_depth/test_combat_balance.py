"""Independent accounting/calendar oracles for actual production-owner measurements."""
from pathlib import Path
import json
import copy
import tempfile
import unittest
from measure_combat_balance import PROJECT, sources, hashes, compile_csharp, run_csharp, validate_report


class CombatBalanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="st-combat-balance-checks-")
        cls.exe = Path(cls.temp.name) / "Checks.exe"
        cls.paths = sources()
        cls.before = hashes(cls.paths)
        compile_csharp(cls.exe, cls.paths, warnings_as_errors=True)
        print("SOURCE_BINDING " + json.dumps(cls.before, sort_keys=True), flush=True)

    @classmethod
    def tearDownClass(cls):
        try:
            if hashes(cls.paths) != cls.before:
                raise AssertionError("Production inputs changed during checks")
        finally:
            cls.temp.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, ["check", name], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_reject_free_currency_research_and_first_clear_double_count(self): self.case("conservation")
    def test_single_max_purchase_uses_real_time_without_catchup_replay(self): self.case("cadence")
    def test_actual_wave_transactions_and_repeat_deployments_conserve_earned_currency(self): self.case("actual-waves")
    def test_equal_investment_matchup_tradeoffs(self): self.case("equal-budget")
    def test_research_cost_and_real_calendar_gate_speed(self): self.case("research-calendar")
    def test_early_income_cannot_cap_long_term_tracks(self): self.case("early-cap")
    def test_lower_tier_farming_rate_excludes_first_clear(self): self.case("farm-rate")
    def test_large_measurement_report_preserves_complete_nested_records(self): self.case("report-stream")
    def test_production_spawn_and_reward_baselines_are_not_accelerated(self): self.case("production-baselines")
    def test_changed_speed_time_bins_match_per_observation_history(self): self.case("time-bins")
    def test_actual_milestone_award_is_not_repeatable_farm_income(self): self.case("milestone-repeat")
    def test_role_effects_bind_actual_continuous_model_hits_and_unique_kills(self): self.case("role-events")
    def test_supplemental_equal_budget_policy_pays_actual_auxiliary_tracks(self): self.case("split-investment")
    def test_confirmed_active_checkpoint_fork_abandons_without_new_rewards(self): self.case("active-fork")

    def test_report_rejects_missing_cells_foreign_profiles_and_extra_purchases(self):
        report = json.loads((PROJECT / "docs/last-stand-combat-depth/combat-balance-calibrated-report.json").read_text())
        validate_report(report)
        for mutate in (
            lambda r: r["matrix"].pop(),
            lambda r: r["matrix"][0].update(parentProfileSha256="0" * 64),
            lambda r: next(x for x in r["matrix"] if x["outcome"] != "unavailable" and x["policy"] == "max900").update(purchaseIntents=999999),
            lambda r: next(x for x in r["matrix"] if x["outcome"] != "unavailable").update(firstClearSalvage=999999),
        ):
            damaged = copy.deepcopy(report)
            mutate(damaged)
            with self.assertRaises(ValueError):
                validate_report(damaged)
