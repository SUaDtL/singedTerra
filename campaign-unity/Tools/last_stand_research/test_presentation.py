"""Production model presentation and garage geometry checks; no renderer claim."""
from pathlib import Path
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SCRIPTS = PROJECT / "Unity/Assets/Scripts"


class ResearchPresentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-research-presentation-")
        cls.executable = Path(cls.output.name) / "PresentationChecks.exe"
        source = [SCRIPTS / f"LastStand{name}.cs" for name in
                  ("ResearchPresentation", "ResearchState", "ResearchCatalog", "ResearchClock", "HudLayout")]
        result = subprocess.run([str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{cls.executable}",
                                 *map(str, source), str(Path(__file__).with_name("PresentationChecks.cs"))],
                                capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Compilation failed:\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls): cls.output.cleanup()

    def case(self, name):
        result = subprocess.run([str(MONO), str(self.executable), name], capture_output=True,
                                text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_forty_project_filtering(self): self.case("catalog")
    def test_action_legality_uses_actual_engine(self): self.case("actions")
    def test_suspended_time_and_cost_disclosed(self): self.case("suspended")
    def test_timer_and_effect_readouts(self): self.case("readouts")
    def test_garage_targets_and_battle_separation(self): self.case("garage")
    def test_bulk_shop_geometry(self): self.case("bulk")
