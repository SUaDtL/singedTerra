using System;
using SingedTerra.LastStand;

namespace SingedTerra.Encounter
{
    // Only empty-cohort boundaries persist. Transient enemy support is finite
    // within its cohort; the tank's shield and firing schedule survive resume.
    public sealed class LastStandBuildcraftCheckpoint
    {
        public readonly int ArcShots,NextArcTick,ArcDamage,Shield,ShieldCapacity,ShieldRestored,ShieldAbsorbed,NextShieldRechargeTick,LastShieldHitTick;
        public LastStandBuildcraftCheckpoint(int arcShots=0,int nextArcTick=1,int arcDamage=LastStandUpgradeCatalog.BaseArcDamage,
            int shield=0,int shieldCapacity=0,int shieldRestored=0,int shieldAbsorbed=0,
            int nextShieldRechargeTick=LastStandUpgradeCatalog.ShieldRechargePeriod,int lastShieldHitTick=0)
        {
            ArcShots=arcShots;NextArcTick=nextArcTick;ArcDamage=arcDamage;Shield=shield;ShieldCapacity=shieldCapacity;
            ShieldRestored=shieldRestored;ShieldAbsorbed=shieldAbsorbed;NextShieldRechargeTick=nextShieldRechargeTick;LastShieldHitTick=lastShieldHitTick;
        }
    }

    public sealed partial class EncounterModel
    {
        int nextArc=1,nextShieldRecharge=LastStandUpgradeCatalog.ShieldRechargePeriod,lastShieldHit;
        public bool HasArc=>Loadout.Contains(LastStandFitting.Arc);
        public bool HasShield=>Loadout.Contains(LastStandFitting.Shield);
        public int ArcShots { get; private set; }
        public int CurrentArcDamage { get; private set; }=LastStandUpgradeCatalog.BaseArcDamage;
        public int Shield { get; private set; }
        public int CurrentShieldCapacity { get; private set; }
        public int ShieldRestored { get; private set; }
        public int ShieldAbsorbed { get; private set; }
        public int ShieldRecoveryAmount=>HasShield?CombatResearch.ScaleRecovery(Math.Max(1,CurrentShieldCapacity/20)):0;
        public int ShieldRecoveryDelayRemaining=>HasShield?Math.Max(0,lastShieldHit+LastStandUpgradeCatalog.ShieldRechargeDelay-Tick):0;

