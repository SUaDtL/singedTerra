using System;

namespace SingedTerra.LastStand
{
    // Versioned, immutable local prototype rules; independent of save and UI owners.
    public sealed class LastStandTierDefinition
    {
        public int Id { get; }
        public int GoalTicks { get; }
        public string EncounterProfileId { get; }
        internal LastStandTierDefinition(int id, int goal, string profile)
        { Id = id; GoalTicks = goal; EncounterProfileId = profile; }
    }

    public static class LastStandTierCatalog
    {
        public const string ProfileVersion = "tier-goals-v1";
        public const int HorizonTicks = 3600;
        static readonly LastStandTierDefinition First = new LastStandTierDefinition(1, 1200, "playable-prototype-v1");
        static readonly LastStandTierDefinition Second = new LastStandTierDefinition(2, 1800, "playable-prototype-tier2-v1");
        public static bool IsValid(int tier) => tier == 1 || tier == 2;
        public static LastStandTierDefinition Get(int tier)
        {
            if (!IsValid(tier)) throw new ArgumentOutOfRangeException(nameof(tier));
            return tier == 1 ? First : Second;
        }
        public static int EnemyHull(int tier, int baseHull)
        {
            Get(tier);
            if (baseHull < 1) throw new ArgumentOutOfRangeException(nameof(baseHull));
            return tier == 1 ? baseHull : checked((int)(((long)baseHull * 5 + 3) / 4));
        }
    }
}
