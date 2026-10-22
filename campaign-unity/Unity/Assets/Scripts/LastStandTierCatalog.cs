using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // Versioned, immutable local prototype rules; independent of save and UI owners.
    public sealed class LastStandTierDefinition
    {
        public int Id { get; }
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
          EnemyHullNumerator=numerator; EnemyHullDenominator=denominator;
          RequiredTier=requiredTier; RequiredTicks=requiredTicks; }
        public string LockReason => RequiredTier==0 ? "" : "Survive and save a " +
            (RequiredTicks/20) + "s Tier " + RequiredTier + " run to unlock.";
    }

    public static class LastStandTierCatalog
    {
        public const string ProfileVersion = "tier-goals-v1";
        public const int HorizonTicks = 3600;
        public static IReadOnlyList<LastStandTierDefinition> All { get; } = Array.AsReadOnly(new[] {
            new LastStandTierDefinition(1,1200,"playable-prototype-v1","sunlit-ash",1,1),
            new LastStandTierDefinition(2,1800,"playable-prototype-tier2-v1","iron-perimeter",5,4,1,1200) });
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
