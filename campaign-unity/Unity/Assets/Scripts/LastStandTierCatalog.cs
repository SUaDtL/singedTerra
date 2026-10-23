using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // Versioned, immutable local prototype rules; independent of save and UI owners.
    public sealed class LastStandTierDefinition
    {
        public int Id { get; }
        public string Key { get; }
        public int RequiredWave { get; }
        public int GoalTicks { get; }
        public string EncounterProfileId { get; }
        public string EnvironmentId { get; }
        public int RequiredTier { get; }
        public int RequiredTicks { get; }
        public int EnemyHullNumerator { get; }
        public int EnemyHullDenominator { get; }
        internal LastStandTierDefinition(int id, int goal, string profile, string environment,
            int numerator, int denominator, int requiredTier=0, int requiredTicks=0)
        { Id=id; GoalTicks=goal; EncounterProfileId=profile; EnvironmentId=environment;
          Key="tier-"+id; RequiredWave=requiredTier==0?0:300;
          EnemyHullNumerator=numerator; EnemyHullDenominator=denominator;
          RequiredTier=requiredTier; RequiredTicks=requiredTicks; }
        public LastStandTierDefinition(int id, string key, string profile, string environment,
            int numerator, int denominator, int requiredTier=0, int requiredWave=0)
        {
            if(id<1 || String.IsNullOrWhiteSpace(key) || String.IsNullOrWhiteSpace(profile) ||
                String.IsNullOrWhiteSpace(environment) || numerator<1 || denominator<1 ||
                requiredTier<0 || requiredTier==id || requiredWave<0 || (requiredTier==0)!=(requiredWave==0))
                throw new ArgumentException("Invalid tier definition.");
            Id=id;Key=key;EncounterProfileId=profile;EnvironmentId=environment;
            EnemyHullNumerator=numerator;EnemyHullDenominator=denominator;
            RequiredTier=requiredTier;RequiredWave=requiredWave;
        }
        public string LockReason => RequiredTier==0 ? "" : "Clear wave " + RequiredWave +
            " in Tier " + RequiredTier + " to unlock.";
    }

    public static class LastStandTierCatalog
    {
        public const string LegacyProfileVersion = "tier-goals-v1";
        public const int LegacyHorizonTicks = 3600;
        // Retained solely for old time/kill records and their migration parser.
        public const string ProfileVersion = LegacyProfileVersion;
        public const int HorizonTicks = LegacyHorizonTicks;
        public static IReadOnlyList<LastStandTierDefinition> All { get; } = Array.AsReadOnly(new[] {
            new LastStandTierDefinition(1,1200,"playable-prototype-v1","sunlit-ash",1,1),
            new LastStandTierDefinition(2,1800,"playable-prototype-tier2-v1","iron-perimeter",5,4,1,1200) });
        public static void Validate(IReadOnlyList<LastStandTierDefinition> definitions)
        {
            if(definitions==null || definitions.Count==0) throw new ArgumentException("A catalog requires tiers.");
            var ids=new HashSet<int>();var keys=new HashSet<string>(StringComparer.Ordinal);
            foreach(var tier in definitions)
                if(tier==null || !ids.Add(tier.Id) || !keys.Add(tier.Key)) throw new ArgumentException("Duplicate or missing tier identity.");
            foreach(var tier in definitions)
            {
                var visited=new HashSet<int>();var current=tier;
                while(current.RequiredTier!=0)
                {
                    if(!visited.Add(current.Id) || !ids.Contains(current.RequiredTier)) throw new ArgumentException("Invalid tier prerequisite chain.");
                    LastStandTierDefinition parent=null;
                    foreach(var row in definitions) if(row.Id==current.RequiredTier) {parent=row;break;}
                    current=parent;
                }
            }
        }
        public static IReadOnlyList<LastStandTierDefinition> Visible(IReadOnlyList<LastStandTierDefinition> definitions, Func<int,bool> unlocked)
        {
            Validate(definitions);
            if(unlocked==null)throw new ArgumentNullException(nameof(unlocked));
            var visible=new List<LastStandTierDefinition>();bool preview=false;
            foreach(var tier in definitions)
                if(unlocked(tier.Id))visible.Add(tier);
                else if(!preview){visible.Add(tier);preview=true;}
            return visible.AsReadOnly();
        }
        public static bool IsValid(int tier)
        { foreach(var definition in All) if(definition.Id==tier)return true;return false; }
        public static LastStandTierDefinition Get(int tier)
        {
            foreach(var definition in All) if(definition.Id==tier)return definition;
            throw new ArgumentOutOfRangeException(nameof(tier));
        }
        public static int EnemyHull(int tier, int baseHull)
        {
            var definition=Get(tier);
            if (baseHull < 1) throw new ArgumentOutOfRangeException(nameof(baseHull));
            return checked((int)(((long)baseHull * definition.EnemyHullNumerator + definition.EnemyHullDenominator-1) / definition.EnemyHullDenominator));
        }
    }
}
