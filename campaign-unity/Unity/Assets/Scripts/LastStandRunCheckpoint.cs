using System;
using System.Collections.Generic;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    // Immutable transaction input. A dead cleared boundary is allowed here so
    // rewards and finalization can be one write; only living checkpoints persist.
    public sealed class LastStandRunCheckpoint
    {
        public int RunId { get; }
        public int Tier=>Encounter.Tier;
        public string FittingId=>LastStandFittingCatalog.Id((LastStandFitting)Encounter.Fitting);
        public string RulesVersion=>Encounter.RulesVersion;
        public int CompletedWave=>Encounter.CompletedWave;
        public EncounterCheckpoint Encounter { get; }
        public LastStandShopCheckpoint Shop { get; }
        public LastStandRunCheckpoint(int runId,EncounterCheckpoint encounter,LastStandShopCheckpoint shop)
        {
            if(encounter==null || shop==null || runId<1 || runId!=shop.RunId ||
                encounter.Fitting!=shop.Fitting || encounter.Kills!=shop.UniqueKills ||
                encounter.RulesVersion!=LastStandWaveCatalog.RulesVersion)
                throw new ArgumentException("Checkpoint identities do not match.");
            var restoredShop=LastStandShopState.RestoreCheckpoint(shop);
            var projection=EncounterModel.CreatePlayable(restoredShop.Fitting,encounter.Tier,restoredShop);
            if(encounter.CannonDamage!=projection.CurrentCannonDamage ||
                encounter.CommittedCannonDamage!=projection.CommittedCannonDamage ||
                encounter.LauncherDamage!=projection.CurrentLauncherDamage ||
                encounter.ScattergunDamage!=projection.CurrentScattergunDamage ||
                encounter.MaximumHull!=projection.CurrentMaximumHull ||
                encounter.CannonPeriod!=projection.CurrentCannonPeriod ||
                encounter.RepairAmount!=projection.CurrentRepairAmount || encounter.ArmorLevel!=projection.CurrentArmorLevel)
                throw new ArgumentException("Checkpoint effects do not match its paid upgrade levels.");
            RunId=runId;Encounter=encounter;Shop=shop;
            if(encounter.Hull>0)RestoreModel();
            else if(encounter.Hull!=0 || encounter.CompletedWave<1 || encounter.CompletedWave!=encounter.Wave)
                throw new ArgumentException("Only a cleared terminal boundary may contain zero hull.");
        }
        public EncounterModel RestoreModel()=>EncounterModel.RestoreCheckpoint(
            EncounterProfile.ForTier(Tier),(LastStandFitting)Encounter.Fitting,Encounter);
        public LastStandShopState RestoreShop()=>LastStandShopState.RestoreCheckpoint(Shop);
        public static LastStandRunCheckpoint Start(int runId,int tier,string fitting,IReadOnlyList<int> levels)
        {
            var shop=new LastStandShopState(runId,LastStandFittingCatalog.Parse(fitting),levels);
            var model=EncounterModel.CreatePlayable(shop.Fitting,tier,shop);
            return new LastStandRunCheckpoint(runId,model.CaptureCheckpoint(),shop.CaptureCheckpoint());
        }
    }
}
