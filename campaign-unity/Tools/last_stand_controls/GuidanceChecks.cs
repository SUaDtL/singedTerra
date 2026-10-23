using System;
using SingedTerra.LastStand;

internal static class GuidanceChecks
{
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
    private static bool Contains(string actual, string expected) =>
        actual.IndexOf(expected, StringComparison.OrdinalIgnoreCase) >= 0;

    private static void GuidanceOptOutsDismissIndependently()
    {
        var guidance = new LastStandGuidance();
        guidance.EnterFirstRun();
        guidance.PurchaseConfirmed(LastStandUpgradeTrackId.CannonAttack, 0);
        Check(guidance.Tutorial != "" && guidance.Suggestion != "", "defaults admit optional guidance");
        guidance.Configure(false, true);
        Check(guidance.Tutorial == "" && guidance.Suggestion != "", "tips off immediately clears only tutorial");
        guidance.EnterFirstRun();
        Check(guidance.Tutorial == "", "disabled tutorial must stay absent at next run");
        guidance.Configure(true, false);
        Check(guidance.Suggestion == "", "suggestions off immediately clears existing cue");
        guidance.PurchaseConfirmed(LastStandUpgradeTrackId.CannonAttack, 0);
        Check(guidance.Suggestion == "", "disabled purchase suggestion must stay absent");
        guidance.EnterFirstRun();
        Check(guidance.Tutorial != "", "tutorial remains independently available");
        guidance.Configure(false, false);
        Check(guidance.Tutorial == "" && guidance.Suggestion == "", "both disabled clear visible prompts");
        guidance.Configure(true, true);
        Check(guidance.Tutorial == "" && guidance.Suggestion == "", "re-enable does not replay dismissed guidance");
    }

    private static void ConfirmedFirstCannonOnly()
    {
        var guidance = new LastStandGuidance();
        Check(guidance.Suggestion == "", "a new session cannot claim a confirmed upgrade");
        foreach (var track in LastStandUpgradeCatalog.Tracks)
        {
            for (int prior = 0; prior <= LastStandUpgradeCatalog.PermanentCap; prior++)
            {
                guidance.PurchaseConfirmed(track.Id, prior);
                bool expected = track.Id == LastStandUpgradeTrackId.CannonAttack && prior == 0;
                Check((guidance.Suggestion != "") == expected, "hint admission for " + track.Id + "/" + prior);
                if (expected)
                {
                    Check(Contains(guidance.Suggestion, "upgraded and saved"), "cue only describes confirmed save");
                    Check(Contains(guidance.Suggestion, "Tier 1") && Contains(guidance.Suggestion, "Tier 2 is harder"),
                        "first upgrade cue describes an optional comparison");
                }
            }
        }
        foreach (var track in new[] { (LastStandUpgradeTrackId)(-1), (LastStandUpgradeTrackId)99 })
        {
            guidance.PurchaseConfirmed(track, 0);
            Check(guidance.Suggestion == "", "invalid track cannot produce upgrade cue");
        }
        guidance.PurchaseConfirmed(LastStandUpgradeTrackId.CannonAttack, -1);
        Check(guidance.Suggestion == "", "invalid prior level cannot produce upgrade cue");
    }

    private static void DismissAndNewSessionDoNotRecreateSuggestion()
    {
        var guidance = new LastStandGuidance();
        guidance.EnterFirstRun();
        guidance.PurchaseConfirmed(LastStandUpgradeTrackId.CannonAttack, 0);
        guidance.Dismiss();
        Check(guidance.Tutorial == "" && guidance.Suggestion == "", "dismiss clears both optional owners");
        guidance.Configure(true, true);
        guidance.EnterFirstRun();
        Check(guidance.Suggestion == "", "redeploy cannot recreate a saved-upgrade cue");
        guidance = new LastStandGuidance();
        guidance.Configure(true, true);
        Check(guidance.Suggestion == "", "reload cannot reconstruct a past receipt");
    }

    private static void ExplicitHelpSurvivesOptOut()
    {
        var guidance = new LastStandGuidance();
        guidance.Configure(false, false);
        guidance.EnterFirstRun();
        guidance.PurchaseConfirmed(LastStandUpgradeTrackId.CannonAttack, 0);
        Check(guidance.Tutorial == "" && guidance.Suggestion == "", "setup disabled prompts");
        string help = LastStandGuidance.Help;
        foreach (string concept in new[] { "Pause/Resume", "0.5", "1x", "research", "Scrap", "Claim", "Salvage",
            "Cannon Attack", "Launcher Attack", "Hull Capacity", "Armor", "Cannon Cycle", "Field Repair", "Scattergun Attack",
            "Tier 2", "checkpoint", "roll back together", "starts paused", "reload", "does not sync with your account", "Essential save errors" })
            Check(Contains(help, concept), "explicit Help lost required concept: " + concept);
        Check(!LastStandNavigationPolicy.CanLeave("blocked", false), "guidance off cannot hide save refusal");
        Check(LastStandNavigationPolicy.RequiresAbandonConfirmation(1), "guidance off cannot remove destructive abandonment confirmation");
    }

    private static void NavigationRequiresReadyNoncatchup()
    {
        Check(LastStandNavigationPolicy.CanLeave("ready", false), "saved idle state can leave");
        Check(!LastStandNavigationPolicy.CanLeave("ready", true), "catchup cannot abandon unprocessed time");
        foreach (string state in new[] { "save-error", null, "", "blocked", "not-saved", "pending", "failed", "READY" })
        {
            Check(!LastStandNavigationPolicy.CanLeave(state, false), "unconfirmed save must remain: " + state);
            Check(!LastStandNavigationPolicy.CanLeave(state, true), "save failure plus catchup must remain: " + state);
        }
    }

    private static void NavigationConfirmationTracksActiveRun()
    {
        Check(!LastStandNavigationPolicy.RequiresAbandonConfirmation(0), "no active run does not require abandonment");
        foreach (int run in new[] { 1, 2, 500, int.MaxValue })
        {
            Check(!LastStandNavigationPolicy.RequiresConfirmation(run), "ordinary navigation keeps checkpoint without destructive confirmation: " + run);
            Check(LastStandNavigationPolicy.RequiresAbandonConfirmation(run), "active run abandonment requires confirmation: " + run);
        }
        Check(LastStandNavigationPolicy.RequiresAbandonConfirmation(-1), "unknown nonzero destructive state must fail safely");
    }

    public static int Main(string[] args)
    {
        try
        {
            switch (args[0])
            {
                case "guidance_opt_outs_dismiss_independently": GuidanceOptOutsDismissIndependently(); break;
                case "confirmed_first_cannon_only": ConfirmedFirstCannonOnly(); break;
                case "dismiss_and_new_session_do_not_recreate_suggestion": DismissAndNewSessionDoNotRecreateSuggestion(); break;
                case "explicit_help_survives_opt_out": ExplicitHelpSurvivesOptOut(); break;
                case "navigation_requires_ready_noncatchup": NavigationRequiresReadyNoncatchup(); break;
                case "navigation_confirmation_tracks_active_run": NavigationConfirmationTracksActiveRun(); break;
                default: throw new Exception("Unknown case " + args[0]);
            }
            Console.WriteLine("PASS " + args[0]); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
