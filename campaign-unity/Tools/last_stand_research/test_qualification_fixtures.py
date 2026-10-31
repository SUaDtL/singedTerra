from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from generate_qualification_fixtures import generate, write, REPO


class QualificationFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.utc = 1792800000000
        cls.report = generate(utc_ms=cls.utc)

    def test_default_generation_honors_explicit_toolchain(self):
        with tempfile.TemporaryDirectory(prefix="st-missing-tool-") as directory:
            missing = str(Path(directory) / "unavailable-mono")
            with patch.dict("os.environ", {"ST_CSHARP_MONO": missing}):
                with self.assertRaisesRegex(RuntimeError, "C# tool is unavailable"):
                    generate(utc_ms=self.utc)

    def test_explicit_editor_is_not_replaced_by_discovery(self):
        with tempfile.TemporaryDirectory(prefix="st-missing-editor-") as directory:
            with self.assertRaisesRegex(RuntimeError, "C# tool is unavailable"):
                generate(editor=Path(directory), utc_ms=self.utc)

    def test_mature_ranks_funding_and_deployment_seed(self):
        case = next(item for item in self.report["cases"] if item["id"] == "mature-5x")
        saved = json.loads(case["save"])
        self.assertEqual(saved["version"], 6)
        self.assertEqual(case["permanentLevelSeed"], 500)
        self.assertEqual(saved["permanentLevels"]["mortarAttack"], 500)
        self.assertEqual(saved["permanentLevels"]["railgunAttack"], 500)
        self.assertIsNone(saved["checkpoint"])
        self.assertEqual(saved["credits"], case["giftedSalvage"] - case["researchFundingSpent"])
        self.assertEqual(case["completedRanks"], [8, 25, 25, 25])
        self.assertEqual(case["requestedSpeed"], 5)
        self.assertEqual(case["createdUtcMilliseconds"], self.utc)
        self.assertEqual(saved["tierRecords"]["tier-1"]["bestWave"], 100)
        self.assertFalse(saved["tierRecords"]["tier-2"]["unlocked"])
        self.assertGreater(case["syntheticResearchElapsedMilliseconds"], 0)

    def test_lab_funded_active_and_queue_near_actual_completion(self):
        case = next(item for item in self.report["cases"] if item["id"] == "lab-near-completion")
        self.assertEqual(case["remainingMilliseconds"], 2000)
        self.assertEqual((case["activeRank"], case["queuedRank"]), (1, 2))
        self.assertEqual(case["wallet"], 920)
        self.assertNotEqual(case["activeIdentity"], case["queuedIdentity"])
        self.assertEqual(case["createdUtcMilliseconds"], self.utc)
        self.assertIsNone(json.loads(case["save"])["checkpoint"])

    def test_bound_sources_relative_paths_and_exact_saved_bytes(self):
        for path, digest in self.report["sourceSha256"].items():
            self.assertEqual(hashlib.sha256((REPO / path).read_bytes()).hexdigest(), digest)
        with tempfile.TemporaryDirectory(prefix="st-qualification-test-") as directory:
            target = Path(directory) / "fresh"
            report = deepcopy(self.report)
            write(report, target)
            for before, after in zip(self.report["cases"], report["cases"]):
                self.assertFalse(Path(after["savePath"]).is_absolute())
                raw = (target / after["savePath"]).read_bytes()
                self.assertEqual(raw, before["save"].encode("utf-8"))
                self.assertEqual(hashlib.sha256(raw).hexdigest(), after["saveSha256"])
            with self.assertRaises(FileExistsError):
                write(deepcopy(self.report), target)


if __name__ == "__main__":
    unittest.main()
