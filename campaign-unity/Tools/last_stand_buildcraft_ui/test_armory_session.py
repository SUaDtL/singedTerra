"""Exercise the real Armory draft against current immutable loadout values."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class ArmorySessionTests(unittest.TestCase):
    def test_preview_presets_cancel_names_and_replacement_protection(self):
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        sources = [scripts / "Content/LastStandLoadout.cs"]
        for name in ("Application/LastStandValueDraft.cs", "LastStandArmorySession.cs"):
            if (scripts / name).exists():
                sources.append(scripts / name)
        sources = complete_sources(scripts, sources)
        sources.append(Path(__file__).with_name("ArmorySessionChecks.cs"))
        with tempfile.TemporaryDirectory(prefix="st-armory-draft-") as folder:
            executable = Path(folder) / "ArmorySessionChecks.exe"
            result = compile_csharp(executable, sources, warnings_as_errors=True, timeout_seconds=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = run_csharp(executable, [], timeout_seconds=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("PASS Armory preview", result.stdout)


if __name__ == "__main__":
    unittest.main()
