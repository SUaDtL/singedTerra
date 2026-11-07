using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // Values supplied by the current projection owners, never a live transaction.
    public sealed class LastStandGuidanceContext
    {
        public bool SaveReady { get; }
        public bool InBattle { get; }
        public bool HasCheckpoint { get; }
        public int NextRunId { get; }
        public int BestTierOneWave { get; }
        public bool HasPermanentInvestment { get; }
        public bool HasResearchExperience { get; }
        public bool CanAffordPermanentUpgrade { get; }
        public bool HasIdleLab { get; }
        public bool CanStartResearch { get; }
        public LastStandGuidanceContext(bool saveReady, bool inBattle, bool hasCheckpoint,
            int nextRunId, int bestTierOneWave, bool hasPermanentInvestment,
            bool hasResearchExperience, bool canAffordPermanentUpgrade, bool hasIdleLab, bool canStartResearch)
        {
            SaveReady=saveReady;InBattle=inBattle;HasCheckpoint=hasCheckpoint;
            NextRunId=nextRunId;BestTierOneWave=bestTierOneWave;
            HasPermanentInvestment=hasPermanentInvestment;HasResearchExperience=hasResearchExperience;
            CanAffordPermanentUpgrade=canAffordPermanentUpgrade;HasIdleLab=hasIdleLab;CanStartResearch=canStartResearch;
        }
    }
    public sealed class LastStandGuidanceAction
    {
        public string Id { get; }
        public string TopicId { get; }
        public string Destination { get; }
        public string Label { get; }
        public string Body { get; }
        public bool IsPurchaseSuggestion { get; }
        internal LastStandGuidanceAction(string id,string topic,string destination,string label,string body,bool purchase=false)
        {Id=id;TopicId=topic;Destination=destination;Label=label;Body=body;IsPurchaseSuggestion=purchase;}
    }
    public sealed class LastStandHelpTopic
    {
        public string Id { get; }
        public string Title { get; }
        public string Body { get; }
        public string Destination { get; }
        public string ActionLabel { get; }
        internal LastStandHelpTopic(string id,string title,string body,string destination="",string actionLabel="")
        {Id=id;Title=title;Body=body;Destination=destination;ActionLabel=actionLabel;}
    }
    // Optional guidance never owns a save, tier choice, purchase or deployment.
    public sealed class LastStandGuidance
    {
        public string Tutorial { get; private set; } = "";
        public string Suggestion { get; private set; } = "";
        bool tips = true, suggestions = true;
        readonly HashSet<string> dismissedContexts = new HashSet<string>(StringComparer.Ordinal);
        static readonly LastStandGuidanceAction FirstDeployment = new LastStandGuidanceAction(
            "first-deployment","controls","help","LEARN THE CONTROLS",
            "Choose a tier and fitting, then Deploy. Your starting checkpoint is saved before wave 1. You can pause at any time.");
        static readonly LastStandGuidanceAction ResumeCheckpoint = new LastStandGuidanceAction(
            "resume-checkpoint","checkpoints","help","HOW RESUME WORKS",
            "Your last confirmed wave checkpoint is ready. Resume Run restores it paused, so you choose when combat continues.");
        static readonly LastStandGuidanceAction ResearchUnlocked = new LastStandGuidanceAction(
            "research-unlocked","research","research","OPEN RESEARCH LAB",
            "Your first Lab is unlocked. Select a project to see its benefit, Salvage cost and real-time duration before starting it.");
        static readonly LastStandGuidanceAction IdleLab = new LastStandGuidanceAction(
            "idle-lab","research","research","CHOOSE RESEARCH",
            "A Lab is idle and you can afford a project. Open Research to choose how to spend your Salvage.",true);
        static readonly LastStandGuidanceAction PermanentInvestment = new LastStandGuidanceAction(
            "permanent-investment","upgrades","workshop","VIEW PERMANENT UPGRADES",
            "You can afford a permanent upgrade. These use Salvage and strengthen future runs; an existing checkpoint keeps its deployment stats.",true);
        LastStandGuidanceAction Admit(LastStandGuidanceAction action) =>
            (action.IsPurchaseSuggestion ? suggestions : tips) && !dismissedContexts.Contains(action.Id) ? action : null;
        public LastStandGuidanceAction NextAction(LastStandGuidanceContext context)
        {
            if(context==null || !context.SaveReady || context.InBattle || context.NextRunId<1 || context.BestTierOneWave<0)return null;
            LastStandGuidanceAction action;
            if(context.HasCheckpoint && (action=Admit(ResumeCheckpoint))!=null)return action;
            bool fresh=!context.HasCheckpoint && context.NextRunId==1 && context.BestTierOneWave==0 &&
                !context.HasPermanentInvestment && !context.HasResearchExperience;
            if(fresh && (action=Admit(FirstDeployment))!=null)return action;
            bool unlocked=LastStandResearchCatalog.UnlockedSlots(context.BestTierOneWave)>0;
            if(unlocked && !context.HasResearchExperience && (action=Admit(ResearchUnlocked))!=null)return action;
            if(unlocked && context.HasIdleLab && context.CanStartResearch && (action=Admit(IdleLab))!=null)return action;
            if(!context.HasPermanentInvestment && context.CanAffordPermanentUpgrade)return Admit(PermanentInvestment);
            return null;
        }
        public void DismissContext(string id)
        {
            if(id==FirstDeployment.Id || id==ResumeCheckpoint.Id || id==ResearchUnlocked.Id ||
                id==IdleLab.Id || id==PermanentInvestment.Id) dismissedContexts.Add(id);
        }
        public static IReadOnlyList<LastStandHelpTopic> HelpTopics { get; } =
            Array.AsReadOnly(new[] {
                new LastStandHelpTopic("controls","Controls & game speed",ControlsHelp,"settings","OPEN SETTINGS"),
                new LastStandHelpTopic("waves","Waves & rewards",WavesHelp,"milestones","VIEW WAVE MILESTONES"),
                new LastStandHelpTopic("checkpoints","Returning to your run",CheckpointsHelp,"data","OPEN SAVE SETTINGS"),
                new LastStandHelpTopic("tiers","Tiers & fittings",TiersHelp,"milestones","VIEW WAVE MILESTONES"),
                new LastStandHelpTopic("upgrades","Run & permanent upgrades",UpgradesHelp,"workshop","VIEW PERMANENT UPGRADES"),
                new LastStandHelpTopic("research","Using the Research Lab",
                    "Labs unlock through Tier 1 wave progress. Open Research, select a project, then review its next benefit, Salvage cost and duration. Choose Start Research in an idle Lab when ready.\n\n"+
                    "Research and permanent Workshop upgrades use the same Salvage. Research uses real time, including while the game is paused or closed; combat speed does not change its timer.\n\n"+
                    "Switching or suspending saves elapsed research progress and refunds its paid cost. Resuming pays that cost again. Queued research is paid when queued; review the Lab's action details before changing it.",
                    "research","OPEN RESEARCH LAB"),
                new LastStandHelpTopic("saves","Local saves & backups",
                    "Progress is saved on this device and does not sync with your account. Use one active game instance. Each confirmed wave checkpoint keeps your hull, Scrap and upgrades together.\n\n"+
                    "In Settings > Save, Export backup saves the last confirmed gameplay profile to a .laststand file. Keep that file somewhere you can find again. It contains campaign progress, research and your checkpoint; device preferences and account data are not included.\n\n"+
                    "To restore, return to the garage, choose a backup and compare its progress with your current save. Replace save replaces the whole gameplay profile; it does not combine rewards. Cancelling keeps your current progress. Resume starts paused after restoration.\n\n"+
                    "If a save is not confirmed, use the displayed recovery action before continuing. Failed saves and ownership conflicts never count as saved progress.",
                    "data","OPEN SAVE SETTINGS")
            });
        public static LastStandHelpTopic HelpTopic(string id)
        {foreach(var topic in HelpTopics)if(topic.Id==id)return topic;return null;}
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
        const string ControlsHelp="Use Pause/Resume or minus and plus. Speed changes in 0.5 steps: 0 is paused; 0.5x and 1x are available. Resume restores your last positive speed. Game Speed research unlocks higher speeds, up to 5x.";
        const string WavesHelp="Defeat every enemy in the wave. Each clear saves repeatable Salvage and any first-clear milestone bonus or unlock. See Wave Milestones in Menu. New runs have no separate defeat payout or Claim step. Older saved rewards can still be claimed once.";
        const string CheckpointsHelp="A starting checkpoint is saved before wave 1. Each clear saves hull, Scrap, upgrades and cooldowns. Return or reload keeps the last confirmed checkpoint; partial-wave purchases and spending roll back together. Resume waits for you and starts paused. Closed-tab time does not advance combat. An open hidden tab can keep progressing and saving waves. Failed saves stop combat until Retry succeeds.";
        static string TiersHelp=>"The next locked tier shows its required wave. Earning it never selects it or ends your current farm. Open Wave Milestones for the current tier roadmap. "+LastStandMilestonePresentation.FittingRoadmap+" New Run or Abandon needs confirmation when a checkpoint exists. Completed rewards are kept.";
        const string UpgradesHelp="Run upgrades spend Scrap; permanent upgrades spend banked Salvage. Cannon Attack, Launcher Attack, Scattergun Attack, Mortar Payload and Railgun Damage increase the matching weapon damage. Hull Capacity raises maximum hull, Armor reduces incoming damage, Cannon Cycle shortens the firing interval, and Field Repair restores more hull. Each card describes its next effect. Permanent purchases do not change an existing checkpoint's deployment stats.";
        const string PreferencesHelp="Progress stays in this browser and does not sync with your account. Use one active Last Stand tab. Settings has separate tutorial and purchase-suggestion switches. Essential save errors and confirmations remain visible.";
        // Retain the original complete text for existing callers and compatibility checks.
        public static string Help => "CONTROLS\n"+ControlsHelp+"\n\nWAVES & REWARDS\n"+WavesHelp+
            "\n\nCHECKPOINTS\n"+CheckpointsHelp+"\n\nTIERS & FITTINGS\n"+TiersHelp+
            "\n\nUPGRADES\n"+UpgradesHelp+"\n\nLOCAL SAVES & PREFERENCES\n"+PreferencesHelp;

    }
    public static class LastStandNavigationPolicy
    {
        public static bool CanLeave(string saveState, bool catchingUp) => saveState == "ready" && !catchingUp;
        public static bool RequiresConfirmation(int activeRunId) => false;
        public static bool RequiresAbandonConfirmation(int activeRunId) => activeRunId != 0;
    }
}
