using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public interface ILastStandTime
    {
        long UtcMilliseconds { get; }
        double MonotonicSeconds { get; }
    }

    // Application ownership: samples time, reconciles durable research, and only
    // announces benefits after the profile owner confirms its transaction.
    public sealed class LastStandResearchCoordinator
    {
        readonly LastStandProgression progression;
        readonly ILastStandTime time;
        LastStandResearchClock clock;
        int[] announcedRanks;
        double nextCompletionAt = double.PositiveInfinity;
        string completionNotice = "";
        public bool Initialized => clock != null;
        public bool CanAct => Initialized && progression.SaveState == "ready";
        public string Status { get; private set; } = "";
        public long ClosedMilliseconds { get; private set; }
        public event Action Confirmed;

        public LastStandResearchCoordinator(LastStandProgression progression, ILastStandTime time)
        { this.progression = progression ?? throw new ArgumentNullException(nameof(progression)); this.time = time ?? throw new ArgumentNullException(nameof(time)); }

        public bool Initialize()
        {
            if (Initialized) return true;
            var snapshot = progression.ResearchSnapshot;
            if (snapshot == null) return false;
            announcedRanks = (int[])snapshot.completedRanks.Clone();
            ClosedMilliseconds = Math.Max(0, time.UtcMilliseconds - snapshot.lastObservedUtcMilliseconds);
            clock = new LastStandResearchClock(snapshot.lastObservedUtcMilliseconds);
            return Reconcile();
        }
        public long TakeClosedMilliseconds()
        { long result = ClosedMilliseconds; ClosedMilliseconds = 0; return result; }
        public bool Sample(out LastStandResearchTime sample)
        { sample = null; return clock != null && clock.TrySample(time.UtcMilliseconds, time.MonotonicSeconds, out sample); }
        public LastStandResearchSnapshot Snapshot
        {
            get
            {
                var committed = progression.ResearchSnapshot;
                if (committed == null || !Sample(out var sample) || !progression.TryPreviewResearch(sample, out var preview) ||
                    preview.completionSequence != committed.completionSequence) return committed;
                preview.revision = committed.revision;
                return preview;
            }
        }
        void Commit(LastStandResearchTime sample)
        {
            clock.Commit(sample);
            var snapshot = progression.ResearchSnapshot;
            var completed = new List<string>();
            foreach (var definition in LastStandResearchCatalog.Tracks)
            {
                int slot = definition.StorageSlot;
                if (announcedRanks != null && snapshot.completedRanks[slot] > announcedRanks[slot])
                    completed.Add(definition.Name + " rank " + snapshot.completedRanks[slot]);
            }
            announcedRanks = (int[])snapshot.completedRanks.Clone();
            if (completed.Count > 0) completionNotice = "Completed: " + string.Join("; ", completed) + ".";
            long remaining = long.MaxValue;
            foreach (var slot in snapshot.slots)
                if (slot.active != null) remaining = Math.Min(remaining, slot.active.durationMilliseconds - slot.active.earnedMilliseconds);
            nextCompletionAt = remaining == long.MaxValue ? double.PositiveInfinity : sample.monotonic + (remaining - sample.fractionalMilliseconds) / 1000d;
            Status = (completionNotice != "" ? completionNotice : "Research saved.") +
                (sample.ClockAnomaly ? " Clock changed. Research used nonnegative elapsed time." : "");
            Confirmed?.Invoke();
        }
        public bool ReconcileBenefits() => CanAct && (time.MonotonicSeconds < nextCompletionAt || Reconcile());
        public bool Reconcile()
        {
            if (!CanAct || !Sample(out var sample)) return false;
            bool accepted = progression.TryReconcileResearch(sample, () => Commit(sample));
            if (!accepted && progression.SaveState != "ready") Status = progression.SaveError;
            return accepted;
        }
        public bool NeedsHeartbeat()
        {
            if (!CanAct || !Sample(out var sample)) return false;
            var saved = progression.ResearchSnapshot;
            return sample.ElapsedMilliseconds >= 15000 ||
                (progression.TryPreviewResearch(sample, out var preview) && preview.completionSequence != saved.completionSequence);
        }
        public bool Submit(LastStandResearchIntent intent)
        {
            if (!CanAct || !Sample(out var sample)) return false;
            bool accepted = progression.TryResearchAction(intent, sample, () => Commit(sample));
            if (!accepted) Status = progression.SaveState != "ready" ? progression.SaveError :
                "Research changed or this action is unavailable. Review the updated slot and balance.";
            return accepted;
        }
    }
}
