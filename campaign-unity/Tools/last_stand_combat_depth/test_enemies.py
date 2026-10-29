"""Production-model combat checks; synthetic fixtures are not earned play."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class EnemyRoleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="st-enemy-roles-")
        cls.exe = Path(cls.temp.name) / "EnemyRoleChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        cls.build = compile_csharp(cls.exe, complete_sources(scripts, [scripts / "EncounterModel.cs"]) +
                                  [Path(__file__).with_name("EnemyRoleChecks.cs")], warnings_as_errors=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_deterministic_role_composition_and_elite_replacement(self): self.case("composition")
    def test_armor_damage_and_post_death_guards(self): self.case("armor")
    def test_wave_checkpoint_replays_new_mechanics(self): self.case("checkpoint")
