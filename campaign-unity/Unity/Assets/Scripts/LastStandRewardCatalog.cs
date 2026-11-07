using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public enum LastStandRewardKind { Salvage, Tier, Fitting, EquipmentBays, ResearchLabs, CombatResearch }
    public sealed class LastStandRewardGrant
    {
        public LastStandRewardKind Kind { get; }
        public string Id { get; }
        public int Amount { get; }
        public LastStandRewardGrant(LastStandRewardKind kind,string id,int amount=1)
        {
            LastStandSelectionOption.ValidateId(id);
            if(!Enum.IsDefined(typeof(LastStandRewardKind),kind)||amount<1||
                kind==LastStandRewardKind.EquipmentBays&&amount>2||kind==LastStandRewardKind.ResearchLabs&&amount>3)
                throw new ArgumentException("Invalid milestone reward.");
            Kind=kind;Id=id;Amount=amount;
        }
    }
    public sealed class LastStandEntitlements
    {
        readonly HashSet<string> fittings=new HashSet<string>(StringComparer.Ordinal);
        readonly HashSet<int> tiers=new HashSet<int>();
        public int EquipmentBays { get; private set; }=1;
        public int ResearchLabs { get; private set; }
        public bool CombatResearch { get; private set; }
        public IReadOnlyCollection<string> Fittings=>new List<string>(fittings).AsReadOnly();
        public IReadOnlyCollection<int> Tiers=>new List<int>(tiers).AsReadOnly();
        internal void Grant(LastStandRewardGrant reward)
        {
            switch(reward.Kind){
                case LastStandRewardKind.Fitting:fittings.Add(reward.Id);break;
                case LastStandRewardKind.Tier:tiers.Add(reward.Amount);break;
                case LastStandRewardKind.EquipmentBays:EquipmentBays=Math.Max(EquipmentBays,reward.Amount);break;
                case LastStandRewardKind.ResearchLabs:ResearchLabs=Math.Max(ResearchLabs,reward.Amount);break;
                case LastStandRewardKind.CombatResearch:CombatResearch=true;break;
            }
        }
    }
    public sealed class LastStandMilestone
    {
        public string Id { get; }
        public int Wave { get; }
        public int FirstClearSalvage { get; }
        public int UnlockTierId { get; }
        public string UnlockFittingId { get; }
        public IReadOnlyList<LastStandRewardGrant> Rewards { get; }
        internal LastStandMilestone(string tierKey,int wave,int salvage,int unlockTier=0,string fitting=null)
            :this(tierKey,wave,LegacyRewards(salvage,unlockTier,fitting)) { }
        public LastStandMilestone(string tierKey,int wave,IEnumerable<LastStandRewardGrant> rewards)
        {
            LastStandSelectionOption.ValidateId(tierKey);
            if(wave<1||rewards==null)throw new ArgumentException("Invalid milestone.");
            Id=tierKey+":wave-"+wave;Wave=wave;
            var rows=new List<LastStandRewardGrant>();var identities=new HashSet<string>(StringComparer.Ordinal);
            foreach(var reward in rewards){
                if(reward==null||rows.Count==16||!identities.Add(reward.Kind+":"+reward.Id))throw new ArgumentException("Duplicate or unbounded milestone reward.");
                rows.Add(reward);
                if(reward.Kind==LastStandRewardKind.Salvage)FirstClearSalvage=checked(FirstClearSalvage+reward.Amount);
                if(reward.Kind==LastStandRewardKind.Tier&&UnlockTierId==0)UnlockTierId=reward.Amount;
                if(reward.Kind==LastStandRewardKind.Fitting&&UnlockFittingId==null)UnlockFittingId=reward.Id;
            }
            Rewards=rows.AsReadOnly();
        }
        static IEnumerable<LastStandRewardGrant> LegacyRewards(int salvage,int tier,string fitting)
        {
            yield return new LastStandRewardGrant(LastStandRewardKind.Salvage,"salvage",salvage);
            if(tier!=0)yield return new LastStandRewardGrant(LastStandRewardKind.Tier,"tier-"+tier,tier);
            if(fitting!=null)yield return new LastStandRewardGrant(LastStandRewardKind.Fitting,fitting);
        }
    }
    public readonly struct LastStandWaveReward
    {
        public readonly int RepeatableSalvage;
        public readonly LastStandMilestone Milestone;
        public int FirstClearSalvage=>Milestone==null?0:Milestone.FirstClearSalvage;
        internal LastStandWaveReward(int repeatable,LastStandMilestone milestone)
        {RepeatableSalvage=repeatable;Milestone=milestone;}
    }
    public static class LastStandRewardCatalog
    {
        static readonly int[] milestoneWaves={10,25,50,100,200,300,500,750,1000,1500,2000,3000,4000,5000,7500,10000};
        static readonly Dictionary<LastStandTierDefinition,IReadOnlyList<LastStandMilestone>> authored=BuildAuthored();
        static Dictionary<LastStandTierDefinition,IReadOnlyList<LastStandMilestone>> BuildAuthored()
        {
            var result=new Dictionary<LastStandTierDefinition,IReadOnlyList<LastStandMilestone>>();
            foreach(var tier in LastStandTierCatalog.All)result.Add(tier,Milestones(tier,LastStandTierCatalog.All));
            return result;
        }
        public static IReadOnlyList<LastStandMilestone> Milestones(LastStandTierDefinition tier)
        {
            if(tier==null)throw new ArgumentNullException(nameof(tier));
            if(authored.TryGetValue(tier,out var rows))return rows;
            return Milestones(tier,LastStandTierCatalog.All);
        }
        public static IReadOnlyList<LastStandMilestone> Milestones(LastStandTierDefinition tier,IReadOnlyList<LastStandTierDefinition> definitions)
            => Milestones(tier,definitions,LastStandFittingCatalog.Definitions,true);
        public static IReadOnlyList<LastStandMilestone> Milestones(LastStandTierDefinition tier,IReadOnlyList<LastStandTierDefinition> definitions,
            IReadOnlyList<LastStandFittingDefinition> fittings,bool buildcraft=false)
        {
            if(tier==null)throw new ArgumentNullException(nameof(tier));
            LastStandTierCatalog.Validate(definitions);
            var waves=new SortedSet<int>(milestoneWaves);
            if(fittings==null)throw new ArgumentNullException(nameof(fittings));
            var grants=new Dictionary<int,List<LastStandRewardGrant>>();
            Action<int,LastStandRewardGrant> add=(wave,grant)=>{
                waves.Add(wave);if(!grants.TryGetValue(wave,out var list)){list=new List<LastStandRewardGrant>();grants.Add(wave,list);}list.Add(grant);};
            foreach(var fitting in fittings)if(fitting!=null && fitting.Playable && fitting.UnlockTier==tier.Id) {
                add(fitting.UnlockWave,new LastStandRewardGrant(LastStandRewardKind.Fitting,fitting.Id));
            }
            var tierUnlockWaves=new HashSet<int>();
            foreach(var candidate in definitions)if(candidate.Playable && candidate.RequiredTier==tier.Id) {
                if(!tierUnlockWaves.Add(candidate.RequiredWave))throw new ArgumentException("Ambiguous tier unlock.");
                add(candidate.RequiredWave,new LastStandRewardGrant(LastStandRewardKind.Tier,candidate.Key,candidate.Id));
            }
            if(buildcraft&&tier.Id==1){
                add(25,new LastStandRewardGrant(LastStandRewardKind.ResearchLabs,"research-labs",1));
                add(100,new LastStandRewardGrant(LastStandRewardKind.ResearchLabs,"research-labs",2));
                add(500,new LastStandRewardGrant(LastStandRewardKind.CombatResearch,"combat-research"));
                add(750,new LastStandRewardGrant(LastStandRewardKind.EquipmentBays,"equipment-bays",2));
            }
            if(buildcraft&&tier.Id==2)add(500,new LastStandRewardGrant(LastStandRewardKind.ResearchLabs,"research-labs",3));
            var rows=new List<LastStandMilestone>();
            foreach(int wave in waves) {
                var rewards=new List<LastStandRewardGrant>{new LastStandRewardGrant(LastStandRewardKind.Salvage,"salvage",Math.Max(5,wave/2))};
                if(grants.TryGetValue(wave,out var extra))rewards.AddRange(extra);
                rows.Add(new LastStandMilestone(tier.Key,wave,rewards));
            }
            return rows.AsReadOnly();
        }
        public static LastStandWaveReward At(LastStandTierDefinition tier,int wave)
            =>At(tier,wave,LastStandRunEdition.Current);
        public static LastStandWaveReward At(LastStandTierDefinition tier,int wave,LastStandRunEdition edition)
        {
            if(wave<1)throw new ArgumentOutOfRangeException(nameof(wave));
            if(tier==null)throw new ArgumentNullException(nameof(tier));
            LastStandMilestone milestone=null;
            foreach(var row in Milestones(tier,edition.Tiers,edition.Fittings,edition.IsBuildcraft))if(row.Wave==wave){milestone=row;break;}
            // Depth makes a lower-tier farm valuable; higher tiers trade risk for a bounded multiplier.
            // Higher-tier premiums start beyond onboarding; repeatedly dying at
            // its first few waves must not beat an established lower-tier farm.
            int salvage=(int)Math.Min(1000000,1L+wave/100+(Math.Min(tier.Id,1000)-1L)*Math.Max(0L,(long)wave-100)/100);
            return new LastStandWaveReward(salvage,milestone);
        }
        public static LastStandMilestone NextMilestone(LastStandTierDefinition tier,int bestWave)
        {
            foreach(var row in Milestones(tier))if(row.Wave>bestWave)return row;
            return null;
        }
        public static LastStandEntitlements Entitlements(Func<int,int> bestWave)
        {
            if(bestWave==null)throw new ArgumentNullException(nameof(bestWave));
            var result=new LastStandEntitlements();
            foreach(var fitting in LastStandFittingCatalog.Definitions)if(fitting.Playable&&fitting.InitiallyUnlocked)
                result.Grant(new LastStandRewardGrant(LastStandRewardKind.Fitting,fitting.Id));
            foreach(var tier in LastStandTierCatalog.All){
                if(tier.Playable&&tier.RequiredTier==0)result.Grant(new LastStandRewardGrant(LastStandRewardKind.Tier,tier.Key,tier.Id));
                foreach(var milestone in Milestones(tier))if(bestWave(tier.Id)>=milestone.Wave)
                    foreach(var reward in milestone.Rewards)result.Grant(reward);
            }
            return result;
        }
    }
}
