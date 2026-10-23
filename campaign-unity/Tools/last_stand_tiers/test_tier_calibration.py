"""Measure approved provisional goals against actual compiled combat/catalog sources.

Both tiers use production rules. This is numerical calibration, not a real-player
journey. Total-cap builds are numerical bounds, not earned builds.
"""
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources


PROJECT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"


class TierCalibrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.measurements = {}
        with tempfile.TemporaryDirectory(prefix="st-tier-calibration-") as folder:
            output = Path(folder)
            for tier in (1, 2):
                executable = output / f"Tier{tier}.exe"
                sources = [SCRIPTS / name for name in (
                    "EncounterModel.cs", "EncounterProfile.cs", "LastStandTierCatalog.cs",
                    "LastStandUpgradeCatalog.cs", "MechanicsShopModel.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs"
                )] + [Path(__file__).with_name("TierCalibrationChecks.cs")]
                sources = complete_sources(SCRIPTS, sources)
                build = subprocess.run([str(MONO), str(CSC), "-nologo", f"-out:{executable}",
                                        *map(str, sources)], capture_output=True, text=True,
                                       encoding="utf-8-sig", timeout=60)
                if build.returncode:
                    raise AssertionError(build.stdout + build.stderr)
                run = subprocess.run([str(MONO), str(executable), str(tier)], capture_output=True,
                                     text=True, encoding="utf-8-sig", timeout=30)
                if run.returncode:
                    raise AssertionError(run.stdout + run.stderr)
                for line in run.stdout.splitlines():
                    fitting, level, ticks, kills, hull, status, wave = line.split(",")
                    cls.measurements[tier, fitting, int(level)] = dict(
                        tier=tier, fitting=fitting, level=int(level), ticks=int(ticks),
                        seconds=int(ticks) / 20, kills=int(kills), hull=int(hull), status=status, completed_wave=int(wave))
        print("CALIBRATION " + json.dumps(list(cls.measurements.values()), sort_keys=True), flush=True)

    def test_wave_advancement_attainable_at_current_per_track_caps(self):
        for tier in (1, 2):
            for fitting in ("repair", "launcher", "scattergun"):
                with self.subTest(tier=tier, fitting=fitting):
                    self.assertEqual(self.measurements[tier, fitting, 5000]["completed_wave"], 300)
                    self.assertEqual(self.measurements[tier, fitting, 5000]["status"], "Running")

    def test_tier_two_harder_for_matched_builds(self):
        for fitting in ("repair", "launcher", "scattergun"):
            for level in (0, 3, 8):
                with self.subTest(fitting=fitting, level=level):
                    easy = self.measurements[1, fitting, level]
                    hard = self.measurements[2, fitting, level]
                    self.assertLessEqual(hard["ticks"], easy["ticks"])
                    self.assertTrue(hard["ticks"] < easy["ticks"] or hard["kills"] < easy["kills"],
                                    "Matched build shows no observed difficulty difference.")


if __name__ == "__main__":
    unittest.main()
