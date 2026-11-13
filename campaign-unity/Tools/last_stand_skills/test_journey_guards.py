"""Portable CI owner for the actual Skills journey admission guards."""
from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[3]


class SkillsJourneyGuardTests(unittest.TestCase):
    def test_actual_node_skills_journey_guards(self):
        result = subprocess.run(
            ["node", "--test", "--test-reporter=tap", "scripts/ci/lastStandSkillsJourney.test.mjs"],
            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=60)
        diagnostics = result.stdout + result.stderr
        self.assertEqual(result.returncode, 0, diagnostics)
        names = re.findall(r"^ok \d+ - (.+)$", result.stdout, re.MULTILINE)
        self.assertCountEqual(names, [
            "Skills journey admits explicit isolated fixtures and refuses misleading seed shapes",
            "Skills journey requires exactly one eligible copy and one Intel debit",
            "Skills journey binds Q/E/R to actual equipped slot order including passive slots",
            "Skills audio witness accepts one Unity line ending but requires exact cue identity",
            "Skills state witnesses require a fresh action and current durable values across later observations",
        ], diagnostics)
        # Exact real cases also reject Node's empty-file pseudo-test. Require
        # positive completed tests, without skips or an incomplete TAP summary.
        totals = re.findall(r"^# tests (\d+)$", result.stdout, re.MULTILINE)
        self.assertEqual(totals, [str(len(names))], diagnostics)
        self.assertGreater(len(names), 0, diagnostics)
        self.assertRegex(result.stdout, rf"(?m)^# pass {len(names)}$", diagnostics)
        self.assertRegex(result.stdout, r"(?m)^# fail 0$", diagnostics)
        print(result.stdout.strip())


if __name__ == "__main__":
    unittest.main()
