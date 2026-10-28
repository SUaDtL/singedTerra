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
        readonly Text body;
        readonly Button filter;
        readonly Action refresh;
        readonly List<int> tiers=new List<int>{0};
        LastStandHistorySnapshot snapshot;
        bool open;int selectedTier;
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
            pane=modal.Pane("RunHistory");body=modal.Text("RunHistoryBody",pane.Content,16);
            filter=modal.Button("RunHistoryTier","TIER: ALL",modal.Panel,()=>
            {int index=tiers.IndexOf(selectedTier);selectedTier=tiers[(index+1)%tiers.Count];pane.Reset();RefreshContent();this.refresh();});
            modal.Shade.gameObject.SetActive(false);
        }
        public void Refresh(bool visible,LastStandHistorySnapshot history,string saveStatus="")
        {
            bool justOpened=visible&&!open;open=visible;modal.Shade.gameObject.SetActive(open);if(!open)return;
            snapshot=history??throw new ArgumentNullException(nameof(history));
            tiers.Clear();tiers.Add(0);foreach(var tier in snapshot.Tiers)tiers.Add(tier.Tier);
            if(snapshot.Current!=null&&!tiers.Contains(snapshot.Current.Tier))tiers.Add(snapshot.Current.Tier);
            tiers.Sort();if(!tiers.Contains(selectedTier))selectedTier=0;
            modal.Title.text="RUN HISTORY";modal.Status.text="Latest "+snapshot.Recent.Count+" of "+snapshot.Lifetime.Runs+
                " recorded runs. Progress saves at completed waves.";
            if(justOpened)pane.Reset();RefreshContent(saveStatus);
        }
        void RefreshContent(string status="")
        {
            if(!open||snapshot==null)return;
            filter.GetComponentInChildren<Text>().text="TIER: "+(selectedTier==0?"ALL":selectedTier.ToString(CultureInfo.InvariantCulture))+"  >";
            var text=new StringBuilder();if(status!="")text.Append(status).Append("\n\n");
            text.Append("FARMING COMPARISON\n").Append(new LastStandRunHistory(snapshot).Compare(selectedTier).Description);
            text.Append("\nRates include repeatable wave Salvage plus its research bonus. One-time milestone bonuses are separate. Time uses real active combat, including a measured failed final wave, and excludes pause/closed time.");
            text.Append("\n\nMEASUREMENT LIMIT\nThese are checkpointed measurements. Abrupt closure can lose time from the unfinished wave; resume restores the saved boundary. 'Since update' records do not invent earlier time or income and are excluded from comparisons. Different fittings, speeds and upgrades can change results.");
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
            if(snapshot.Current!=null&&(selectedTier==0||snapshot.Current.Tier==selectedTier))
                text.Append("\n\nCURRENT RUN - PROVISIONAL\n").Append(Summary(snapshot.Current));
            text.Append("\n\nRECENT RUNS - NEWEST FIRST");int shown=0;
            for(int i=snapshot.Recent.Count-1;i>=0;i--)
            {var run=snapshot.Recent[i];if(selectedTier!=0&&run.Tier!=selectedTier)continue;shown++;text.Append("\n\n").Append(Summary(run));}
            if(shown==0)text.Append("\nNo finalized runs yet. Defeat or explicitly abandon a run to record it; closing a menu or tab preserves the active run.");
            body.text=text.ToString();if(width>0)Layout(width,height,unitsX,unitsY);
        }
        public static string Summary(LastStandRunSummary run)
        {
            if(run==null)throw new ArgumentNullException(nameof(run));
            var text=new StringBuilder("RUN ").Append(run.RunId).Append(" | TIER ").Append(run.Tier)
                .Append(" | WAVE ").Append(run.HighestClearedWave).Append(" | ").Append(run.Finalized?run.FinishReason.ToUpperInvariant():"IN PROGRESS");
            if(run.SinceUpdate)text.Append("\nSINCE UPDATE: earlier measurements unavailable; excluded from comparisons.");
            text.Append("\n").Append(run.Fitting).Append(" | economy ").Append(run.EconomyVersion);
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
            text.Append("\nStart: ").Append(run.StartContext).Append("\nEnd/current: ").Append(run.EndContext);
            return text.ToString();
        }
        public void Layout(float w,float h,float sx,float sy)
        {
            width=w;height=h;unitsX=sx;unitsY=sy;if(!open)return;
            float panelWidth=modal.Layout(w,h,sx,sy,800),top=modal.HeaderBottom;
            modal.Place(filter,12,top,panelWidth-24,44);top+=52;
            pane.Layout(12,top,panelWidth-24,Math.Max(44,modal.PanelHeight-top-12),sx,sy);
            float textHeight=modal.Preferred(body,panelWidth-48)+12;modal.Place(body,12,12,panelWidth-48,textHeight);pane.Finish(textHeight+24);
        }
        public void Reveal(Button button)=>pane.Reveal(button);
        public void ScrollKeyboard(string direction){if(open)pane.ScrollKeyboard(direction);}
    }
}
