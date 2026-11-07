"""Independent admission of actual earned buildcraft measurement output."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from measure_buildcraft_balance import sources, validate_report
from last_stand_test_runtime import compile_csharp, run_csharp


class BuildcraftBalanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="st-buildcraft-balance-test-")
        cls.exe = Path(cls.folder.name) / "Balance.exe"
        compile_csharp(cls.exe, sources(), defines=("BUILDCRAFT_BALANCE",))
        result = run_csharp(cls.exe, ["quick"], timeout_seconds=90)
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)
        cls.report = json.loads(result.stdout)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def test_fresh_earned_measurement_keeps_unavailable_pairs_and_currency_truthful(self):
        validate_report(self.report)
        self.assertEqual(len(self.report["matrix"]), 168)
        self.assertFalse(self.report["frontier"]["passes"])
        self.assertGreater(self.report["seed"]["grossSalvage"], 0)
        self.assertEqual(self.report["seed"]["equipmentBays"], 1)
        self.assertTrue(all(row["outcome"] == "unavailable" for row in self.report["matrix"] if "+" in row["fitting"]))

    def test_report_rejects_gifted_currency_omitted_pairs_and_false_frontier(self):
        for mutation in ("currency", "pair", "frontier", "seed"):
            with self.subTest(mutation=mutation):
                report = copy.deepcopy(self.report)
                if mutation == "currency":
                    report["seed"]["wallet"] += 1
                elif mutation == "pair":
                    report["matrix"].pop()
                elif mutation == "frontier":
                    report["frontier"]["passes"] = True
                else:
                    report["matrix"][0]["parentProfileSha256"] = "0" * 64
                with self.assertRaises(ValueError):
                    validate_report(report)


if __name__ == "__main__":
    unittest.main()
