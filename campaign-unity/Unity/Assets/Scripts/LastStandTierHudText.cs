using System;
using System.Globalization;

namespace SingedTerra.LastStand
{
    // Formatting only: saved records and run identity remain with progression.
    public static class LastStandTierHudText
    {
        const int TicksPerSecond = 20;
        public static string Seconds(int ticks) => (ticks / (float)TicksPerSecond).ToString("F1", CultureInfo.InvariantCulture);
        public static string Goal(int tier) => "Tier " + tier + " / Goal " + (LastStandTierCatalog.Get(tier).GoalTicks / TicksPerSecond) + "s";
        public static string Best(int ticks, int kills) => ticks == 0 && kills == 0 ? "Best: no saved run" :
            "Best " + Seconds(ticks) + "s / " + kills + " disabled";
        public static string Progress(int tier, int ticks) => "T" + tier + " " + ticks / TicksPerSecond + "/" +
            LastStandTierCatalog.Get(tier).GoalTicks / TicksPerSecond + "s";
        public static bool GoalMet(int tier, int ticks) => ticks >= LastStandTierCatalog.Get(tier).GoalTicks;
        public static string LockReason => "T2 locked: save a finished 60s T1 run.";
        public static string Improvements(bool time, bool kills) => time && kills ? "New best: time + disabled" :
            time ? "New best survival time" : kills ? "New best disabled count" : "No new personal best";
        public static string Result(int tier, bool limit, int ticks, int kills, int reward, int wallet,
            bool saved, bool newTime, bool newKills, bool unlocked)
        {
            string identity = tier == 0 ? "Legacy run" : "Tier " + tier;
            string improvements = unlocked ?
                (newTime || newKills ? "New best: " + (newTime && newKills ? "time+disabled" : newTime ? "time" : "disabled") : "No new best") + "; T2 unlocked" :
                Improvements(newTime,newKills);
            return identity + " / " + Seconds(ticks) + "s / " + kills + " disabled" +
                "\n" + (saved ? "Earned salvage  " : "Pending salvage  ") + reward + (limit ? " / No victory" : "") +
                "\nWallet  " + wallet + " salvage" +
                "\n" + (saved ? (tier == 0 ? "Legacy result: no tier credit" : improvements) : "Waiting for save confirmation") +
                "\n" + (reward == 0 ? "Continue to the workshop." : "Claim to enter the workshop.");
        }
    }
}
