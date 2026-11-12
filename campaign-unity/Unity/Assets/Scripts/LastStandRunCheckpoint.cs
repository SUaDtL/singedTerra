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
        public LastStandRunEdition Edition { get; }
        public LastStandLoadout Loadout=>Encounter.Loadout;
        public LastStandCombatResearchSnapshot CombatResearch=>Encounter.CombatResearch;
        public LastStandSkillSnapshot Skills=>Encounter.Skills;
        public int CompletedWave=>Encounter.CompletedWave;
        public EncounterCheckpoint Encounter { get; }
        public LastStandShopCheckpoint Shop { get; }
        public LastStandRunCheckpoint(int runId,EncounterCheckpoint encounter,LastStandShopCheckpoint shop,string contentVersion=null)
        {
            if(encounter==null || shop==null || runId<1 || runId!=shop.RunId ||
                !encounter.Loadout.Equals(shop.Loadout)||!encounter.CombatResearch.Equals(shop.CombatResearch) || encounter.Kills!=shop.UniqueKills)
                throw new ArgumentException("Checkpoint identities do not match.");
            Edition=LastStandRunEdition.Resolve(encounter.RulesVersion,contentVersion??LastStandRunEdition.ContentForRules(encounter.RulesVersion),shop.EconomyVersion);
            encounter.SkillState.Validate(encounter.Skills,encounter.Tick,encounter.CannonDamage);
            if(!Edition.IsSkills&&(!encounter.Skills.IsEmpty||encounter.SkillState.SpentMask!=0))
                throw new ArgumentException("Retained runs cannot contain skills.");
            var restoredShop=LastStandShopState.RestoreCheckpoint(shop,Edition,encounter.Tier);
            if(!Edition.IsLegacy&&(shop.Tier!=encounter.Tier||shop.RewardWave!=encounter.Wave||
                shop.DefeatedMask!=(encounter.CompletedWave==0?0:(1<<LastStandWaveCatalog.ForWave(Edition.Tier(encounter.Tier),encounter.Wave,Edition).EnemyCount)-1)))
                throw new ArgumentException("Checkpoint encounter and income cohorts do not match.");
            var projection=EncounterModel.CreatePlayable(restoredShop.Fitting,encounter.Tier,restoredShop,encounter.Skills);
            if(encounter.CannonDamage!=projection.CurrentCannonDamage ||
                encounter.CommittedCannonDamage!=projection.CommittedCannonDamage ||
                encounter.LauncherDamage!=projection.CurrentLauncherDamage ||
                encounter.ScattergunDamage!=projection.CurrentScattergunDamage ||
                Edition.IsBuildcraft&&(encounter.Buildcraft.ArcDamage!=projection.CurrentArcDamage||encounter.Buildcraft.ShieldCapacity!=projection.CurrentShieldCapacity)||
                !Edition.IsLegacy&&(encounter.MortarDamage!=projection.CurrentMortarDamage||encounter.RailgunDamage!=projection.CurrentRailgunDamage) ||
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
            EncounterProfile.ForTier(Tier,Edition),(LastStandFitting)Encounter.Fitting,Encounter);
        public LastStandShopState RestoreShop()=>LastStandShopState.RestoreCheckpoint(Shop,Edition,Tier);
        public static LastStandRunCheckpoint Start(int runId,int tier,string fitting,IReadOnlyList<int> levels,LastStandRunEdition edition=null)
            =>Start(runId,tier,new LastStandLoadout(fitting),levels,edition);
        public static LastStandRunCheckpoint Start(int runId,int tier,LastStandLoadout loadout,IReadOnlyList<int> levels,
            LastStandRunEdition edition=null,LastStandCombatResearchSnapshot combatResearch=null,LastStandSkillSnapshot skills=null)
        {
            edition=edition??LastStandRunEdition.Current;
            if(loadout==null)throw new ArgumentNullException(nameof(loadout));
            var shop=new LastStandShopState(runId,loadout.Primary,levels,edition.EconomyVersion,edition,tier,loadout,combatResearch);
            var model=EncounterModel.CreatePlayable(shop.Fitting,tier,shop,skills);
            return new LastStandRunCheckpoint(runId,model.CaptureCheckpoint(),shop.CaptureCheckpoint());
        }
    }
}
