using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.LastStand
{
    // Read-only companion to Lab, behind the floating Menu. Closing it never
    // finalizes a run. The existing shared keyboard owner handles navigation.
    public sealed class LastStandRunHistoryHud
    {
        readonly LastStandModal modal;
        readonly LastStandScrollPane pane;
        readonly Text body,conditionLabel,runALabel,runBLabel;
        readonly Button filter,view,help,conditionPrevious,conditionNext,runAPrevious,runANext,runBPrevious,runBNext;
        readonly Action refresh;
        readonly List<int> tiers=new List<int>{0};
        readonly List<LastStandRunSummary> runs=new List<LastStandRunSummary>();
        IReadOnlyList<LastStandHistoryCohort> cohorts=new LastStandHistoryCohort[0];
        LastStandHistoryCohort selectedCondition;
        LastStandHistorySnapshot snapshot;
        bool open,compareView,selectionInitialized,showHelp;int selectedTier,runA,runB;
        string saveStatus="";
        float width,height,unitsX=1,unitsY=1;
        public Button[] Buttons=>modal.Buttons.ToArray();
        public Button InitialFocus=>modal.Close;
        public float ScrollOffset=>pane.Offset;
        public float MaximumScrollOffset=>pane.MaximumOffset;
        public LastStandRunHistoryHud(Transform parent,Font font,Action close,Action refresh,
            Texture2D metal=null,Sprite surface=null)
        {
            this.refresh=refresh??throw new ArgumentNullException(nameof(refresh));
            modal=new LastStandModal("RunHistory",parent,font,close,metal,surface);
            pane=modal.Pane("RunHistory",scrollStatus:true);body=modal.Text("RunHistoryBody",pane.Content,16);
            filter=modal.Button("RunHistoryTier","TIER: ALL",pane.Content,()=>
            {int index=tiers.IndexOf(selectedTier);selectedTier=tiers[(index+1)%tiers.Count];pane.Reset();RefreshContent();this.refresh();});
            view=modal.Button("RunHistoryView","VIEW: TRENDS",pane.Content,()=>
            {compareView=!compareView;pane.Reset();RefreshContent();this.refresh();});
            help=modal.Button("RunHistoryHelp","HOW COMPARISONS WORK",pane.Content,()=>
            {showHelp=!showHelp;pane.Reset();RefreshContent();this.refresh();});
            conditionLabel=modal.Text("RunHistoryConditionLabel",pane.Content,16);
            runALabel=modal.Text("RunHistoryRunALabel",pane.Content,16);
            runBLabel=modal.Text("RunHistoryRunBLabel",pane.Content,16);
            conditionLabel.alignment=runALabel.alignment=runBLabel.alignment=TextAnchor.MiddleCenter;
            conditionPrevious=modal.Button("RunHistoryConditionPrevious","<",pane.Content,()=>MoveCondition(-1));
            conditionNext=modal.Button("RunHistoryConditionNext",">",pane.Content,()=>MoveCondition(1));
            runAPrevious=modal.Button("RunHistoryRunAPrevious","<",pane.Content,()=>MoveRun(true,-1));
            runANext=modal.Button("RunHistoryRunANext",">",pane.Content,()=>MoveRun(true,1));
            runBPrevious=modal.Button("RunHistoryRunBPrevious","<",pane.Content,()=>MoveRun(false,-1));
            runBNext=modal.Button("RunHistoryRunBNext",">",pane.Content,()=>MoveRun(false,1));
            modal.Shade.gameObject.SetActive(false);
        }
        public void Refresh(bool visible,LastStandHistorySnapshot history,string saveStatus="")
        {
            bool justOpened=visible&&!open;open=visible;modal.Shade.gameObject.SetActive(open);if(!open)return;
            snapshot=history??throw new ArgumentNullException(nameof(history));
            this.saveStatus=saveStatus??"";cohorts=LastStandHistoryComparison.Cohorts(snapshot);
            runs.Clear();if(snapshot.Current!=null)runs.Add(snapshot.Current);
            for(int i=snapshot.Recent.Count-1;i>=0;i--)runs.Add(snapshot.Recent[i]);
            if(!selectionInitialized&&cohorts.Count>0){selectedCondition=cohorts[0];selectionInitialized=true;}
            if(selectedCondition!=null)
            {int index=ConditionIndex();selectedCondition=index>0?cohorts[index-1]:cohorts.Count>0?cohorts[0]:null;}
            if(FindRun(runA)==null)runA=runs.Count>0?runs[0].RunId:0;
            if(FindRun(runB)==null)runB=runs.Count>1?runs[1].RunId:runA;
            tiers.Clear();tiers.Add(0);foreach(var tier in snapshot.Tiers)tiers.Add(tier.Tier);
            if(snapshot.Current!=null&&!tiers.Contains(snapshot.Current.Tier))tiers.Add(snapshot.Current.Tier);
            tiers.Sort();if(!tiers.Contains(selectedTier))selectedTier=0;
            modal.Title.text="RUN HISTORY";modal.Status.text="Latest "+snapshot.Recent.Count+" of "+snapshot.Lifetime.Runs+
                " recorded runs. Progress saves at completed waves.";
            if(justOpened){showHelp=false;pane.Reset();}RefreshContent();
        }
        int ConditionIndex()
        {
            if(selectedCondition!=null)for(int i=0;i<cohorts.Count;i++)if(selectedCondition.Matches(cohorts[i].Anchor))return i+1;
            return 0;
        }
        void MoveCondition(int direction)
        {
            int next=Math.Max(0,Math.Min(cohorts.Count,ConditionIndex()+direction));
            selectedCondition=next==0?null:cohorts[next-1];selectionInitialized=true;RefreshContent();refresh();
        }
        LastStandRunSummary FindRun(int id)
        {foreach(var run in runs)if(run.RunId==id)return run;return null;}
        void MoveRun(bool first,int direction)
        {
            if(runs.Count==0)return;
            int index=runs.FindIndex(run=>run.RunId==(first?runA:runB));
            int id=runs[Math.Max(0,Math.Min(runs.Count-1,index+direction))].RunId;
            if(first)runA=id;else runB=id;RefreshContent();refresh();
        }
        void RefreshContent()
        {
            if(!open||snapshot==null)return;
            filter.GetComponentInChildren<Text>().text="TIER: "+(selectedTier==0?"ALL":selectedTier.ToString(CultureInfo.InvariantCulture))+"  >";
            view.GetComponentInChildren<Text>().text=compareView?"VIEW: TWO RUNS  >":"VIEW: TRENDS  >";
            bool hasRuns=runs.Count>0;
            filter.gameObject.SetActive(!showHelp&&!compareView&&hasRuns);
            view.gameObject.SetActive(!showHelp);
            conditionLabel.gameObject.SetActive(!showHelp&&!compareView&&hasRuns);
            conditionPrevious.gameObject.SetActive(!showHelp&&!compareView&&hasRuns);conditionNext.gameObject.SetActive(!showHelp&&!compareView&&hasRuns);
            foreach(var item in new Component[]{runALabel,runBLabel,runAPrevious,runANext,runBPrevious,runBNext})item.gameObject.SetActive(!showHelp&&compareView&&hasRuns);
            help.GetComponentInChildren<Text>().text=showHelp?"BACK TO RUN HISTORY":"HOW COMPARISONS WORK";
            int conditionIndex=ConditionIndex();
            conditionLabel.text=conditionIndex==0?"ALL CONDITIONS": "CONDITIONS "+conditionIndex+" / "+cohorts.Count+"\nFROM RUN "+selectedCondition.Anchor.RunId;
            modal.Style(conditionPrevious,conditionIndex>0,false);modal.Style(conditionNext,conditionIndex<cohorts.Count,false);
            SetRunSelector(runA,"A",runALabel,runAPrevious,runANext);SetRunSelector(runB,"B",runBLabel,runBPrevious,runBNext);
            var text=new StringBuilder();if(saveStatus!="")text.Append(saveStatus).Append("\n\n");
            if(showHelp)
            {
                text.Append("HOW COMPARISONS WORK\n\nFinish runs to compare repeatable Salvage per real active hour. A tier needs 3 complete runs of at least 5 minutes with the same armament, upgrade states, reward rules and speed proportions before showing a median.");
                text.Append("\n\nMEASUREMENT LIMIT\nRates include repeatable wave Salvage plus its research bonus. One-time milestone bonuses are separate. Real active combat time includes a measured failed final wave and excludes pause/closed time.");
                text.Append("\n\nAbrupt closure can lose measurements from the unfinished wave; resume restores the saved checkpoint. Since-update, provisional, unmeasured and under-5-minute runs cannot supply comparison rates. Only the latest ").Append(LastStandRunHistory.MaximumRecent).Append(" finalized runs retain condition detail; lifetime totals cannot be pooled into these comparisons.");
                text.Append("\n\nComparisons are observations, not proof of a best farming tier. Speed proportions must match exactly, even when displayed percentages round to the same value.");
            }
            else if(!hasRuns)text.Append("NO RUNS YET\n\nClose this window and deploy a run to start your history. Completed-wave progress is saved automatically.\n\nA run enters your history when it ends. Closing this window or the game keeps your checkpoint; it does not end the run.");
            else if(compareView)AppendPair(text);else AppendTrends(text);
            body.text=text.ToString();if(width>0)Layout(width,height,unitsX,unitsY);
        }
        void SetRunSelector(int id,string label,Text text,Button previous,Button next)
        {
            int index=runs.FindIndex(run=>run.RunId==id);var run=index>=0?runs[index]:null;
            text.text=run==null?label+": NO RUNS":label+": RUN "+id+"\nTIER "+run.Tier+" | WAVE "+run.HighestClearedWave;
            modal.Style(previous,index>0,false);modal.Style(next,index>=0&&index<runs.Count-1,false);
        }
        void AppendPair(StringBuilder text)
        {
            var a=FindRun(runA);var b=FindRun(runB);
            if(a==null||b==null){text.Append("No recorded runs yet. Complete a run to begin comparing observations.");return;}
            text.Append(LastStandHistoryComparison.Between(a,b).Description);
            text.Append("\n\nA — ").Append(Summary(a));
            if(a.RunId!=b.RunId)text.Append("\n\nB — ").Append(Summary(b));
        }
        void AppendTrends(StringBuilder text)
        {
            text.Append("FARMING RESULTS\n");
            if(selectedCondition==null)text.Append("Choose matching run conditions with the arrows to compare tier results. Mixed conditions do not produce a shared median.");
            else text.Append(FittingName(selectedCondition.Anchor.Fitting)).Append(" | ").Append(RewardRules(selectedCondition.Anchor.EconomyVersion))
                .Append("\n").Append(selectedCondition.Description);
            bool any=false;
            foreach(int tier in tiers)if(tier>0&&(selectedTier==0||tier==selectedTier))
            {any=true;text.Append("\n\n").Append(LastStandHistoryComparison.ForTier(snapshot,tier,selectedCondition).Description);}
            if(!any)text.Append("\n\nNo samples yet. Each tier needs 3 complete runs of at least 5 minutes under the same recorded conditions.");
            var aggregate=snapshot.Lifetime;
            if(selectedTier!=0)foreach(var candidate in snapshot.Tiers)if(candidate.Tier==selectedTier)aggregate=candidate;
            if(selectedTier==0||aggregate.Tier==selectedTier)
            {
                text.Append("\n\nRECORDED TOTALS").Append(selectedTier==0?"": " - TIER "+selectedTier);
                text.Append("\n").Append(aggregate.Runs).Append(" finalized runs | best wave ").Append(aggregate.BestWave);
                text.Append("\n").Append(LastStandResearchPresentation.Duration(aggregate.ActiveMilliseconds)).Append(" active time");
                text.Append("\nBase repeatable ").Append(aggregate.RepeatableSalvage).Append(" | research bonus ")
                    .Append(aggregate.ResearchBonusSalvage).Append(" | milestone ").Append(aggregate.MilestoneSalvage).Append(" Salvage");
            }
            if(snapshot.Current!=null&&(selectedTier==0||snapshot.Current.Tier==selectedTier)&&
                (selectedCondition==null||selectedCondition.Matches(snapshot.Current)))
                text.Append("\n\nCURRENT RUN - PROVISIONAL\n").Append(Summary(snapshot.Current));
            text.Append("\n\nRUNS IN THIS FILTER - NEWEST FIRST");int shown=0;
            for(int i=snapshot.Recent.Count-1;i>=0;i--)
            {var run=snapshot.Recent[i];if((selectedTier!=0&&run.Tier!=selectedTier)||(selectedCondition!=null&&!selectedCondition.Matches(run)))continue;
             shown++;text.Append("\n\n").Append(Summary(run));}
            if(shown==0)text.Append("\nNo finalized runs match this filter. Defeat or explicitly abandon records a run; closing the menu or tab preserves it.");
        }
        public static string Summary(LastStandRunSummary run)
        {
            if(run==null)throw new ArgumentNullException(nameof(run));
            var text=new StringBuilder("RUN ").Append(run.RunId).Append(" | TIER ").Append(run.Tier)
                .Append(" | WAVE ").Append(run.HighestClearedWave).Append(" | ").Append(run.Finalized?run.FinishReason.ToUpperInvariant():"IN PROGRESS");
            if(run.SinceUpdate)text.Append("\nSINCE UPDATE: earlier measurements unavailable; excluded from comparisons.");
            text.Append("\n").Append(FittingName(run.Fitting)).Append(" | ").Append(RewardRules(run.EconomyVersion));
            text.Append("\nActive ").Append(LastStandResearchPresentation.Duration(run.ActiveMilliseconds))
                .Append(" | measured pause ").Append(LastStandResearchPresentation.Duration(run.PausedMilliseconds))
                .Append(" | closed / unobserved ").Append(LastStandResearchPresentation.Duration(run.ClosedMilliseconds));
            text.Append("\nSpeed mix: ");bool speed=false;
            for(int i=0;i<run.SpeedMilliseconds.Count;i++)if(run.SpeedMilliseconds[i]>0)
            {if(speed)text.Append(", ");speed=true;text.Append(((i+1)*.5).ToString("0.0",CultureInfo.InvariantCulture))
                .Append("x ").Append(LastStandResearchPresentation.Duration(run.SpeedMilliseconds[i]));}
            if(!speed)text.Append("no measured combat");
            text.Append("\nSalvage: ").Append(run.RepeatableSalvage).Append(" repeatable + ").Append(run.ResearchBonusSalvage)
                .Append(" research bonus; ").Append(run.MilestoneSalvage).Append(" one-time milestone");
            text.Append("\n").Append(run.FarmingRate.HasValue?run.FarmingRate.Value.ToString("0.0",CultureInfo.InvariantCulture)+" repeatable Salvage / active hour":"Rate unavailable: no active time");
            if(!run.Finalized)text.Append(" (provisional)");if(run.ShortSample)text.Append(" | under 5 minutes: unstable rate");
            text.Append("\nUpgrades: ").Append(run.SinceUpdate?"earlier build details unavailable":
                run.StartContext==run.EndContext?"unchanged during measured play":"changed during measured play");
            return text.ToString();
        }
        static string FittingName(string id)
        {foreach(var fitting in LastStandFittingCatalog.Definitions)if(fitting.Id==id)return fitting.Name;return "Unlisted armament";}
        static string RewardRules(string version)=>version==LastStandUpgradeCatalog.EconomyVersion?"Current reward rules":
            version==LastStandUpgradeCatalog.RetainedEconomyVersion||version==LastStandUpgradeCatalog.PreviousEconomyVersion||
            version==LastStandUpgradeCatalog.LegacyEconomyVersion?"Earlier reward rules":"Unlisted reward rules";
        public void Layout(float w,float h,float sx,float sy)
        {
            width=w;height=h;unitsX=sx;unitsY=sy;if(!open)return;
            float panelWidth=modal.Layout(w,h,sx,sy,800),top=modal.HeaderBottom;
            pane.Layout(12,top,panelWidth-24,Math.Max(44,modal.PanelHeight-top-12),sx,sy);
            float contentWidth=panelWidth-24,inner=contentWidth-24,y=modal.Preferred(modal.Status,inner);
            modal.Place(modal.Status,12,0,inner,y);y+=8;
            if(view.gameObject.activeSelf)
            {
                bool filtered=filter.gameObject.activeSelf;float half=(inner-8)/2;
                if(filtered)modal.Place(filter,12,y,half,44);
                modal.Place(view,filtered?20+half:12,y,filtered?half:inner,44);y+=56;
            }
            modal.Place(help,12,y,inner,44);y+=56;
            if(runALabel.gameObject.activeSelf)
            {
                y=modal.Selector(runALabel,runAPrevious,runANext,12,y,inner);
                y=modal.Selector(runBLabel,runBPrevious,runBNext,12,y,inner);
            }
            else if(conditionLabel.gameObject.activeSelf)y=modal.Selector(conditionLabel,conditionPrevious,conditionNext,12,y,inner);
            float textHeight=modal.Preferred(body,inner)+12;modal.Place(body,12,y,inner,textHeight);pane.Finish(y+textHeight+12);
        }
        public void Reveal(Button button)=>pane.Reveal(button);
        public void ScrollKeyboard(string direction){if(open)pane.ScrollKeyboard(direction);}
    }
}
