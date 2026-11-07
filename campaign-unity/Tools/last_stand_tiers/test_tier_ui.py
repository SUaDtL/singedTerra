"""Production tier text and pure geometry checks; rendered UI proof remains separate."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp
from last_stand_source_closure import complete_sources

PROJECT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT / "Unity/Assets/Scripts"


class TierHudTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-tier-hud-")
        cls.executable = Path(cls.output.name) / "TierHudChecks.exe"
        sources = [SCRIPTS / name for name in ("LastStandTierCatalog.cs", "LastStandTierHudText.cs", "LastStandHudLayout.cs")]
        sources.append(Path(__file__).with_name("TierHudChecks.cs"))
        sources = complete_sources(SCRIPTS, sources)
        build = compile_csharp(cls.executable, sources, warnings_as_errors=True, timeout_seconds=60)
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(build.stdout + build.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        run = run_csharp(self.executable, [name], timeout_seconds=30)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(run.stdout.strip(), "PASS " + name)

    def test_tier_targets_and_summaries_fit_profiles(self):
        self.case("geometry")

    def test_tier_text_reports_saved_and_unsaved_outcomes(self):
        self.case("text")

    def test_live_wave_heading_never_claims_saved_credit(self):
        self.case("live-goal")


if __name__ == "__main__":
    unittest.main()