        void ApplyBuildcraftProjection(LastStandShopState shop)
        {
            if(!Profile.Edition.IsBuildcraft)return;
            if(HasArc)CurrentArcDamage=SkillDamage(shop.GetDefinition(LastStandUpgradeTrackId.ArcOutput).EffectWithResearchAt(shop.GetTrack(LastStandUpgradeTrackId.ArcOutput).CurrentLevel,1,CombatResearch));
            if(HasShield){
                int capacity=shop.GetDefinition(LastStandUpgradeTrackId.ShieldCapacity).EffectAt(shop.GetTrack(LastStandUpgradeTrackId.ShieldCapacity).CurrentLevel,1);
                Shield=(int)Math.Min(capacity,Shield+(long)capacity-CurrentShieldCapacity);CurrentShieldCapacity=capacity;
            }
        }
        void StepBuildcraft()
        {
            if(!Profile.Edition.IsBuildcraft)return;
            if(HasArc&&Tick>=nextArc&&Arc()){ArcShots=Add(ArcShots,1);nextArc=Tick+SkillPeriod(LastStandUpgradeCatalog.ArcPeriod);}
            if(HasShield&&Tick>=nextShieldRecharge&&Tick>=lastShieldHit+LastStandUpgradeCatalog.ShieldRechargeDelay){
                int amount=Math.Min(ShieldRecoveryAmount,CurrentShieldCapacity-Shield);Shield+=amount;
                ShieldRestored=Add(ShieldRestored,amount);nextShieldRecharge=Tick+LastStandUpgradeCatalog.ShieldRechargePeriod;
                if(amount>0)events.Add(new EncounterEvent(EncounterEventKind.ShieldRecharge,-1,amount));
            }
            HealEnemies();
        }
        bool Arc()
        {
            int selected=SelectTarget(Profile.AuxiliaryRange,false);if(selected<0)return false;
            uint visited=0;int damage=CurrentArcDamage,previous=selected;
            for(int hop=0;hop<LastStandUpgradeCatalog.ArcTargets&&selected>=0;hop++){
                var center=EncounterGeometry.Position(foes[selected].Lane,foes[selected].Id,foes[selected].Distance);
                visited|=1u<<selected;Hit(selected,damage,EncounterEventKind.Arc,false,previous);previous=selected;
                int candidate=-1;long nearest=long.MaxValue;
                for(int slot=0;slot<Capacity;slot++){
                    var foe=foes[slot];if(!foe.Alive||(visited&(1u<<slot))!=0)continue;
                    var position=EncounterGeometry.Position(foe.Lane,foe.Id,foe.Distance);
                    long dx=(long)center.X-position.X,dz=(long)center.Z-position.Z,distance=dx*dx+dz*dz;
                    if(distance>(long)LastStandUpgradeCatalog.ArcHopRadius*LastStandUpgradeCatalog.ArcHopRadius)continue;
                    if(distance<nearest||distance==nearest&&(candidate<0||foe.Id<foes[candidate].Id)){candidate=slot;nearest=distance;}
                }
                selected=candidate;damage=Math.Max(1,(int)((long)damage*LastStandUpgradeCatalog.ArcFalloffPercent/100));
            }
            return true;
        }
        int AbsorbTankHit(int damage)
        {
            if(!HasShield)return damage;
            lastShieldHit=Tick;int absorbed=Math.Min(Shield,damage);Shield-=absorbed;ShieldAbsorbed=Add(ShieldAbsorbed,absorbed);
            if(absorbed>0)events.Add(new EncounterEvent(EncounterEventKind.ShieldAbsorb,-1,absorbed));
            return damage-absorbed;
        }
        static bool SupportsAllies(FoeKind kind)=>kind==FoeKind.ShieldCarrier||kind==FoeKind.Medic;
        int AbsorbEnemyHit(int slot,int damage)
        {
            if(!Profile.Edition.IsBuildcraft||SupportsAllies(foes[slot].Kind)||damage<=1)return damage;
            var target=foes[slot];var position=EncounterGeometry.Position(target.Lane,target.Id,target.Distance);
            foreach(var carrier in foes){
                if(!carrier.Alive||carrier.Kind!=FoeKind.ShieldCarrier||carrier.SupportRemaining==0)continue;
                var stats=LastStandEnemyCatalog.ForKind(carrier.Kind,LastStandWaveCatalog.ForWave(Profile.TierDefinition,Wave,Profile.Edition),Profile.Edition);
                uint bit=1u<<target.WaveOrdinal;
                if((carrier.ProtectedMask&bit)==0&&carrier.ProtectedCount>=stats.SupportTargets)continue;
                if(!EncounterGeometry.WithinRadius(position,EncounterGeometry.Position(carrier.Lane,carrier.Id,carrier.Distance),stats.SupportRadius))continue;
                if((carrier.ProtectedMask&bit)==0){carrier.ProtectedMask|=bit;carrier.ProtectedCount++;}
                int absorbed=Math.Min(damage-1,carrier.SupportRemaining);carrier.SupportRemaining-=absorbed;damage-=absorbed;
                events.Add(new EncounterEvent(EncounterEventKind.EnemyShield,slot,absorbed));
                if(damage==1)break;
            }
            return damage;
        }
        void HealEnemies()
        {
            foreach(var medic in foes){
                if(!medic.Alive||medic.Kind!=FoeKind.Medic||medic.SupportRemaining==0||Tick<medic.NextSupportTick)continue;
                var stats=LastStandEnemyCatalog.ForKind(medic.Kind,LastStandWaveCatalog.ForWave(Profile.TierDefinition,Wave,Profile.Edition),Profile.Edition);
                medic.NextSupportTick=Tick+stats.SupportPeriod;int targets=0;
                var center=EncounterGeometry.Position(medic.Lane,medic.Id,medic.Distance);
                for(int slot=0;slot<Capacity&&targets<stats.SupportTargets&&medic.SupportRemaining>0;slot++){
                    var target=foes[slot];if(!target.Alive||SupportsAllies(target.Kind)||target.Hull==target.MaximumHull)continue;
                    if(!EncounterGeometry.WithinRadius(center,EncounterGeometry.Position(target.Lane,target.Id,target.Distance),stats.SupportRadius))continue;
                    int amount=Math.Min(medic.SupportRemaining,Math.Min(stats.HealingPerPulse,target.MaximumHull-target.Hull));
                    target.Hull+=amount;medic.SupportRemaining-=amount;targets++;
                    events.Add(new EncounterEvent(EncounterEventKind.EnemyRepair,slot,amount));
                }
            }
        }
        LastStandBuildcraftCheckpoint CaptureBuildcraft()=>new LastStandBuildcraftCheckpoint(ArcShots,nextArc,CurrentArcDamage,
            Shield,CurrentShieldCapacity,ShieldRestored,ShieldAbsorbed,nextShieldRecharge,lastShieldHit);
        void RestoreBuildcraft(LastStandBuildcraftCheckpoint state)
        {
            if(state==null)throw new ArgumentException("Missing combat snapshot.");
            if(!ValidAuxiliaryCheckpoint(HasArc,state.ArcShots,state.NextArcTick,state.ArcDamage,LastStandUpgradeCatalog.BaseArcDamage,LastStandUpgradeCatalog.ArcPeriod,Tick,Profile.Edition.IsSkills&&SkillUsed(LastStandSkillId.Overdrive))||
                state.Shield<0||state.ShieldCapacity<state.Shield||state.ShieldCapacity>LastStandWaveCatalog.MaximumCombatValue||state.ShieldRestored<0||state.ShieldAbsorbed<0||
                state.LastShieldHitTick<0||state.LastShieldHitTick>Tick||state.NextShieldRechargeTick<1||state.NextShieldRechargeTick>(long)Tick+LastStandUpgradeCatalog.ShieldRechargePeriod||
                state.ShieldRestored<int.MaxValue&&state.ShieldAbsorbed<int.MaxValue&&state.Shield!=(long)state.ShieldCapacity+state.ShieldRestored-state.ShieldAbsorbed||
                HasShield&&state.ShieldCapacity<LastStandUpgradeCatalog.BaseShieldCapacity||
                !HasShield&&(state.Shield!=0||state.ShieldCapacity!=0||state.ShieldRestored!=0||state.ShieldAbsorbed!=0||state.LastShieldHitTick!=0||state.NextShieldRechargeTick!=LastStandUpgradeCatalog.ShieldRechargePeriod)||
                CompletedWave==0&&(state.ArcShots!=0||state.Shield!=state.ShieldCapacity||state.ShieldRestored!=0||state.ShieldAbsorbed!=0||state.LastShieldHitTick!=0))
                throw new ArgumentException("Invalid buildcraft combat snapshot.");
            ArcShots=state.ArcShots;nextArc=state.NextArcTick;CurrentArcDamage=state.ArcDamage;Shield=state.Shield;CurrentShieldCapacity=state.ShieldCapacity;
            ShieldRestored=state.ShieldRestored;ShieldAbsorbed=state.ShieldAbsorbed;nextShieldRecharge=state.NextShieldRechargeTick;lastShieldHit=state.LastShieldHitTick;
        }
    }
}
