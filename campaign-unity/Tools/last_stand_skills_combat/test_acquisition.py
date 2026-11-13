"""Fresh earned acquisition plus independent rejection of falsified evidence."""
import copy
from pathlib import Path
import tempfile
import unittest

from measure_acquisition import measure, validate_report
from last_stand_provenance import hash_bytes
import measure_acquisition
import measure_balance
import prove_skill_guards


class SkillAcquisitionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory(prefix="st-acquisition-test-") as folder:
            output = Path(folder) / "acquisition.json"
            cls.report = measure(output)
            cls.report_bytes = output.read_bytes()

    def test_fresh_transactions_earn_all_five_milestones_and_bounded_collection(self):
        validate_report(self.report)
        self.assertEqual([r["wave"] for r in self.report["milestones"] if r["outcome"] == "earned"], [25, 50, 100, 300, 500])
        self.assertEqual([r["state"]["slots"] for r in self.report["milestones"]], [1, 1, 2, 2, 3])
        self.assertEqual(self.report["earnedIntel"], len(self.report["draws"]) + self.report["finalState"]["skillIntel"])
        self.assertGreater(len({r["skill"] for r in self.report["draws"]}), 1)
        self.assertEqual(self.report["closedMilliseconds"], 0)
        self.assertTrue(all("_profileJson" not in row for row in self.report["milestones"]))
        self.assertEqual(set(self.report["sourceSha256"]), set(self.report["sourceLfSha256"]))
        self.assertEqual(self.report["sourceLfNormalization"], "CRLF-and-CR-to-LF; all other bytes preserved")
        self.assertNotIn(b"\r\n", self.report_bytes)
        self.assertTrue(self.report_bytes.endswith(b"\n"))
        # The same source from LF/CRLF checkouts retains one portable identity,
        # while actual byte hashes remain distinct. Preserve BOM/non-ASCII bytes.
        lf = b"\xef\xbb\xbf// caf\xc3\xa9\nclass A {}\n"
        crlf = lf.replace(b"\n", b"\r\n")
        expected = hash_bytes([lf])[0]
        self.assertNotEqual(hash_bytes([crlf])[0], expected)
        for owner in (measure_acquisition, measure_balance, prove_skill_guards):
            self.assertEqual(owner.SOURCE_LF_NORMALIZATION, self.report["sourceLfNormalization"])
            for checkout in (lf, crlf, lf.replace(b"\n", b"\r")):
                self.assertEqual(owner.lf_sha256(checkout), expected)

    def test_validator_rejects_gifts_rerolls_false_unlocks_and_unfunded_progress(self):
        for mutation in ("profile", "reward", "pool", "reroll", "copies", "slots", "milestone", "funding", "time"):
            with self.subTest(mutation=mutation):
                report = copy.deepcopy(self.report)
                if mutation == "profile":
                    report["originProfileJson"] = report["finalProfileJson"]
                    report["originProfileSha256"] = report["finalProfileSha256"]
                elif mutation == "reward":
                    report["runs"][0]["intelEarned"] += 1
                elif mutation == "pool":
                    report["draws"][0]["pool"].append("minefield")
                elif mutation == "reroll":
                    report["draws"][0]["selectedIndex"] ^= 1
                elif mutation == "copies":
                    report["draws"][0]["copiesAfter"][0] += 1
                elif mutation == "slots":
                    report["milestones"][0]["state"]["slots"] = 3
                elif mutation == "milestone":
                    report["milestones"][0]["state"]["copies"][0] = 6
                elif mutation == "funding":
                    report["runs"][0]["walletAfterRun"] += 100
                else:
                    report["activeMilliseconds"] -= 50
                with self.assertRaises(ValueError):
                    validate_report(report)


if __name__ == "__main__":
    unittest.main()
