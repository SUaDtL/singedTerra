"""Measured acceptance bands; no claim these policies optimize every build."""
import unittest
from measure_upgrade_economy import measure


class UpgradeBalanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = measure(quick=True)["measurements"]

    def row(self, kind, fitting, policy="mixed", level=500, tier=1):
        return next(row for row in self.rows if row["kind"] == kind and row["fitting"] == fitting
                    and row["policy"] == policy and row["permanentLevel"] == level and row["tier"] == tier)

    def test_mature_farming_target_includes_all_ticks_and_real_effects(self):
        for fitting in ("Launcher", "Repair", "Scattergun"):
            row = self.row("mature-build", fitting)
            self.assertEqual(row["completed"], 5000)
            self.assertGreaterEqual(row["projectedHoursAt5x"], 10)
            self.assertLessEqual(row["projectedHoursAt5x"], 12)
            self.assertGreater(row["permanentInvestment"], row["repeatableSalvage"])
            harder = self.row("mature-build", fitting, tier=2)
            self.assertLess(harder["completed"], row["completed"])
            self.assertGreater(row["repeatableSalvagePerSimulationHour"], harder["repeatableSalvagePerSimulationHour"])

    def test_income_investment_has_a_measured_tradeoff(self):
        for fitting in ("Launcher", "Repair", "Scattergun"):
            fresh_combat = self.row("matched-build", fitting, policy="combat", level=0)
            fresh_income = self.row("matched-build", fitting, policy="income", level=0)
            self.assertGreater(fresh_combat["completed"], fresh_income["completed"],
                               "Putting most early purchases into income trades away immediate survival.")
            for level in (20, 150):
                mixed = self.row("matched-build", fitting, level=level)
                combat = self.row("matched-build", fitting, policy="combat", level=level)
                self.assertEqual(mixed["permanentInvestment"], combat["permanentInvestment"])
                self.assertGreater(mixed["completed"], combat["completed"],
                                   "A measured economy allocation should pay back at established farming depths.")

    def test_permanent_investment_keeps_distinct_farming_stages(self):
        for fitting in ("Launcher", "Repair", "Scattergun"):
            stages = [self.row("matched-build", fitting, level=level)["completed"] for level in (0, 20, 150)]
            stages.append(self.row("mature-build", fitting)["completed"])
            self.assertTrue(all(a < b for a, b in zip(stages, stages[1:])),
                            f"{fitting}: stronger income must not collapse distinct permanent farming stages: {stages}")


if __name__ == "__main__":
    unittest.main()
