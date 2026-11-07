"""Current-wave details use the same finite support and captured build authority."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class BuildcraftWaveInformationTests(unittest.TestCase):
    def test_finite_support_details_and_secondary_bay_ownership(self):
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        sources = complete_sources(scripts, [scripts / name for name in
            ("LastStandWaveInformation.cs", "LastStandMilestonePresentation.cs", "EncounterModel.cs", "LastStandShopState.cs")])
        sources.append(Path(__file__).with_name("WaveInformationChecks.cs"))
        with tempfile.TemporaryDirectory(prefix="st-buildcraft-wave-info-") as folder:
            executable = Path(folder) / "WaveInformationChecks.exe"
            result = compile_csharp(executable, sources, warnings_as_errors=True, timeout_seconds=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = run_csharp(executable, [], timeout_seconds=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("PASS Wave information support", result.stdout)
