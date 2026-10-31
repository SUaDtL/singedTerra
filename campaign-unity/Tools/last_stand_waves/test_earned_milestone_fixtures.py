"""Production-earned fixture provenance and next-wave unlock checks, not browser proof."""
from copy import deepcopy
import hashlib
import json
import subprocess
from pathlib import Path
import tempfile
import unittest

from generate_earned_milestone_fixtures import generate, write, REPO


class EarnedMilestoneFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = generate()
        print("ST_LS_MILESTONE_GENERATOR_EVIDENCE=" + json.dumps({
            "sourceSha256": cls.report["sourceSha256"], "commands": cls.report["commands"],
            "commandWorkingDirectory": cls.report["commandWorkingDirectory"],
            "cases": [{key: item[key] for key in ("fitting", "targetWave", "trajectoryRun", "totalPermanentPurchases",
                       "totalPermanentSpend", "totalEarnedSalvage", "permanentLevels")} for item in cls.report["cases"]]
        }), flush=True)

    def test_all_four_setups_precede_the_first_actual_unlock(self):
        for case in self.report["cases"]:
            with self.subTest(fitting=case["fitting"], wave=case["targetWave"]):
                before, after = json.loads(case["save"]), json.loads(case["expectedSave"])
                target = case["targetWave"]
                self.assertEqual(before["version"], 6)
                self.assertEqual(after["version"], 6)
                self.assertEqual(before["checkpoint"]["encounter"]["completedWave"], target - 1)
                self.assertEqual(after["checkpoint"]["encounter"]["completedWave"], target)
                self.assertEqual(after["checkpoint"]["runId"], before["checkpoint"]["runId"])
                self.assertEqual(after["credits"] - before["credits"], case["expectedRepeatable"] + case["expectedFirstClear"])
                self.assertNotIn(f"tier-1:wave-{target}", before["firstClears"])
                self.assertIn(f"tier-1:wave-{target}", after["firstClears"])
                self.assertGreater(case["nextWaveTicks"], 0)
                self.assertEqual(case["expectedFinalTick"] - case["startingTick"], case["nextWaveTicks"])
                self.assertGreater(case["expectedRemainingHull"], 0)
                self.assertEqual(before["checkpoint"]["shop"]["runPurchases"], after["checkpoint"]["shop"]["runPurchases"])
                if target == 100:
                    self.assertNotIn("scattergun", before["unlockedFittings"])
                    self.assertIn("scattergun", after["unlockedFittings"])
                    self.assertEqual(case["expectedUnlockFitting"], "scattergun")
                    self.assertEqual(case["expectedUnlockTier"], 0)
                else:
                    self.assertFalse(before["tierRecords"]["tier-2"]["unlocked"])
                    self.assertTrue(after["tierRecords"]["tier-2"]["unlocked"])
                    self.assertEqual(case["expectedUnlockTier"], 2)
                    self.assertIsNone(case["expectedUnlockFitting"])

    def test_permanent_investment_is_funded_by_naturally_completed_prior_runs(self):
        for fitting in ("repair", "launcher"):
            trajectory = [row for row in self.report["trajectories"] if row["fitting"] == fitting]
            self.assertEqual(trajectory[0]["openingWallet"], 0)
            self.assertTrue(all(level == 0 for level in trajectory[0]["permanentLevels"].values()))
            self.assertEqual(trajectory[0]["status"], "Defeated")
            for case in (row for row in self.report["cases"] if row["fitting"] == fitting):
                self.assertEqual(sum(case["permanentLevels"].values()), case["totalPermanentPurchases"])
                # A currently balanced trajectory may reach an early milestone
                # before buying permanent ranks. Paid ranks still require an
                # exact positive debit funded by prior natural runs below.
                if case["totalPermanentPurchases"]:
                    self.assertGreater(case["totalPermanentSpend"], 0)
                else:
                    self.assertEqual(case["totalPermanentSpend"], 0)
                prior_runs = [row for row in trajectory if row["run"] < case["trajectoryRun"]]
                self.assertTrue(all(row["status"] == "Defeated" for row in prior_runs))
                earned_before_deployment = sum(row["closingWallet"] - row["openingWallet"] for row in prior_runs)
                self.assertLessEqual(case["totalPermanentSpend"], earned_before_deployment,
                                     "Permanent investment must be funded before the fixture run starts.")
                before = json.loads(case["save"])
                self.assertEqual(before["credits"], case["totalEarnedSalvage"] - case["totalPermanentSpend"])
                self.assertEqual(before["checkpoint"]["shop"]["spentScrap"], case["runPurchaseSpend"])

    def test_every_compiled_production_and_generator_source_is_bound(self):
        for path, digest in self.report["sourceSha256"].items():
            self.assertEqual(hashlib.sha256((REPO / path).read_bytes()).hexdigest(), digest)
        self.assertIn("campaign-unity/Unity/Assets/Scripts/LastStandProgressionSave.cs", self.report["sourceSha256"])
        self.assertIn("campaign-unity/Unity/Assets/Scripts/LastStandProgressionBackup.cs", self.report["sourceSha256"])
        self.assertIn("campaign-unity/Tools/last_stand_waves/EarnedMilestoneFixtures.cs", self.report["sourceSha256"])
        self.assertIn("campaign-unity/Tools/last_stand_test_runtime.py", self.report["sourceSha256"])
        self.assertEqual(len(self.report["commands"]), 2)
        self.assertIn("-warnaserror+", self.report["commands"][0])

    def test_current_generated_manifest_is_admitted_by_actual_browser_reader(self):
        with tempfile.TemporaryDirectory(prefix="st-earned-browser-admission-") as folder:
            manifest = write(deepcopy(self.report), Path(folder) / "fixtures")
            script = """
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MILESTONE_FIXTURE_SOURCES,admitMilestoneFixtures} from './scripts/last-stand-wave-milestones.mjs';
const path=process.argv[1],manifest=JSON.parse(readFileSync(path));
assert.deepEqual(Object.keys(manifest.sourceSha256).sort(),[...MILESTONE_FIXTURE_SOURCES].sort());
admitMilestoneFixtures(manifest,path);
console.log(JSON.stringify({inputs:MILESTONE_FIXTURE_SOURCES.length,cases:manifest.cases.length}));
"""
            result = subprocess.run(["node", "--input-type=module", "-e", script, str(manifest)],
                                    cwd=REPO, text=True, capture_output=True, encoding="utf-8", timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(json.loads(result.stdout), {"inputs": 34, "cases": 4})

    def test_saved_bytes_are_exact_and_existing_output_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory(prefix="st-earned-fixture-test-") as folder:
            output = Path(folder) / "fresh"
            report = deepcopy(self.report)
            manifest = write(report, output)
            self.assertTrue(manifest.is_file())
            for original, case in zip(self.report["cases"], report["cases"]):
                for raw_key, path_key, hash_key in (("save", "savePath", "saveSha256"), ("expectedSave", "expectedSavePath", "expectedSaveSha256")):
                    raw = Path(case[path_key]).read_bytes()
                    self.assertEqual(raw, original[raw_key].encode("utf-8"))
                    self.assertEqual(hashlib.sha256(raw).hexdigest(), case[hash_key])
            with self.assertRaises(FileExistsError):
                write(deepcopy(self.report), output)
