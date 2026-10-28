using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public sealed class LastStandMilestone
    {
        public string Id { get; }
        public int Wave { get; }
        public int FirstClearSalvage { get; }
        public int UnlockTierId { get; }
        public string UnlockFittingId { get; }
        internal LastStandMilestone(string tierKey,int wave,int salvage,int unlockTier=0,string fitting=null)
        {Id=tierKey+":wave-"+wave;Wave=wave;FirstClearSalvage=salvage;UnlockTierId=unlockTier;UnlockFittingId=fitting;}
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
            => Milestones(tier,definitions,LastStandFittingCatalog.Definitions);
        public static IReadOnlyList<LastStandMilestone> Milestones(LastStandTierDefinition tier,IReadOnlyList<LastStandTierDefinition> definitions,
            IReadOnlyList<LastStandFittingDefinition> fittings)
        {
            if(tier==null)throw new ArgumentNullException(nameof(tier));
            LastStandTierCatalog.Validate(definitions);
            var waves=new SortedSet<int>(milestoneWaves);
            var unlocks=new Dictionary<int,int>();
            if(fittings==null)throw new ArgumentNullException(nameof(fittings));
            var fittingUnlocks=new Dictionary<int,string>();
            foreach(var fitting in fittings)if(fitting!=null && fitting.UnlockTier==tier.Id) {
                if(fittingUnlocks.ContainsKey(fitting.UnlockWave))throw new ArgumentException("One milestone can unlock only one fitting.");
                waves.Add(fitting.UnlockWave);fittingUnlocks.Add(fitting.UnlockWave,fitting.Id);
            }
            foreach(var candidate in definitions)if(candidate.RequiredTier==tier.Id) {
                if(unlocks.ContainsKey(candidate.RequiredWave))throw new ArgumentException("One milestone can unlock only one tier.");
                waves.Add(candidate.RequiredWave);unlocks.Add(candidate.RequiredWave,candidate.Id);
            }
            var rows=new List<LastStandMilestone>();
            foreach(int wave in waves) {
                unlocks.TryGetValue(wave,out int unlock);
                fittingUnlocks.TryGetValue(wave,out string fitting);
                rows.Add(new LastStandMilestone(tier.Key,wave,Math.Max(5,wave/2),unlock,fitting));
            }
            return rows.AsReadOnly();
        }
        public static LastStandWaveReward At(LastStandTierDefinition tier,int wave)
        {
            if(wave<1)throw new ArgumentOutOfRangeException(nameof(wave));
            if(tier==null)throw new ArgumentNullException(nameof(tier));
            LastStandMilestone milestone=null;
            foreach(var row in Milestones(tier))if(row.Wave==wave){milestone=row;break;}
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
    }
}
