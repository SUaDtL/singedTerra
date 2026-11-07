"""Production fixed-step fitting/support behavior, separate from earned balance proof."""
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


class BuildcraftCombatTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="st-buildcraft-combat-")
        cls.exe = Path(cls.folder.name) / "CombatChecks.exe"
        compile_csharp(cls.exe, complete_sources(SCRIPTS, [SCRIPTS / "LastStandRunCheckpoint.cs"]) + [HERE / "CombatChecks.cs"])

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def case(self, name):
        run = run_csharp(self.exe, [name], timeout_seconds=90)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(run.stdout.strip(), "PASS " + name)

    def test_arc_has_unique_bounded_falloff_targets_and_both_bays_tick(self):
        self.case("arc")

    def test_shield_absorbs_recharges_after_quiet_period_and_cannot_heal_without_bound(self):
        self.case("shield")

    def test_combat_research_projects_shared_bounded_effects_once(self):
        self.case("research")

    def test_all_seven_singles_and_twenty_one_pairs_clear_restore_and_keep_common_effects_once(self):
        self.case("pairs")

    def test_support_is_finite_and_commanders_preserve_clear_and_telegraph_rules(self):
        self.case("support")

    def test_pause_and_five_times_speed_preserve_shield_chain_and_telegraph_outcomes(self):
        self.case("clock")

    def test_paid_shield_capacity_delta_and_recharge_ledger_survive_restore(self):
        self.case("paid-shield")

    def test_arc_acquisition_and_hops_include_exact_boundaries_and_exclude_outside(self):
        self.case("arc-ranges")

    def test_carrier_and_medic_aura_boundaries_affect_only_expected_identities(self):
        self.case("aura-ranges")

    def test_support_limits_three_targets_and_conserves_finite_budgets(self):
        self.case("support-limits")

    def test_combat_contracts_reject_repeat_chain_early_recharge_and_single_bay_faults(self):
        faults = [
            ("EncounterBuildcraft.cs", "visited|=1u<<selected;", "visited|=0u;", "arc", "chain target repeats"),
            ("EncounterBuildcraft.cs", "Tick>=lastShieldHit+LastStandUpgradeCatalog.ShieldRechargeDelay",
             "Tick>=lastShieldHit", "shield", "no early recharge"),
            ("EncounterModel.cs", "            if(HasScattergun)\n", "            else if(HasScattergun)\n",
             "arc", "both bays tick independently"),
        ]
        self.assert_mutations_detected(faults, "combat")

    def test_range_target_and_budget_guard_removals_are_detected(self):
        # Reflexive aura positions bypass range without leaving unused locals;
        # Mono treats those warnings as errors before the behavioral assertion.
        self.assert_mutations_detected([
            ("EncounterModel.cs", "if (!foe.Alive || foe.Distance > range) continue;",
             "if (!foe.Alive) continue;", "arc-ranges", "arc acquisition range boundary"),
            ("EncounterModel.cs", "if (!foe.Alive || foe.Distance > range) continue;",
             "if (!foe.Alive || foe.Distance >= range) continue;", "arc-ranges", "arc acquisition range boundary"),
            ("EncounterBuildcraft.cs", "if(distance>(long)LastStandUpgradeCatalog.ArcHopRadius*LastStandUpgradeCatalog.ArcHopRadius)continue;",
             "", "arc-ranges", "arc hop radius boundary"),
            ("EncounterBuildcraft.cs", "if(distance>(long)LastStandUpgradeCatalog.ArcHopRadius*LastStandUpgradeCatalog.ArcHopRadius)continue;",
             "if(distance>=(long)LastStandUpgradeCatalog.ArcHopRadius*LastStandUpgradeCatalog.ArcHopRadius)continue;", "arc-ranges", "arc hop radius boundary"),
            ("EncounterBuildcraft.cs", "if(!EncounterGeometry.WithinRadius(position,EncounterGeometry.Position(carrier.Lane,carrier.Id,carrier.Distance),stats.SupportRadius))continue;",
             "if(!EncounterGeometry.WithinRadius(position,position,stats.SupportRadius))continue;",
             "aura-ranges", "carrier aura radius boundary"),
            ("EncounterBuildcraft.cs", "if((carrier.ProtectedMask&bit)==0&&carrier.ProtectedCount>=stats.SupportTargets)continue;",
             "", "support-limits", "carrier distinct target cap"),
            ("EncounterBuildcraft.cs", "Math.Min(damage-1,carrier.SupportRemaining)",
             "damage-1", "support-limits", "carrier finite shield conservation"),
            ("EncounterBuildcraft.cs", "if(!EncounterGeometry.WithinRadius(center,EncounterGeometry.Position(target.Lane,target.Id,target.Distance),stats.SupportRadius))continue;",
             "if(!EncounterGeometry.WithinRadius(center,center,stats.SupportRadius))continue;",
             "aura-ranges", "medic aura radius boundary"),
            ("EncounterBuildcraft.cs", "slot<Capacity&&targets<stats.SupportTargets&&medic.SupportRemaining>0",
             "slot<Capacity&&medic.SupportRemaining>0", "support-limits", "medic target cap"),
            ("EncounterBuildcraft.cs", "Math.Min(medic.SupportRemaining,Math.Min(stats.HealingPerPulse,target.MaximumHull-target.Hull))",
             "Math.Min(stats.HealingPerPulse,target.MaximumHull-target.Hull)", "support-limits", "medic finite healing conservation"),
        ], "bounds")

    def assert_mutations_detected(self, faults, prefix):
        inputs = complete_sources(SCRIPTS, [SCRIPTS / "LastStandRunCheckpoint.cs"])
        for index, (name, before, after, case, expected) in enumerate(faults):
            with self.subTest(fault=name + ":" + case, mutation=index):
                original = next(path for path in inputs if path.name == name)
                content = original.read_text(encoding="utf-8-sig")
                self.assertEqual(content.count(before), 1)
                folder = Path(self.folder.name) / (prefix + "-fault-" + str(index))
                folder.mkdir()
                mutated = folder / name
                mutated.write_text(content.replace(before, after), encoding="utf-8")
                executable = folder / "Fault.exe"
                compile_csharp(executable, [mutated if path == original else path for path in inputs] + [HERE / "CombatChecks.cs"])
                run = run_csharp(executable, [case], timeout_seconds=90)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn(expected, run.stderr)
                print("MUTATION_DETECTED " + prefix + ":" + str(index) + " " + name + " " + case + " -> " + expected, flush=True)


if __name__ == "__main__":
    unittest.main()
