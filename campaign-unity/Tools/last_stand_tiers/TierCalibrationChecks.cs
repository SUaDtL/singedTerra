using System;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Numerical matched-build bounds. Explicitly continue each cleared cohort;
// stop at the advancement milestone, never spin on a pending checkpoint.
internal static class TierCalibrationChecks
{
    static int Main(string[] args)
    {
        foreach(var fitting in new[]{LastStandFitting.Repair,LastStandFitting.Launcher,LastStandFitting.Scattergun})
        foreach(int level in new[]{0,3,8,LastStandUpgradeCatalog.TotalCap})
        {
            int Effect(LastStandUpgradeTrackId id) {var d=LastStandUpgradeCatalog.Get(id);return d.EffectAt(Math.Min(level,d.TotalCap),1);}
            var model=new EncounterModel(fitting,EncounterProfile.ForTier(int.Parse(args[0])));
            model.TryApplyPlayableAttackProjection(Effect(LastStandUpgradeTrackId.CannonAttack),
                fitting==LastStandFitting.Launcher?Effect(LastStandUpgradeTrackId.LauncherAttack):EncounterModel.LauncherDamage);
            if(!model.TryApplyPlayableDefenseProjection(Effect(LastStandUpgradeTrackId.HullCapacity),raw=>raw))
                throw new Exception("Declared hull projection was not applied.");
            model.TryApplyPlayableArmorProjection(Math.Min(level,LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor).TotalCap));
            model.TryApplyPlayableCannonPeriodProjection(Effect(LastStandUpgradeTrackId.CannonCycle));
            if(fitting==LastStandFitting.Repair)model.TryApplyPlayableRepairProjection(Effect(LastStandUpgradeTrackId.FieldRepair));
            if(fitting==LastStandFitting.Scattergun)model.TryApplyPlayableScattergunProjection(Effect(LastStandUpgradeTrackId.ScattergunAttack));
            while(model.Status==EncounterStatus.Running && model.CompletedWave<300)
            {
                model.Step();
                if(model.AwaitingWaveCommit && model.CompletedWave<300)model.ContinueAfterCheckpoint();
                if(model.Tick>1000000)throw new Exception("Calibration exceeded its declared finite tick budget.");
            }
            Console.WriteLine("{0},{1},{2},{3},{4},{5},{6}",fitting.ToString().ToLowerInvariant(),level,
                model.Tick,model.Kills,model.Hull,model.Status,model.CompletedWave);
        }
        return 0;
    }
}
