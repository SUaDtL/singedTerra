using System;
using System.Globalization;

namespace SingedTerra.LastStand
{
    // Formatting only: saved records and run identity remain with progression.
    public static class LastStandTierHudText
    {
        const int TicksPerSecond = 20;
        public static string Seconds(int ticks) => (ticks / (float)TicksPerSecond).ToString("F1", CultureInfo.InvariantCulture);
        public static string Goal(int tier) => "Tier " + tier + " / Clear every enemy to advance";
        public static string WaveBest(int wave) => wave==0 ? "Best: no completed wave" : "Best: wave "+wave;
        public static string WaveReceipt(int wave,int salvage,bool firstClear,string unlockedFitting,int unlockedTier)
            =>LastStandMilestonePresentation.ConfirmedReceipt(wave,salvage,firstClear,unlockedFitting,unlockedTier);
        public static string NextMilestone(int tier,int wave)
            =>LastStandMilestonePresentation.NextGoal(tier,wave);
        public static string WaveProgress(int tier,int wave,int remaining)=>"T"+tier+" / WAVE "+wave+" / "+remaining+" LEFT";
        public static string Best(int ticks, int kills) => ticks == 0 && kills == 0 ? "Best: no saved run" :
            "Legacy best " + Seconds(ticks) + "s / " + kills + " disabled";
        public static string Progress(int tier, int wave) => "T" + tier + " / WAVE " + wave;
        public static bool GoalMet(int tier, int completedWave)
        {
            foreach(var next in LastStandTierCatalog.All)
                if(next.Playable && next.RequiredTier==tier)return completedWave>=next.RequiredWave;
            return false;
        }
        public static string BattleHeading(int tier, int wave) => "CLEAR WAVE " + wave;
        public static string LockReason => LastStandTierCatalog.Get(2).LockReason;
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
