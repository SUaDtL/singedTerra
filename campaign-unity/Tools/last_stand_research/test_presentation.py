"""Production model presentation and garage geometry checks; no renderer claim."""
from pathlib import Path
import sys
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT / "Tools"))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp
SCRIPTS = PROJECT / "Unity/Assets/Scripts"


class ResearchPresentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-research-presentation-")
        cls.executable = Path(cls.output.name) / "PresentationChecks.exe"
        source = [SCRIPTS / f"LastStand{name}.cs" for name in
                  ("ResearchPresentation", "ResearchState", "ResearchCatalog", "ResearchClock", "HudLayout")]
        try:
            cls.build = compile_csharp(cls.executable, complete_sources(SCRIPTS, source) +
                [Path(__file__).with_name("PresentationChecks.cs")])
        except Exception:
            cls.output.cleanup()
            raise


    @classmethod
    def tearDownClass(cls): cls.output.cleanup()

    def case(self, name):
        result = run_csharp(self.executable, [name], timeout_seconds=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_forty_project_filtering(self): self.case("catalog")
    def test_action_legality_uses_actual_engine(self): self.case("actions")
    def test_suspended_time_and_cost_disclosed(self): self.case("suspended")
    def test_timer_and_effect_readouts(self): self.case("readouts")
    def test_garage_targets_and_battle_separation(self): self.case("garage")
    def test_bulk_shop_geometry(self): self.case("bulk")
