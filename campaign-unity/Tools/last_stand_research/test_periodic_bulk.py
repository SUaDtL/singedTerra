"""Mature bulk play must remain viable without per-kill purchasing."""
import unittest
from measure_periodic_bulk import measure


class PeriodicBulkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = measure()["measurements"]

    def test_fifteen_minute_bulk_cadence_reaches_full_run_with_bounded_actions(self):
        for fitting in ("Launcher", "Repair", "Scattergun"):
            row = next(row for row in self.rows if row["fitting"] == fitting
                       and row["purchaseIntervalRealSeconds"] == 900)
            self.assertEqual(row["completed"], 5000)
            self.assertLessEqual(row["acceptedPurchaseIntents"], 50)
            self.assertGreater(row["purchasedRanks"], row["acceptedPurchaseIntents"] * 10)
            control = next(row for row in self.rows if row["fitting"] == fitting
                           and row["purchaseIntervalRealSeconds"] == 0)
            self.assertLess(control["completed"], 5000,
                            "The measured purchase requirement must remain explicit in endurance fixtures.")

    def test_selected_launcher_endurance_fixture_meets_duration_target(self):
        row = next(row for row in self.rows if row["fitting"] == "Launcher"
                   and row["purchaseIntervalRealSeconds"] == 900)
        self.assertGreaterEqual(row["projectedHoursAt5x"], 10)
        self.assertLessEqual(row["projectedHoursAt5x"], 12)


if __name__ == "__main__":
    unittest.main()
