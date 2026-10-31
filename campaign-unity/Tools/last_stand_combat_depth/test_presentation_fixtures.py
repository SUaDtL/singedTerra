"""Declared development fixtures; simulated cohorts are not player acceptance."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from generate_presentation_fixtures import generate, write, REPO, LEGACY


class PresentationFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = generate(utc_ms=1793232000000)

    def case(self, identity):
        return next(row for row in self.report["cases"] if row["id"] == identity)

    def test_roster_unlocks_follow_continuous_actual_transactions(self):
        case = self.case("roster-ready")
        saved = json.loads(case["save"])
        self.assertEqual(saved["version"], 6)
        self.assertIsNone(saved["checkpoint"])
        self.assertIsNone(saved["pendingDefeat"])
        self.assertEqual(case["unlockedTiers"], [1, 2, 3, 4])
        self.assertEqual(case["unlockedFittings"], ["repair", "launcher", "scattergun", "mortar", "railgun"])
        self.assertEqual([(run["tier"], run["completedWave"]) for run in case["simulatedRuns"]], [(1, 500), (2, 300), (3, 300)])
        for run in case["simulatedRuns"]:
            self.assertEqual(run["committedBoundaries"], run["completedWave"])
            self.assertGreater(run["simulatedTicks"], 0)
            self.assertGreater(run["kills"], 0)
            self.assertEqual(saved["tierRecords"]["tier-" + str(run["tier"])]["bestWave"], run["completedWave"])
        self.assertTrue(case["productionReloadValidated"])
        self.assertEqual(case["validatedDeploymentCombinations"], 20)
        self.assertEqual(case["giftedPermanentLevels"], saved["permanentLevels"])
        self.assertEqual(saved["research"]["lastObservedUtcMilliseconds"], case["createdUtcMilliseconds"])

    def test_elite_fixture_is_a_real_wave49_boundary_with_disclosed_strength(self):
        case = self.case("tier2-before-elite")
        saved = json.loads(case["save"])
        encounter = saved["checkpoint"]["encounter"]
        self.assertEqual((encounter["tier"], encounter["wave"], encounter["completedWave"]), (2, 49, 49))
        self.assertEqual(case["simulatedRuns"][0]["committedBoundaries"], 49)
        self.assertGreater(encounter["tick"], 49)
        self.assertGreater(encounter["hull"], 0)
        self.assertEqual(saved["permanentLevels"]["hullCapacity"], 500)
        self.assertEqual(saved["permanentLevels"]["armor"], 500)
        self.assertTrue(all(value == 0 for key, value in saved["permanentLevels"].items() if key not in ("hullCapacity", "armor")))
        self.assertEqual(case["giftedPermanentLevels"], saved["permanentLevels"])
        self.assertEqual(saved["history"]["current"]["highestClearedWave"], 49)
        self.assertTrue(case["productionReloadValidated"])
        self.assertTrue(case["nextCohortContainsElite"])

    def test_sources_tools_and_legacy_bytes_remain_bound(self):
        self.assertTrue(self.report["sourceUnchanged"])
        self.assertEqual(self.report["clockMode"], "fixed UTC for generator regression only")
        self.assertIn("not earned", self.report["scope"])
        for path, digest in self.report["sourceSha256"].items():
            self.assertEqual(hashlib.sha256((REPO / path).read_bytes()).hexdigest(), digest)
        for path, digest in self.report["toolSha256"].items():
            self.assertEqual(hashlib.sha256(Path(path).read_bytes()).hexdigest(), digest)
        legacy = self.case("legacy-v4")
        self.assertEqual(legacy["save"].encode("utf-8"), LEGACY.read_bytes())
        self.assertEqual(legacy["version"], 4)
        self.assertEqual(legacy["clockMode"], "historical pinned compatibility bytes")
        self.assertTrue(all(command["exit"] == 0 for command in self.report["commands"]))

    def test_output_is_fresh_contained_and_preserves_exact_save_bytes(self):
        with tempfile.TemporaryDirectory(prefix="st-presentation-write-") as folder:
            destination = Path(folder) / "fresh"
            report = deepcopy(self.report)
            manifest_path = write(report, destination)
            written = json.loads(manifest_path.read_text())
            for before, after in zip(self.report["cases"], written["cases"]):
                self.assertEqual(after["savePath"], before["id"] + ".json")
                raw = (destination / after["savePath"]).read_bytes()
                self.assertEqual(raw, before["save"].encode("utf-8"))
                self.assertEqual(hashlib.sha256(raw).hexdigest(), after["saveSha256"])
            with self.assertRaises(FileExistsError):
                write(deepcopy(self.report), destination)
            for identity in ("../escaped", "/absolute", "unknown"):
                broken = deepcopy(self.report)
                broken["cases"][0]["id"] = identity
                rejected = Path(folder) / "rejected"
                with self.assertRaises(ValueError):
                    write(broken, rejected)
                self.assertFalse(rejected.exists())


if __name__ == "__main__":
    unittest.main()
