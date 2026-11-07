using System;
using UnityEngine;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandLoopController
    {
        LastStandResearchCoordinator research;
        LastStandRunHistory liveHistory;
        double researchPollAt,historyObservedAt,pausedMillisecondsRemainder;
        readonly double[] activeMillisecondsRemainders=new double[10];
        public LastStandResearchSnapshot ResearchSnapshot => research?.Snapshot;
        public bool ResearchCanAct => research!=null && research.CanAct && !runs.ResearchPending && !HoldResearchForBackup;
        public string ResearchStatus => research?.Status ?? "";
        public LastStandHistorySnapshot RunHistorySnapshot =>
            liveHistory?.Current!=null && Progression.HasCheckpoint?liveHistory.Snapshot():Progression?.HistorySnapshot;
        void InitializeResearch()
        {
            if(research==null)
            {
                research=new LastStandResearchCoordinator(Progression,new LastStandUnityTime());
                research.Confirmed+=()=>Session.GrantMaximumSpeed(Progression.MaximumGameSpeed);
            }
            if(!research.Initialize() && Progression.SaveState!="ready")ResearchSaveFailed();
        }
        bool EnsureResearchInitialized()
        {
            if(research==null || !research.Initialized)InitializeResearch();
            return research!=null && research.Initialized && Progression.SaveState=="ready";
        }
        bool ReconcileResearchBenefits()
        {
            if(!ResearchCanAct)return false;
            bool result=research.ReconcileBenefits();
            if(!result && Progression.SaveState!="ready")ResearchSaveFailed();
            return result;
        }
        bool ReconcileResearch(bool refresh)
        {
            if(!ResearchCanAct)return false;
            bool result=research.Reconcile();
            if(!result && Progression.SaveState!="ready")ResearchSaveFailed();
            if(refresh)Refresh("research");
            return result;
        }
        void ResearchSaveFailed()
        {
            runs.ResearchFailed();
            if(Session.Model!=null){Session.HoldCheckpoint();Phase="save-error";}
            Notice=Progression.SaveError;
        }
        void UpdateResearch()
        {
            double now=Time.realtimeSinceStartupAsDouble;
            if(now<researchPollAt)return;
            researchPollAt=now+1;FlushHistoryTime();
            if(ResearchCanAct)
            {
                if(research.NeedsHeartbeat())ReconcileResearch(true);
                else if(MenuPage=="research")Refresh("research-timer");
            }
        }
        public void RefreshResearch()=>ReconcileResearch(true);
        public void OpenResearch(){RefreshResearch();OpenMenu("research");}
        public void OpenHistory()=>OpenMenu("history");
        public void SubmitResearch(LastStandResearchIntent intent)
        {
            if(MenuPage!="research" || !ResearchCanAct)return;
            if(!research.Submit(intent) && Progression.SaveState!="ready")ResearchSaveFailed();
            Refresh("research-action");
        }
        void StartHistory(bool resume)
        {
            liveHistory=Progression.HistorySnapshot==null?null:new LastStandRunHistory(Progression.HistorySnapshot);
            long closedMilliseconds=research.TakeClosedMilliseconds();
            if(resume && liveHistory?.Current!=null && closedMilliseconds>0)liveHistory.AddClosedTime(closedMilliseconds);
            Array.Clear(activeMillisecondsRemainders,0,activeMillisecondsRemainders.Length);
            pausedMillisecondsRemainder=0;
            historyObservedAt=Time.realtimeSinceStartupAsDouble;
        }
        void AdoptCommittedHistory()
        {
            if(Progression.HistorySnapshot!=null)liveHistory=new LastStandRunHistory(Progression.HistorySnapshot);
        }
        void RecordActiveStep()
        {
            if(liveHistory?.Current==null)return;
            // Each step consumes an admitted interval at the actual selected
            // rate, including delayed same-document callbacks. Keep fractions
            // across waves and speed changes; never divide by an assumed 5x.
            for(int n=0;n<10;n++)activeMillisecondsRemainders[n]+=Session.StepWallMilliseconds(n);
        }
        void FlushHistoryTime()
        {
            if(liveHistory?.Current==null)return;
            for(int n=0;n<10;n++)
            {
                long whole=(long)Math.Floor(activeMillisecondsRemainders[n]+1e-9);
                activeMillisecondsRemainders[n]-=whole;
                if(whole>0)liveHistory.AddActiveTime(whole,(n+1)*.5);
            }
            long paused=(long)Math.Floor(pausedMillisecondsRemainder);
            pausedMillisecondsRemainder-=paused;
            if(paused>0)liveHistory.AddPausedTime(paused);
        }
        void RecordPausedTime()
        {
            double now=Time.realtimeSinceStartupAsDouble;
            double elapsed=Math.Max(0,now-historyObservedAt);historyObservedAt=now;
            if(liveHistory?.Current==null || Session.Model==null || !Session.Paused)return;
            pausedMillisecondsRemainder+=elapsed*1000;
        }
    }
}
