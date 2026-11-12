using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public sealed class LastStandSkillDrawReceipt
    {
        public LastStandSkillId Skill { get; }
        public int Copies { get; }
        public int Rank { get; }
        public bool NewOwnership=>Copies==1;
        internal LastStandSkillDrawReceipt(LastStandSkillId skill,int copies)
        {Skill=skill;Copies=copies;Rank=LastStandSkillCatalog.RankForCopies(copies);}
    }
    public sealed partial class LastStandProgression
    {
        static readonly Random skillRandom=new Random();
        public int SkillIntel=>committed?.SkillIntel??0;
        public int SkillSlotCount=>LastStandSkillCatalog.SlotsAt(GetBestWave(1));
        public LastStandSkillLoadout SelectedSkills=>committed?.SelectedSkills??LastStandSkillLoadout.Empty;
        public LastStandSkillDrawReceipt LastSkillDraw { get; private set; }
        public int SkillCopies(LastStandSkillId id){LastStandSkillCatalog.Get(id);return committed?.SkillCopies[(int)id]??0;}
        public int SkillRank(LastStandSkillId id)=>LastStandSkillCatalog.RankForCopies(SkillCopies(id));
        public bool IsSkillEligible(LastStandSkillId id)=>GetBestWave(1)>=LastStandSkillCatalog.Get(id).UnlockWave;
        public IReadOnlyList<LastStandSkillId> SkillDrawPool
        {
            get{var pool=new List<LastStandSkillId>();foreach(var skill in LastStandSkillCatalog.All)
                if(IsSkillEligible(skill.Id)&&SkillCopies(skill.Id)<LastStandSkillCatalog.MaximumCopies)pool.Add(skill.Id);
                return pool.AsReadOnly();}
        }
        public LastStandSkillSnapshot CaptureSkills()
        {var ranks=new int[LastStandSkillCatalog.Count];foreach(var id in SelectedSkills.Ids)ranks[(int)id]=SkillRank(id);return new LastStandSkillSnapshot(SelectedSkills,ranks);}
        static bool SkillsAvailable(Record row,LastStandSkillLoadout skills)=>skills!=null&&skills.IsAvailable(
            LastStandSkillCatalog.SlotsAt(row.Tiers["tier-1"].BestWave),id=>LastStandSkillCatalog.RankForCopies(row.SkillCopies[(int)id]));
        static bool SkillsFunded(Record row,LastStandSkillSnapshot snapshot)
        {if(snapshot==null||!SkillsAvailable(row,snapshot.Loadout))return false;foreach(var skill in LastStandSkillCatalog.All)
            if(snapshot.Rank(skill.Id)>LastStandSkillCatalog.RankForCopies(row.SkillCopies[(int)skill.Id]))return false;return true;}
        public bool TryApplySkills(LastStandSkillLoadout skills,long expectedRevision)
        {
            if(!Ready||expectedRevision!=Revision||committed.Pending!=null||!SkillsAvailable(committed,skills))return false;
            if(skills.Equals(SelectedSkills))return true;
            var next=committed.Copy();next.SelectedSkills=skills;return Commit(next,null);
        }
        public bool TryDrawSkill(long expectedRevision,Func<int,int> choose=null)
        {
            if(!Ready||expectedRevision!=Revision||committed.Pending!=null||SkillIntel<LastStandSkillCatalog.DrawCost)return false;
            var pool=SkillDrawPool;if(pool.Count==0||!OwnsStorage())return false;
            int picked;if(choose==null){lock(skillRandom)picked=skillRandom.Next(pool.Count);}else picked=choose(pool.Count);
            if(picked<0||picked>=pool.Count)return false;
            // Sample exactly once. Existing pending-transaction retry retains
            // this selected outcome, currency debit and copy increment together.
            var next=committed.Copy();var id=pool[picked];next.SkillIntel-=LastStandSkillCatalog.DrawCost;next.SkillCopies[(int)id]++;
            var receipt=new LastStandSkillDrawReceipt(id,next.SkillCopies[(int)id]);return Commit(next,()=>LastSkillDraw=receipt);
        }
        static int AwardSkillIntel(Record next,int tier,int wave)
        {
            int amount=wave%100==0?1:0;
            if(tier==1&&(wave==25||wave==50)&&next.SkillFirstAwards.Add("tier-1:skills-"+wave))amount++;
            if(amount>int.MaxValue-next.SkillIntel)throw new OverflowException("Skill Intel storage is full.");
            next.SkillIntel+=amount;return amount;
        }
    }
}
