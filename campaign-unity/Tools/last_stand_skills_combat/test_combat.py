"""Production skill combat, captured state, and retained-edition contracts."""
from pathlib import Path
import sys,tempfile,unittest
TOOLS=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp,run_csharp
SCRIPTS=TOOLS.parent/"Unity/Assets/Scripts"
class SkillCombatTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.folder=tempfile.TemporaryDirectory(prefix="st-skills-combat-")
  cls.exe=Path(cls.folder.name)/"SkillCombatChecks.exe"
  compile_csharp(cls.exe,complete_sources(SCRIPTS,[SCRIPTS/"LastStandRunCheckpoint.cs",SCRIPTS/"EncounterSkills.cs",SCRIPTS/"Content/LastStandSkillCatalog.cs"])+[Path(__file__).with_name("SkillCombatChecks.cs")])
 @classmethod
 def tearDownClass(cls):cls.folder.cleanup()
 def case(self,name):
  result=run_csharp(self.exe,[name],timeout_seconds=90)
  self.assertEqual(result.returncode,0,result.stdout+result.stderr)
  self.assertEqual(result.stdout.strip(),"PASS "+name)
 def test_rank_effects_match_declared_percentages(self):self.case("ranks")
 def test_pause_speed_and_delayed_callback_preserve_skill_results(self):self.case("clock")
 def test_armed_mines_survive_real_paid_upgrade_boundary(self):self.case("armed-boundary")
 def test_activation_refusals_and_single_use(self):self.case("activation")
 def test_overdrive_accelerates_independent_weapons_then_expires(self):self.case("overdrive")
 def test_mines_wait_for_ring_and_hit_only_in_range(self):self.case("minefield")
 def test_passives_apply_once_and_survive_upgrades(self):self.case("passives")
 def test_checkpoint_keeps_spent_uses_and_active_effects(self):self.case("checkpoint")
 def test_retained_buildcraft_runs_have_neutral_skills(self):self.case("retained")
 def test_checkpoint_rejects_forged_skill_state(self):self.case("invalid")
if __name__=="__main__":unittest.main()
