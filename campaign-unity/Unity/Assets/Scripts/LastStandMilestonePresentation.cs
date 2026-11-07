using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace SingedTerra.LastStand
{
    // A projection of authored rewards, never a claim or a persistence owner.
    public sealed class LastStandMilestoneView
    {
        public LastStandMilestone Milestone { get; }
        public int BaseRepeatableSalvage { get; }
        public string Unlock { get; }
        internal LastStandMilestoneView(LastStandMilestone milestone,int repeatable,string unlock)
        { Milestone=milestone;BaseRepeatableSalvage=repeatable;Unlock=unlock; }
        static string Number(int value)=>value.ToString("N0",CultureInfo.InvariantCulture);
        public string Compact=>"Next W"+Milestone.Wave+": +"+Number(Milestone.FirstClearSalvage)+" Salvage"+
            (Unlock.Length==0?"":"\nUnlock "+Unlock);
        public string Describe(bool earned)=>"WAVE "+Milestone.Wave+" / "+(earned?"EARNED":"UPCOMING")+
            "\nOne-time bonus: +"+Number(Milestone.FirstClearSalvage)+" Salvage"+
            (Unlock.Length==0?"":" / Unlock "+Unlock)+
            "\nBase wave reward: +"+Number(BaseRepeatableSalvage)+" Salvage";
    }
    public static class LastStandMilestonePresentation
    {
        public static IReadOnlyList<LastStandMilestoneView> Rows(int tier,LastStandRunEdition edition=null)
        {
            edition=edition??LastStandRunEdition.Current;var definition=edition.Tier(tier);
            var rows=new List<LastStandMilestoneView>();
            foreach(var milestone in LastStandRewardCatalog.Milestones(definition,edition.Tiers,edition.Fittings)){
                string unlock=milestone.UnlockTierId==0?"":"Tier "+milestone.UnlockTierId;
                if(milestone.UnlockFittingId!=null){
                    string name=FittingName(milestone.UnlockFittingId,edition);
                    unlock+=(unlock.Length==0?"":" + ")+name;
                }
                rows.Add(new LastStandMilestoneView(milestone,LastStandRewardCatalog.At(definition,milestone.Wave,edition).RepeatableSalvage,unlock));
            }
            return rows.AsReadOnly();
        }
        static string FittingName(string id,LastStandRunEdition edition)
        {
            foreach(var fitting in edition.Fittings)if(fitting.Id==id)return fitting.Name;
            throw new ArgumentException("Milestone refers to an unknown fitting.");
        }
        public static string NextGoal(int tier,int bestWave,LastStandRunEdition edition=null)
        {
            foreach(var row in Rows(tier,edition))if(row.Milestone.Wave>bestWave)return row.Compact;
            return "Keep farming repeatable wave rewards.";
        }
        public static string Roadmap(int tier,Func<string,bool> earned,LastStandRunEdition edition=null)
        {
            if(earned==null)throw new ArgumentNullException(nameof(earned));edition=edition??LastStandRunEdition.Current;
            var text=new StringBuilder("Every completed wave pays repeatable Salvage. Bonuses below are earned once per tier. Base rewards exclude Salvage Recovery research. Unlocking a tier never ends or moves your run.\n");
            if(edition.IsLegacy)text.Append("\nThis resumed run keeps its original reward edition. New runs use the current campaign.\n");
            foreach(var row in Rows(tier,edition))text.Append("\n").Append(row.Describe(earned(row.Milestone.Id))).Append("\n");
            return text.ToString();
        }
        // Call only with a confirmed receipt. The supplied Salvage already includes
        // the exact research fraction and first-clear award saved by progression.
        public static string ConfirmedReceipt(int wave,int salvage,bool firstClear,string fitting,int tier)
        {
            string detail=String.IsNullOrEmpty(fitting)?"":fitting.ToUpperInvariant()+" UNLOCKED";
            if(tier>0)detail+=(detail.Length==0?"":" / ")+"TIER "+tier+" UNLOCKED";
            if(detail.Length==0)detail=firstClear?"FIRST CLEAR SAVED":"WAVE REWARD SAVED";
            return "W"+wave+" +"+salvage.ToString("N0",CultureInfo.InvariantCulture)+" SALVAGE\n"+detail;
        }
        public static string FittingRoadmap
        {
            get{
                var text=new StringBuilder();
                foreach(var fitting in LastStandRunEdition.Current.Fittings)if(fitting.Playable){
                    if(text.Length>0)text.Append(" ");text.Append(fitting.Name);
                    text.Append(fitting.InitiallyUnlocked?" is available from the start.":" unlocks at Tier "+fitting.UnlockTier+" wave "+fitting.UnlockWave+".");
                }
                return text.ToString();
            }
        }
    }
}
