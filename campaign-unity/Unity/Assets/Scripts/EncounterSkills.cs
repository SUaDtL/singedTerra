using System;
using SingedTerra.LastStand;

namespace SingedTerra.Encounter
{
    // Captured with the same empty-cohort boundary as hull, kills and purchases.
    // An unfinished wave rolls back all of these fields together.
    public sealed class LastStandSkillCombatCheckpoint
    {
        public readonly int SpentMask,OverdriveUntilTick,MinefieldDamage;
        public readonly bool MinefieldArmed;
        public LastStandSkillCombatCheckpoint(int spentMask=0,int overdriveUntilTick=0,bool minefieldArmed=false,int minefieldDamage=0)
        {SpentMask=spentMask;OverdriveUntilTick=overdriveUntilTick;MinefieldArmed=minefieldArmed;MinefieldDamage=minefieldDamage;}
        public void Validate(LastStandSkillSnapshot skills,int tick,int cannonDamage)
        {
            if(skills==null||tick<0||SpentMask<0||(SpentMask&~7)!=0)throw new ArgumentException("Invalid skill use snapshot.");
            for(int id=0;id<3;id++)if((SpentMask&(1<<id))!=0&&skills.Rank((LastStandSkillId)id)==0)
                throw new ArgumentException("An unequipped skill cannot be spent.");
            bool overdrive=(SpentMask&1)!=0,mines=(SpentMask&4)!=0;
            int duration=EncounterModel.OverdriveDurationTicks(skills.Rank(LastStandSkillId.Overdrive));
            if(OverdriveUntilTick<0||(!overdrive&&OverdriveUntilTick!=0)||overdrive&&
                (OverdriveUntilTick<duration||OverdriveUntilTick>(long)tick+duration))throw new ArgumentException("Invalid overdrive snapshot.");
            if(!mines&&(MinefieldArmed||MinefieldDamage!=0)||mines&&
                (MinefieldDamage<1||MinefieldDamage>EncounterModel.MineDamage(cannonDamage,skills.Rank(LastStandSkillId.Minefield))))
                throw new ArgumentException("Invalid minefield snapshot.");
            if(tick==0&&(SpentMask!=0||OverdriveUntilTick!=0||MinefieldArmed||MinefieldDamage!=0))
                throw new ArgumentException("The initial checkpoint cannot contain skill uses.");
        }
    }
    public sealed partial class EncounterModel
    {
        public const int MinefieldRadius=10000;
        int skillSpentMask,overdriveUntilTick,minefieldDamage;
        bool minefieldArmed;
        public LastStandSkillSnapshot Skills { get; }
        public int OverdriveRemainingTicks=>Math.Max(0,overdriveUntilTick-Tick);
        public bool MinefieldArmed=>minefieldArmed;
        public int MinefieldDamage=>minefieldDamage;
        public bool SkillUsed(LastStandSkillId id)=>(int)id>=0&&(int)id<3&&(skillSpentMask&(1<<(int)id))!=0;
        public int RemainingSkillUses(LastStandSkillId id)=>(int)id>=0&&(int)id<3&&Skills.Rank(id)>0&&!SkillUsed(id)?1:0;
        public bool CanActivateSkill(LastStandSkillId id)=>Profile.IsWaveBased&&Profile.Edition.IsSkills&&
            Status==EncounterStatus.Running&&!AwaitingWaveCommit&&RemainingSkillUses(id)>0&&
            (id!=LastStandSkillId.EmergencyRepairs||Hull<CurrentMaximumHull)&&Tick<int.MaxValue-2048;
        public bool TryActivateSkill(LastStandSkillId id)
        {
            if(!CanActivateSkill(id))return false;
            events.Clear();skillSpentMask|=1<<(int)id;
            int rank=Skills.Rank(id);
            if(id==LastStandSkillId.Overdrive){
                overdriveUntilTick=Tick+OverdriveDurationTicks(rank);RescheduleOverdrive(true);
                events.Add(new EncounterEvent(EncounterEventKind.Overdrive,-1,OverdriveDurationTicks(rank)));
            }else if(id==LastStandSkillId.EmergencyRepairs){
                int amount=(int)Math.Min(CurrentMaximumHull-Hull,(long)CurrentMaximumHull*(20+10*rank)/100);
                Hull+=amount;Restored=Add(Restored,amount);
                events.Add(new EncounterEvent(EncounterEventKind.EmergencyRepairs,-1,amount));
            }else {
                minefieldArmed=true;minefieldDamage=MineDamage(CurrentCannonDamage,rank);
                events.Add(new EncounterEvent(EncounterEventKind.MinefieldArmed,-1,minefieldDamage));
            }
            return true;
        }
        public static int OverdriveDurationTicks(int rank)=>rank==0?0:(9+3*rank)*TicksPerSecond;
        public static int MineDamage(int cannonDamage,int rank)=>(int)Math.Min(LastStandWaveCatalog.MaximumCombatValue,(long)cannonDamage*(3+rank));
        static int BonusPercent(int rank,int first,int increment)=>rank==0?0:first+(rank-1)*increment;
        int SkillDamage(int value)=>ScaleSkill(value,BonusPercent(Skills.Rank(LastStandSkillId.Ballistics),8,4));
        int SkillHull(int value)=>ScaleSkill(value,BonusPercent(Skills.Rank(LastStandSkillId.ReinforcedHull),10,5));
        static int ScaleSkill(int value,int percent)=>(int)Math.Min(LastStandWaveCatalog.MaximumCombatValue,(long)value*(100+percent)/100);
        int SkillIncoming(int damage)=>Math.Max(1,(int)((long)damage*(100-BonusPercent(Skills.Rank(LastStandSkillId.ReactiveLining),10,5))/100));
        static int BoostedPeriod(int period)=>Math.Max(1,(period*2+2)/3);
        int SkillPeriod(int period)=>OverdriveRemainingTicks>0?BoostedPeriod(period):period;
        void RescheduleOverdrive(bool starting)
        {
            if(CannonShots>0)nextCannon=Math.Max(Tick+1,lastCannonShot+(starting?BoostedPeriod(CurrentCannonPeriod):CurrentCannonPeriod));
            RescheduleWeapon(ref nextLauncher,LauncherShots,LauncherPeriod,starting);
            RescheduleWeapon(ref nextScattergun,ScattergunShots,ScattergunPeriod,starting);
            RescheduleWeapon(ref nextMortar,MortarShots,LastStandUpgradeCatalog.MortarPeriod,starting);
            RescheduleWeapon(ref nextRailgun,RailgunShots,LastStandUpgradeCatalog.RailgunPeriod,starting);
            RescheduleWeapon(ref nextArc,ArcShots,LastStandUpgradeCatalog.ArcPeriod,starting);
        }
        void RescheduleWeapon(ref int due,int shots,int period,bool starting)
        {
            if(shots==0)return;
            int oldPeriod=starting?period:BoostedPeriod(period),newPeriod=starting?BoostedPeriod(period):period;
            due=Math.Max(Tick+1,due-oldPeriod+newPeriod);
        }
        void StepSkills()
        {
            if(!Profile.Edition.IsSkills)return;
            if(overdriveUntilTick>0&&Tick==overdriveUntilTick)RescheduleOverdrive(false);
            if(!minefieldArmed)return;
            bool triggered=false;
            foreach(var foe in foes)if(foe.Alive&&foe.Distance<=MinefieldRadius){triggered=true;break;}
            if(!triggered)return;
            minefieldArmed=false;
            for(int slot=0;slot<Capacity;slot++)if(foes[slot].Alive&&foes[slot].Distance<=MinefieldRadius)
                Hit(slot,minefieldDamage,EncounterEventKind.Minefield);
        }
        LastStandSkillCombatCheckpoint CaptureSkills()=>new LastStandSkillCombatCheckpoint(skillSpentMask,overdriveUntilTick,minefieldArmed,minefieldDamage);
        void RestoreSkills(LastStandSkillCombatCheckpoint state)
        {
            state.Validate(Skills,Tick,CurrentCannonDamage);
            if(!Profile.Edition.IsSkills&&state.SpentMask!=0)throw new ArgumentException("Retained runs cannot contain skill uses.");
            skillSpentMask=state.SpentMask;overdriveUntilTick=state.OverdriveUntilTick;minefieldArmed=state.MinefieldArmed;minefieldDamage=state.MinefieldDamage;
        }
    }
}
