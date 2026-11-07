"""Counterfactual probes must leave all retained editions and non-damage effects intact."""
from pathlib import Path
import tempfile
import unittest

from measure_buildcraft_sensitivity import perturb_catalog
from measure_buildcraft_balance import sources
from last_stand_test_runtime import compile_csharp, run_csharp


class BuildcraftSensitivityTests(unittest.TestCase):
    def test_disposable_parameter_changes_affect_only_current_prices_and_weapon_damage(self):
        closure = [p for p in sources() if p.name not in (
            "CombatBalanceMeasurements.cs", "CombatBalanceChecks.cs", "BuildcraftBalanceMeasurements.cs")]
        catalog = next(p for p in closure if p.name == "LastStandUpgradeCatalog.cs")
        text = catalog.read_text()
        witness = '''using System;using SingedTerra.LastStand;
public static class Witness { public static void Main(){
foreach(var version in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,
LastStandUpgradeCatalog.RetainedEconomyVersion,LastStandUpgradeCatalog.CombatDepthEconomyVersion,LastStandUpgradeCatalog.EconomyVersion}){
var catalog=LastStandUpgradeCatalog.ForEconomy(version);var attack=catalog.Get(LastStandUpgradeTrackId.CannonAttack);
int level=Math.Min(6,attack.PermanentCap);
Console.WriteLine(version+"|"+attack.RunPrice(level)+"|"+attack.PermanentPrice(level)+"|"+attack.EffectAt(level,1)+"|"+
catalog.Get(LastStandUpgradeTrackId.FieldRepair).EffectAt(level,1)+"|"+catalog.Get(LastStandUpgradeTrackId.CannonCycle).EffectAt(level,1));
}}}'''
        results = []
        with tempfile.TemporaryDirectory(prefix="st-sensitivity-scope-") as folder:
            folder = Path(folder)
            main = folder / "Witness.cs"
            main.write_text(witness)
            for percent in (100, 95, 105):
                changed = folder / catalog.name
                changed.write_text(perturb_catalog(text, percent, percent))
                exe = folder / "Witness.exe"
                compile_csharp(exe, [changed if p == catalog else p for p in closure] + [main])
                run = run_csharp(exe)
                self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
                results.append([line.split("|") for line in run.stdout.splitlines()])
        baseline, lower, higher = results
        self.assertEqual(baseline[:4], lower[:4])
        self.assertEqual(baseline[:4], higher[:4])
        self.assertEqual(baseline[4][4:], lower[4][4:])
        self.assertEqual(baseline[4][4:], higher[4][4:])
        for column in (1, 2, 3):
            self.assertLessEqual(int(lower[4][column]), int(baseline[4][column]))
            self.assertGreaterEqual(int(higher[4][column]), int(baseline[4][column]))
        self.assertNotEqual(lower[4][1:4], higher[4][1:4])

    def test_catalog_shape_change_is_rejected_before_counterfactual_compilation(self):
        with self.assertRaises(ValueError):
            perturb_catalog("foreign catalog", 95, 105)


if __name__ == "__main__":
    unittest.main()
