using System;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Runs actual combat and catalog projections; no duplicated combat/effect formulas.
internal static class TierCalibrationChecks
{
    static int Main(string[] args)
    {
        foreach (bool launcher in new[] { false, true })
        foreach (int level in new[] { 0, LastStandUpgradeCatalog.PermanentCap, LastStandUpgradeCatalog.TotalCap })
        {
            int Effect(LastStandUpgradeTrackId id) => LastStandUpgradeCatalog.Get(id).EffectAt(level, 1);
            var model = new EncounterModel(launcher, EncounterProfile.ForTier(int.Parse(args[0])));
            model.TryApplyPlayableAttackProjection(Effect(LastStandUpgradeTrackId.CannonAttack),
                launcher ? Effect(LastStandUpgradeTrackId.LauncherAttack) : EncounterModel.LauncherDamage);
            model.TryApplyPlayableDefenseProjection(Effect(LastStandUpgradeTrackId.HullCapacity),
                raw => LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor).EffectAt(level, raw));
            model.TryApplyPlayableCannonPeriodProjection(Effect(LastStandUpgradeTrackId.CannonCycle));
            if (!launcher) model.TryApplyPlayableRepairProjection(Effect(LastStandUpgradeTrackId.FieldRepair));
            while (model.Status == EncounterStatus.Running) model.Step();
            Console.WriteLine("{0},{1},{2},{3},{4},{5}", launcher ? "launcher" : "repair",
                level, model.Tick, model.Kills, model.Hull, model.Status);
        }
        return 0;
    }
}
