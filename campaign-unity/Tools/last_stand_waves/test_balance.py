"""Balance regressions measured against real compiled combat and purchase owners."""
import unittest
from measure_balance import measure, save_report


class BalanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = measure()
        cls.rows = cls.report["measurements"]
        save_report(cls.report)

    def row(self, tier, fitting, level):
        return next(row for row in self.rows if row["kind"] == "build" and row["tier"] == tier and row["fitting"] == fitting and row["permanentLevel"] == level)

    def test_same_build_push_versus_farm_report(self):
        for fitting in ("Launcher", "Repair", "Scattergun"):
            early = self.row(1, fitting, 3)
            self.assertGreater(early["completed"], self.row(1, fitting, 0)["completed"])
            self.assertLess(early["completed"], 300, "A small starting investment must leave an earned path to the next tier.")
            self.assertGreater(early["repeatableSalvagePerMinute"], self.row(2, fitting, 3)["repeatableSalvagePerMinute"], "Unlocking alone must not make the higher tier the best farm.")
            self.assertGreaterEqual(self.row(1, fitting, 20)["completed"], 300)
            established = self.row(1, fitting, 60)
            self.assertGreater(established["repeatableSalvagePerMinute"], self.row(2, fitting, 60)["repeatableSalvagePerMinute"])
            self.assertGreater(self.row(2, fitting, 1000)["repeatableSalvagePerMinute"], self.row(1, fitting, 1000)["repeatableSalvagePerMinute"], "A developed build eventually benefits from the harder tier.")

    def test_two_thousand_wave_income_and_upgrade_depth(self):
        for fitting in ("Launcher", "Repair", "Scattergun"):
            fresh = self.row(1, fitting, 0)
            self.assertGreaterEqual(fresh["completed"], 10)
            self.assertLess(fresh["completed"], 100, "A zero-investment first run cannot saturate the campaign.")
            mature = self.row(1, fitting, 150)
            self.assertGreater(mature["completed"], 2000)
            self.assertGreater(mature["runLevels"], 100)
            self.assertLess(mature["repeatableSalvage"] + mature["firstClearSalvage"], mature["permanentInvestment"], "A mature farm does not instantly repay all permanent development.")
            self.assertEqual(self.row(1, fitting, 500)["completed"], 5001)
            self.assertGreater(self.row(2, fitting, 1000)["completed"], 3000)
            self.assertGreater(self.row(2, fitting, 1000)["completed"], self.row(2, fitting, 500)["completed"])

    def test_full_run_duration_includes_intermission(self):
        full = [self.row(1, fitting, 500) for fitting in ("Launcher", "Repair", "Scattergun")]
        for row in full:
            self.assertEqual(row["completed"], 5001)
            self.assertEqual(row["intermissionTicks"], 50000)
            self.assertGreater(row["ticks"], row["intermissionTicks"])
            self.assertAlmostEqual(row["hoursAtHalfSpeed"], row["futureHoursAt5x"] * 10)
        # Synthetic Tier10 remains a stress probe, not shipped balanced content.
        self.assertEqual(len([row for row in self.rows if row["kind"] == "future-fixture"]), 3)

    def test_earned_progression_advances_without_gifted_levels(self):
        for fitting in ("Launcher", "Repair"):
            trajectory = [row for row in self.rows if row["kind"] == "earned-trajectory" and row["fitting"] == fitting]
            self.assertEqual(trajectory[0]["permanentInvestment"], 0)
            self.assertGreater(trajectory[-1]["completed"], 300)
            self.assertLess(trajectory[-1]["completed"], 2000,
                            "Early earned development should retain several lower-tier farming stages.")
            self.assertGreater(trajectory[-1]["completed"], trajectory[0]["completed"])
            banked = 0
            for row in trajectory:
                self.assertLessEqual(row["permanentInvestment"], banked)
                banked += row["repeatableSalvage"] + row["firstClearSalvage"]
