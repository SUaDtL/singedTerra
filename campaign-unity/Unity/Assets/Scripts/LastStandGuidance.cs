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
        public static string Help => "CONTROLS\nUse Pause/Resume or minus and plus. Speed changes in 0.5 steps: 0 is paused; 0.5x and 1x are available. Resume restores your last positive speed. Game Speed research unlocks higher speeds, up to 5x.\n\nWAVES & REWARDS\nDefeat every enemy in the wave. Each clear saves repeatable Salvage and any first-clear milestone bonus or unlock. See Wave Milestones in Menu. New runs have no separate defeat payout or Claim step. Older saved rewards can still be claimed once.\n\nCHECKPOINTS\nA starting checkpoint is saved before wave 1. Each clear saves hull, Scrap, upgrades and cooldowns. Return or reload keeps the last confirmed checkpoint; partial-wave purchases and spending roll back together. Resume waits for you and starts paused. Closed-tab time does not advance combat. An open hidden tab can keep progressing and saving waves. Failed saves stop combat until Retry succeeds.\n\nTIERS & FITTINGS\nThe next locked tier shows its required wave. Earning it never selects it or ends your current farm. Open Wave Milestones for the current tier roadmap. "+LastStandMilestonePresentation.FittingRoadmap+" New Run or Abandon needs confirmation when a checkpoint exists. Completed rewards are kept.\n\nUPGRADES\nRun upgrades spend Scrap; permanent upgrades spend banked Salvage. Cannon Attack, Launcher Attack, Scattergun Attack, Mortar Payload and Railgun Damage increase the matching weapon damage. Hull Capacity raises maximum hull, Armor reduces incoming damage, Cannon Cycle shortens the firing interval, and Field Repair restores more hull. Each card describes its next effect. Permanent purchases do not change an existing checkpoint's deployment stats.\n\nLOCAL SAVES & PREFERENCES\nProgress stays in this browser and does not sync with your account. Use one active Last Stand tab. Settings has separate tutorial and purchase-suggestion switches. Essential save errors and confirmations remain visible.";

    }
    public static class LastStandNavigationPolicy
    {
        public static bool CanLeave(string saveState, bool catchingUp) => saveState == "ready" && !catchingUp;
        public static bool RequiresConfirmation(int activeRunId) => false;
        public static bool RequiresAbandonConfirmation(int activeRunId) => activeRunId != 0;
    }
}
