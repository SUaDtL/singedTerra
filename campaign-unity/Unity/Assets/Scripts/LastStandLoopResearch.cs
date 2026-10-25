using System;
using UnityEngine;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandLoopController
    {
        LastStandResearchClock researchClock;
        LastStandRunHistory liveHistory;
        double researchPollAt,historyObservedAt,pausedMillisecondsRemainder;
        double nextResearchCompletionAt=double.PositiveInfinity;
        readonly double[] activeMillisecondsRemainders=new double[10];
        long closedMilliseconds;
        bool researchSavePending;
        int[] announcedResearchRanks;
        string researchCompletionNotice="";
        public LastStandResearchSnapshot ResearchSnapshot
        {
            get
            {
                var committed=Progression?.ResearchSnapshot;
                if(committed==null || !SampleResearch(out var time) ||
                    !Progression.TryPreviewResearch(time,out var preview) || preview.completionSequence!=committed.completionSequence)return committed;
                // Timers may interpolate between durable heartbeats. Actions
                // still name the last displayed committed owner revision.
                preview.revision=committed.revision;return preview;
            }
        }
        public bool ResearchCanAct=>Progression?.SaveState=="ready" && !researchSavePending;
        public string ResearchStatus { get; private set; }="";
        public LastStandHistorySnapshot RunHistorySnapshot=>
            liveHistory?.Current!=null && Progression.HasCheckpoint?liveHistory.Snapshot():Progression?.HistorySnapshot;
        static long ResearchUtc()=>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        void InitializeResearch()
        {
            var snapshot=Progression.ResearchSnapshot;
            if(snapshot==null)return;
            long now=ResearchUtc();
            announcedResearchRanks=(int[])snapshot.completedRanks.Clone();
            closedMilliseconds=Math.Max(0,now-snapshot.lastObservedUtcMilliseconds);
            researchClock=new LastStandResearchClock(snapshot.lastObservedUtcMilliseconds);
            // Reconcile before the first displayed balance/entitlement. The
            // pending transaction retains its clock sample across save retry.
            ReconcileResearch(false);
        }
        bool SampleResearch(out LastStandResearchTime sample)
        {
            sample=null;
            return researchClock!=null && researchClock.TrySample(ResearchUtc(),Time.realtimeSinceStartupAsDouble,out sample);
        }
        void ResearchConfirmed(LastStandResearchTime sample)
        {
            researchClock.Commit(sample);
            var snapshot=Progression.ResearchSnapshot;
            var completed=new System.Collections.Generic.List<string>();
            for(int n=0;n<snapshot.completedRanks.Length;n++)
                if(announcedResearchRanks!=null && snapshot.completedRanks[n]>announcedResearchRanks[n])
                    completed.Add(LastStandResearchCatalog.Get((LastStandResearchTrackId)n).Name+" rank "+snapshot.completedRanks[n]);
            announcedResearchRanks=(int[])snapshot.completedRanks.Clone();
            if(completed.Count>0)researchCompletionNotice="Completed: "+string.Join("; ",completed)+".";
            long remaining=long.MaxValue;
            foreach(var slot in snapshot.slots)
                if(slot.active!=null)remaining=Math.Min(remaining,slot.active.durationMilliseconds-slot.active.earnedMilliseconds);
            nextResearchCompletionAt=remaining==long.MaxValue?double.PositiveInfinity:
                sample.monotonic+(remaining-sample.fractionalMilliseconds)/1000d;
            Session.GrantMaximumSpeed(Progression.MaximumGameSpeed);
            ResearchStatus=(researchCompletionNotice!=""?researchCompletionNotice:"Research saved.")+
                (sample.ClockAnomaly?" Clock changed. Research used nonnegative elapsed time.":"");
        }
        bool ReconcileResearchBenefits()
        {
            if(!ResearchCanAct)return false;
            // Cheap on every combat callback; allocate/commit only when a
            // funded completion is due. Unity Update order cannot delay a
            // benefit until after its kill payout, wave reward or speed action.
            return Time.realtimeSinceStartupAsDouble<nextResearchCompletionAt || ReconcileResearch(false);
        }
        bool ReconcileResearch(bool refresh)
        {
            if(!ResearchCanAct || !SampleResearch(out var sample))return false;
            bool accepted=Progression.TryReconcileResearch(sample,()=>ResearchConfirmed(sample));
            if(!accepted && Progression.SaveState!="ready")ResearchSaveFailed();
            if(refresh)Refresh("research");
            return accepted;
        }
        void ResearchSaveFailed()
        {
            researchSavePending=true;ResearchStatus=Progression.SaveError;
            if(Session.Model!=null){Session.HoldCheckpoint();Phase="save-error";}
            Notice=Progression.SaveError;
        }
        void UpdateResearch()
        {
            double now=Time.realtimeSinceStartupAsDouble;
            if(now<researchPollAt)return;
            researchPollAt=now+1;
            FlushHistoryTime();
            if(researchClock!=null && Progression.SaveState=="ready" && SampleResearch(out var sample))
            {
                var saved=Progression.ResearchSnapshot;
                bool completed=Progression.TryPreviewResearch(sample,out var preview) && preview.completionSequence!=saved.completionSequence;
                if(completed || sample.ElapsedMilliseconds>=15000)ReconcileResearch(MenuPage=="research");
                else if(MenuPage=="research")Refresh("research-timer");
            }
        }
        public void RefreshResearch()=>ReconcileResearch(true);
        public void OpenResearch(){RefreshResearch();OpenMenu("research");}
        public void OpenHistory()=>OpenMenu("history");
        public void SubmitResearch(LastStandResearchIntent intent)
        {
            if(MenuPage!="research" || !ResearchCanAct || !SampleResearch(out var sample))return;
            bool accepted=Progression.TryResearchAction(intent,sample,()=>ResearchConfirmed(sample));
            if(!accepted)
            {
                if(Progression.SaveState!="ready")ResearchSaveFailed();
                else ResearchStatus="Research changed or this action is unavailable. Review the updated slot and balance.";
            }
            Refresh("research-action");
        }
        void StartHistory(bool resume)
        {
            liveHistory=Progression.HistorySnapshot==null?null:new LastStandRunHistory(Progression.HistorySnapshot);
            if(resume && liveHistory?.Current!=null && closedMilliseconds>0)liveHistory.AddClosedTime(closedMilliseconds);
            closedMilliseconds=0;
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
