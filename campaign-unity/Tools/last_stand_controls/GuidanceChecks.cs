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

    private static LastStandGuidanceContext Context(bool saveReady = true, bool inBattle = false,
        bool checkpoint = false, int nextRun = 1, int bestWave = 0, bool invested = false,
        bool researched = false, bool canInvest = false, bool idleLab = false, bool canResearch = false) =>
        new LastStandGuidanceContext(saveReady, inBattle, checkpoint, nextRun, bestWave,
            invested, researched, canInvest, idleLab, canResearch);

    private static void ContextGuidanceFollowsConfirmedProgress()
    {
        var guidance = new LastStandGuidance();
        var fresh = guidance.NextAction(Context());
        Check(fresh != null && fresh.Id == "first-deployment" && fresh.Destination == "help",
            "fresh profile receives a controls link, not an automatic deploy");
        var returning = guidance.NextAction(Context(checkpoint: true, nextRun: 4, bestWave: 22));
        Check(returning != null && returning.Id == "resume-checkpoint" && returning.TopicId == "checkpoints",
            "saved checkpoint takes precedence over another run or purchase");
        Check(guidance.NextAction(Context(nextRun: 4, bestWave: 22)) == null,
            "a mature profile with no recommended action gets no first-run prompt");
        Check(guidance.NextAction(Context(nextRun: 1, researched: true)) == null,
            "research experience prevents reconstructed first-run guidance");
        Check(guidance.NextAction(Context(nextRun: 1, invested: true)) == null,
            "permanent investment prevents reconstructed first-run guidance");
        var investment = guidance.NextAction(Context(nextRun: 3, bestWave: 4, canInvest: true));
        Check(investment != null && investment.Id == "permanent-investment" && investment.Destination == "workshop",
            "first affordable permanent investment opens the existing Workshop");
        Check(guidance.NextAction(Context(nextRun: 3, bestWave: 4, invested: true, canInvest: true)) == null,
            "the first-investment prompt stops after any permanent investment");
        var unlock = guidance.NextAction(Context(nextRun: 3, bestWave: 25));
        Check(unlock != null && unlock.Id == "research-unlocked" && unlock.Destination == "research",
            "new research access has an explicit route even before funding");
        var idle = guidance.NextAction(Context(nextRun: 7, bestWave: 100, invested: true,
            researched: true, idleLab: true, canResearch: true));
        Check(idle != null && idle.Id == "idle-lab" && idle.IsPurchaseSuggestion,
            "an idle lab with an affordable action becomes a purchase suggestion");
        Check(guidance.NextAction(Context(nextRun: 7, bestWave: 100, researched: true,
            idleLab: true, canResearch: false)) == null, "unaffordable research is not offered as ready to start");
        Check(guidance.NextAction(Context(nextRun: 7, bestWave: 24, researched: true,
            idleLab: true, canResearch: true)) == null, "inconsistent caller flags cannot unlock a locked lab");
    }

    private static void ContextGuidanceOptOutsAndDismissal()
    {
        var guidance = new LastStandGuidance();
        var first = Context();
        var investment = Context(nextRun: 3, bestWave: 4, canInvest: true);
        var idle = Context(nextRun: 7, bestWave: 100, researched: true, idleLab: true, canResearch: true);
        guidance.Configure(false, true);
        Check(guidance.NextAction(first) == null, "tutorial switch suppresses fresh-run guidance");
        Check(guidance.NextAction(investment) != null && guidance.NextAction(idle) != null,
            "purchase suggestions remain independently enabled");
        guidance.Configure(true, false);
        Check(guidance.NextAction(first) != null, "tutorial guidance remains independently enabled");
        Check(guidance.NextAction(investment) == null && guidance.NextAction(idle) == null,
            "purchase opt-out suppresses spending suggestions");
        guidance.Configure(true, true);
        guidance.DismissContext("first-deployment");
        Check(guidance.NextAction(first) == null, "dismissed context does not immediately reappear on refresh");
        guidance.Configure(false, false); guidance.Configure(true, true);
        Check(guidance.NextAction(first) == null, "toggling preferences does not replay a dismissed context");
        Check(guidance.NextAction(investment) != null, "dismissal is scoped to the selected context");
        var reloaded = new LastStandGuidance(); reloaded.Configure(false, false);
        Check(reloaded.NextAction(first) == null && reloaded.NextAction(investment) == null,
            "reapplied saved opt-outs suppress guidance after reload");
    }

    private static void ContextGuidanceIsReadOnlyAndFailClosed()
    {
        var guidance = new LastStandGuidance();
        var context = Context(nextRun: 3, bestWave: 25);
        var before = guidance.NextAction(context);
        Check(before != null, "newly unlocked research has a stable context action");
        for (int repeat = 0; repeat < 10; repeat++)
        {
            var next = guidance.NextAction(context);
            Check(next.Id == before.Id && next.Body == before.Body && next.Label == before.Label,
                "repeated projection is stable and does not consume or advance progress");
        }
        Check(guidance.Tutorial == "" && guidance.Suggestion == "", "context projection does not invent event receipts");
        Check(context.NextRunId == 3 && context.BestTierOneWave == 25 && !context.HasResearchExperience,
            "the immutable input remains unchanged");
        Check(guidance.NextAction(null) == null, "missing context does not produce advice");
        Check(guidance.NextAction(Context(saveReady: false)) == null, "save errors own the primary message");
        Check(guidance.NextAction(Context(inBattle: true)) == null, "context hints do not interrupt active combat");
        Check(guidance.NextAction(Context(nextRun: 0)) == null, "unloaded profile does not look like a new game");
        Check(guidance.NextAction(Context(bestWave: -1)) == null, "invalid progress fails closed");
    }

    private static void HelpTopicsAreOrderedAndAvailable()
    {
        string[] ids = { "controls", "waves", "checkpoints", "tiers", "upgrades", "research", "saves" };
        var topics = LastStandGuidance.HelpTopics;
        Check(topics.Count == ids.Length, "seven focused Help topics");
        for (int i = 0; i < ids.Length; i++)
        {
            var topic = topics[i];
            Check(topic.Id == ids[i] && topic.Title.Length > 0 && topic.Body.Length > 0,
                "stable topic ordering and nonempty player content");
            Check(Object.ReferenceEquals(topic, LastStandGuidance.HelpTopic(ids[i])), "topic lookup retains the shared owner");
            Check(topic.Destination == "" || topic.Destination == "settings" || topic.Destination == "milestones" ||
                topic.Destination == "workshop" || topic.Destination == "research" || topic.Destination == "data",
                "help links only address existing feature owners");
            Check((topic.Destination.Length == 0) == (topic.ActionLabel.Length == 0), "links have meaningful labels");
        }
        Check(LastStandGuidance.HelpTopic(null) == null && LastStandGuidance.HelpTopic("unknown") == null,
            "unknown topics do not silently select another page");
        var guidance = new LastStandGuidance(); guidance.Configure(false, false);
        Check(LastStandGuidance.HelpTopics.Count == 7, "explicit Help remains available with all tips disabled");
        Check(Contains(LastStandGuidance.HelpTopic("research").Body, "real time") &&
            Contains(LastStandGuidance.HelpTopic("research").Body, "Salvage"), "research explains its clock and currency");
        string saves = LastStandGuidance.HelpTopic("saves").Body;
        Check(Contains(saves, "backup") && Contains(saves, "Replace save") && Contains(saves, "garage") &&
            Contains(saves, "preferences") && Contains(saves, "does not sync"), "backup help states the replacement and portability boundary");
        Check(Contains(LastStandGuidance.HelpTopic("checkpoints").Body, "starts paused") &&
            Contains(LastStandGuidance.HelpTopic("checkpoints").Body, "roll back together"), "checkpoint help retains recovery semantics");
        var list = topics as System.Collections.Generic.IList<LastStandHelpTopic>;
        Check(list != null && list.IsReadOnly, "callers cannot reorder the shared topic catalog");
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
                case "context_guidance_follows_confirmed_progress": ContextGuidanceFollowsConfirmedProgress(); break;
                case "context_guidance_opt_outs_and_dismissal": ContextGuidanceOptOutsAndDismissal(); break;
                case "context_guidance_is_read_only_and_fail_closed": ContextGuidanceIsReadOnlyAndFailClosed(); break;
                case "help_topics_are_ordered_and_available": HelpTopicsAreOrderedAndAvailable(); break;
                default: throw new Exception("Unknown case " + args[0]);
            }
            Console.WriteLine("PASS " + args[0]); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
