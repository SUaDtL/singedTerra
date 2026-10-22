namespace SingedTerra.LastStand
{
    // Optional guidance never owns a save, tier choice, purchase or deployment.
    public sealed class LastStandGuidance
    {
        public string Tutorial { get; private set; } = "";
        public string Suggestion { get; private set; } = "";
        bool tips = true, suggestions = true;
        public void Configure(bool tutorialTips, bool purchaseSuggestions)
        {
            tips = tutorialTips; suggestions = purchaseSuggestions;
            if (!tips) Tutorial = "";
            if (!suggestions) Suggestion = "";
        }
        public void EnterFirstRun()
        { Tutorial = tips ? "Scrap buys upgrades for this run. Pause or use the speed controls at any time. Open Help for the full controls." : ""; }
        public void PurchaseConfirmed(LastStandUpgradeTrackId track, int priorLevel)
        {
            Suggestion = suggestions && track == LastStandUpgradeTrackId.CannonAttack && priorLevel == 0
                ? "Cannon Attack upgraded and saved. Try your upgrade on Tier 1; Tier 2 is harder." : "";
        }
        public void Dismiss() { Tutorial = Suggestion = ""; }
        public const string Help = "CONTROLS\nUse Pause/Resume or the minus and plus buttons. Speed changes in 0.5 steps: 0 is paused; 0.5x and 1x are available. Resume restores your last positive speed. Higher speeds need future research.\n\nYOUR RUN\nCombat advances automatically. Shop spends temporary Scrap earned from disabled enemies. Its upgrades end with the run. After defeat, press Claim to receive permanent Salvage. A limit result grants no Salvage.\n\nUPGRADES\nCannon Attack, Launcher Attack, Hull Capacity, Armor, Cannon Cycle and Field Repair each explain their next effect in the shop. Launcher and repair upgrades depend on your fitting.\n\nTIERS & SAVES\nA saved 60-second Tier 1 run unlocks Tier 2. Unfinished runs are lost when you leave or reload. Saved upgrades, personal bests and confirmed pending rewards remain in this browser. They do not sync with your account.\n\nPREFERENCES\nSettings has separate tutorial-tip and purchase-suggestion switches. Turning either off dismisses that optional guidance immediately. Essential save errors and confirmations stay visible.";
    }
    public static class LastStandNavigationPolicy
    {
        public static bool CanLeave(string saveState, bool catchingUp) => saveState == "ready" && !catchingUp;
        public static bool RequiresConfirmation(int activeRunId) => activeRunId != 0;
    }
}
