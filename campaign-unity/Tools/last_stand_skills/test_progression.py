"""Skills collection uses the real durable profile and save codec."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp

SCRIPTS = TOOLS.parent / "Unity/Assets/Scripts"
HERE = Path(__file__).resolve().parent


class SkillProgressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="st-skills-")
        cls.exe = Path(cls.folder.name) / "SkillProgressionChecks.exe"
        compile_csharp(cls.exe, complete_sources(SCRIPTS, [SCRIPTS / "LastStandProgression.cs"]) +
                       [HERE / "SkillProgressionChecks.cs"])

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def case(self, name):
        run = run_csharp(self.exe, [name], timeout_seconds=90)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(run.stdout.strip(), "PASS " + name)

    def test_eligibility_slots_and_ownership_are_distinct(self): self.case("eligibility")
    def test_draw_retry_commits_one_fixed_outcome_and_excludes_maxed(self): self.case("draw")
    def test_mutations_refuse_stale_readonly_and_malformed_inputs(self): self.case("refusal")
    def test_named_build_preset_applies_hardware_and_skills_atomically(self): self.case("presets")
    def test_v8_migration_keeps_checkpoint_and_does_not_invent_rewards(self): self.case("migration")
    def test_intel_rewards_are_atomic_and_confirmed_once(self): self.case("rewards")
    def test_backup_roundtrip_preserves_skill_state(self): self.case("backup")
    def test_invalid_saved_skill_fields_preserve_original_bytes(self): self.case("malformed")
    def test_deployment_freezes_ranks_and_resume_preserves_spent_uses(self): self.case("checkpoint")


if __name__ == "__main__": unittest.main()
