using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public enum LastStandResearchTrackId { GameSpeed, SalvageRecovery, ResearchSpeed, ScrapLogistics }

    // Original calibration seeds. Costs compete with Workshop spending from the
    // profile's single Salvage balance; this catalog does not own a wallet.
    public static class LastStandResearchCatalog
    {
        public const string Version = "research-v1";
        public const int TrackCount = 4, SlotCount = 2, MultiplierDenominator = 100;
        public static IReadOnlyList<LastStandResearchDefinition> Tracks { get; } = Array.AsReadOnly(new[]
        {
            new LastStandResearchDefinition(LastStandResearchTrackId.GameSpeed, "gameSpeed", "Game Speed", 8),
            new LastStandResearchDefinition(LastStandResearchTrackId.SalvageRecovery, "salvageRecovery", "Salvage Recovery", 100),
            new LastStandResearchDefinition(LastStandResearchTrackId.ResearchSpeed, "researchSpeed", "Research Speed", 100),
            new LastStandResearchDefinition(LastStandResearchTrackId.ScrapLogistics, "scrapLogistics", "Scrap Logistics", 100)
        });
        public static bool IsTrack(LastStandResearchTrackId id) => (int)id >= 0 && (int)id < TrackCount;
        public static LastStandResearchDefinition Get(LastStandResearchTrackId id)
        {
            if (!IsTrack(id)) throw new ArgumentOutOfRangeException(nameof(id));
            return Tracks[(int)id];
        }
        public static bool TryGet(string key, out LastStandResearchDefinition definition)
        {
            foreach (var candidate in Tracks)
                if (String.Equals(candidate.Key, key, StringComparison.Ordinal)) { definition = candidate; return true; }
            definition = null; return false;
        }
        public static int UnlockedSlots(int bestTierOneWave) => bestTierOneWave >= 100 ? 2 : bestTierOneWave >= 25 ? 1 : 0;

        // Fractional carry is owned by the caller's profile or wave checkpoint.
        // On overflow or malformed input neither payout nor carry is exposed.
        public static bool TryMultiplyReward(long amount, int rank, int priorCarry, out long payout, out int nextCarry)
        {
            payout = 0; nextCarry = priorCarry;
            if (amount < 0 || rank < 0 || rank > 100 || priorCarry < 0 || priorCarry >= MultiplierDenominator) return false;
            try
            {
                long scaled = checked(amount * (100L + 2L * rank) + priorCarry);
                payout = scaled / MultiplierDenominator; nextCarry = (int)(scaled % MultiplierDenominator); return true;
            }
            catch (OverflowException) { return false; }
        }
    }

    public sealed class LastStandResearchDefinition
    {
        static readonly long[] SpeedCosts = { 20, 60, 180, 500, 1500, 4500, 12000, 30000 };
        static readonly long[] SpeedMinutes = { 10, 60, 360, 1440, 4320, 10080, 14400, 20160 };
        public LastStandResearchTrackId Id { get; }
        public string Key { get; }
        public string Name { get; }
        public int MaximumRank { get; }
        internal LastStandResearchDefinition(LastStandResearchTrackId id, string key, string name, int maximumRank)
        { Id = id; Key = key; Name = name; MaximumRank = maximumRank; }
        void ValidateRank(int rank)
        { if (rank < 1 || rank > MaximumRank) throw new ArgumentOutOfRangeException(nameof(rank)); }
        public long Cost(int rank)
        {
            ValidateRank(rank); long r = rank;
            if (Id == LastStandResearchTrackId.GameSpeed) return SpeedCosts[rank - 1];
            if (Id == LastStandResearchTrackId.SalvageRecovery) return checked(25 * r + 2 * r * r + r * r * r / 10);
            if (Id == LastStandResearchTrackId.ScrapLogistics) return checked(20 * r + r * r + r * r * r / 20);
            return checked(15 * r + 2 * r * r + r * r * r / 12);
        }
        public long BaseDurationMilliseconds(int rank)
        {
            ValidateRank(rank); long r = rank;
            if (Id == LastStandResearchTrackId.GameSpeed) return checked(SpeedMinutes[rank - 1] * 60000);
            // Three independent ladders, with later stages crossing hours/days.
            long minutes = Id == LastStandResearchTrackId.SalvageRecovery ? 15 * r + 3 * r * r + r * r * r / 20 :
                Id == LastStandResearchTrackId.ScrapLogistics ? 10 * r + 2 * r * r + r * r * r / 25 :
                20 * r + 4 * r * r + r * r * r / 15;
            return checked(minutes * 60000);
        }
        public long DurationMilliseconds(int rank, int researchSpeedRank)
        {
            if (researchSpeedRank < 0 || researchSpeedRank > 100) throw new ArgumentOutOfRangeException(nameof(researchSpeedRank));
            long duration = BaseDurationMilliseconds(rank);
            if (Id == LastStandResearchTrackId.ResearchSpeed) return duration;
            long denominator = 100 + 2L * researchSpeedRank;
            return checked((duration * 100 + denominator - 1) / denominator);
        }
        public int EffectNumerator(int rank)
        {
            if (rank < 0 || rank > MaximumRank) throw new ArgumentOutOfRangeException(nameof(rank));
            return Id == LastStandResearchTrackId.GameSpeed ? 100 + 50 * rank : 100 + 2 * rank;
        }
    }
}
