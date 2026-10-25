using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    [Serializable] public sealed class LastStandResearchProjectSnapshot
    {
        public long identity, chargedCost, durationMilliseconds, earnedMilliseconds;
        public LastStandResearchTrackId track;
        public int rank;
        public LastStandResearchProjectSnapshot Clone() => (LastStandResearchProjectSnapshot)MemberwiseClone();
    }
    [Serializable] public sealed class LastStandResearchSlotSnapshot
    {
        public LastStandResearchProjectSnapshot active, queued;
        public LastStandResearchSlotSnapshot Clone() => new LastStandResearchSlotSnapshot { active = active?.Clone(), queued = queued?.Clone() };
    }
    [Serializable] public sealed class LastStandResearchSnapshot
    {
        public int version = 1;
        public string catalogVersion = LastStandResearchCatalog.Version;
        public long revision, lastObservedUtcMilliseconds, nextProjectIdentity = 1, completionSequence;
        public int[] completedRanks = new int[LastStandResearchCatalog.TrackCount];
        public LastStandResearchSlotSnapshot[] slots = { new LastStandResearchSlotSnapshot(), new LastStandResearchSlotSnapshot() };
        public LastStandResearchProjectSnapshot[] partials = new LastStandResearchProjectSnapshot[LastStandResearchCatalog.TrackCount];
        public LastStandResearchSnapshot Clone()
        {
            var result = (LastStandResearchSnapshot)MemberwiseClone();
            result.completedRanks = (int[])completedRanks.Clone();
            result.slots = new LastStandResearchSlotSnapshot[slots.Length];
            result.partials = new LastStandResearchProjectSnapshot[partials.Length];
            for (int i = 0; i < slots.Length; i++) result.slots[i] = slots[i].Clone();
            for (int i = 0; i < partials.Length; i++) result.partials[i] = partials[i]?.Clone();
            return result;
        }
    }
    public enum LastStandResearchAction { Start, Queue, Switch, Suspend, RemoveQueued }
    public sealed class LastStandResearchIntent
    {
        public LastStandResearchAction Action;
        public int Slot, Rank;
        public LastStandResearchTrackId Track;
        public long ExpectedRevision, ExpectedActiveIdentity, ExpectedQueuedIdentity;
    }
    public sealed class LastStandResearchCompletion
    {
        public long Sequence { get; internal set; }
        public long ProjectIdentity { get; internal set; }
        public LastStandResearchTrackId Track { get; internal set; }
        public int Rank { get; internal set; }
    }
    public sealed class LastStandResearchTransition
    {
        public LastStandResearchState State { get; internal set; }
        public long WalletDelta { get; internal set; }
        public IReadOnlyList<LastStandResearchCompletion> Completions { get; internal set; }
        public bool ClockAnomaly { get; internal set; }
    }

    // A transition never modifies this state or the caller's wallet. The profile
    // owner must commit State and WalletDelta together, with its storage revision
    // check. Reconcile time before accepting an intent from a displayed revision.
    public sealed class LastStandResearchState
    {
        const long MaximumIdentity = 9007199254740991L;
        readonly LastStandResearchSnapshot value;
        LastStandResearchState(LastStandResearchSnapshot snapshot) { value = snapshot; }
        public long Revision => value.revision;
        public long LastObservedUtcMilliseconds => value.lastObservedUtcMilliseconds;
        public double MaximumGameSpeed => 1 + .5 * Rank(LastStandResearchTrackId.GameSpeed);
        public int Rank(LastStandResearchTrackId track) => value.completedRanks[(int)LastStandResearchCatalog.Get(track).Id];
        public LastStandResearchSnapshot Snapshot() => value.Clone();
        public LastStandResearchState Clone() => new LastStandResearchState(value.Clone());
        public static LastStandResearchState Create(long utcMilliseconds)
        {
            if (!LastStandResearchClock.ValidUtc(utcMilliseconds)) throw new ArgumentOutOfRangeException(nameof(utcMilliseconds));
            return new LastStandResearchState(new LastStandResearchSnapshot { lastObservedUtcMilliseconds = utcMilliseconds });
        }
        public static bool TryRestore(LastStandResearchSnapshot snapshot, out LastStandResearchState state)
        {
            state = null;
            if (!Valid(snapshot)) return false;
            state = new LastStandResearchState(snapshot.Clone()); return true;
        }
        public bool IsAvailableFor(int bestTierOneWave)
        {
            int unlocked = LastStandResearchCatalog.UnlockedSlots(bestTierOneWave);
            if (unlocked == 0 && (value.completionSequence > 0 || value.nextProjectIdentity != 1)) return false;
            for (int i = unlocked; i < value.slots.Length; i++)
                if (value.slots[i].active != null || value.slots[i].queued != null) return false;
            return true;
        }
        static bool Valid(LastStandResearchSnapshot s)
        {
            if (s == null || s.version != 1 || s.catalogVersion != LastStandResearchCatalog.Version ||
                s.revision < 0 || s.revision > MaximumIdentity || s.nextProjectIdentity < 1 || s.nextProjectIdentity > MaximumIdentity ||
                !LastStandResearchClock.ValidUtc(s.lastObservedUtcMilliseconds) || s.completedRanks == null || s.completedRanks.Length != 4 ||
                s.slots == null || s.slots.Length != 2 || s.partials == null || s.partials.Length != 4) return false;
            int complete = 0;
            for (int i = 0; i < 4; i++)
            {
                if (s.completedRanks[i] < 0 || s.completedRanks[i] > LastStandResearchCatalog.Get((LastStandResearchTrackId)i).MaximumRank) return false;
                complete += s.completedRanks[i];
            }
            if (s.completionSequence != complete || s.nextProjectIdentity <= complete) return false;
            var identities = new HashSet<long>();
            var fundedSlots = new int[] { -1, -1, -1, -1 };
            for (int slot = 0; slot < 2; slot++)
            {
                var item = s.slots[slot]; if (item == null || (item.active == null && item.queued != null)) return false;
                if (!ValidProject(s, item.active, false, identities) || !ValidProject(s, item.queued, true, identities)) return false;
                if (item.active != null && item.active.rank != s.completedRanks[(int)item.active.track] + 1) return false;
                if (item.queued != null)
                {
                    int expected = s.completedRanks[(int)item.queued.track] + 1;
                    if (item.active.track == item.queued.track) expected++;
                    if (item.queued.rank != expected || (item.queued.track == item.active.track && item.queued.durationMilliseconds != 0)) return false;
                }
                foreach (var project in new[] { item.active, item.queued })
                {
                    if (project == null) continue;
                    int track = (int)project.track;
                    if (fundedSlots[track] != -1 && fundedSlots[track] != slot) return false;
                    fundedSlots[track] = slot;
                }
            }
            for (int i = 0; i < 4; i++)
            {
                var partial = s.partials[i];
                if (!ValidProject(s, partial, false, identities)) return false;
                if (partial != null && ((int)partial.track != i || partial.rank != s.completedRanks[i] + 1 || fundedSlots[i] != -1)) return false;
            }
            return true;
        }
        static bool ValidProject(LastStandResearchSnapshot s, LastStandResearchProjectSnapshot p, bool queued, HashSet<long> ids)
        {
            if (p == null) return true;
            if (!LastStandResearchCatalog.IsTrack(p.track) || p.identity < 1 || p.identity >= s.nextProjectIdentity || !ids.Add(p.identity)) return false;
            var definition = LastStandResearchCatalog.Get(p.track);
            if (p.rank < 1 || p.rank > definition.MaximumRank || p.chargedCost != definition.Cost(p.rank)) return false;
            if (queued && p.durationMilliseconds == 0) return p.earnedMilliseconds == 0;
            if (p.earnedMilliseconds < 0 || p.earnedMilliseconds >= p.durationMilliseconds) return false;
            // A locked timer may reflect an earlier, weaker earned bonus, but
            // never an arbitrary duration or a rank the profile has not earned.
            for (int bonus = 0; bonus <= s.completedRanks[(int)LastStandResearchTrackId.ResearchSpeed]; bonus++)
                if (p.durationMilliseconds == definition.DurationMilliseconds(p.rank, bonus)) return true;
            return false;
        }

        public bool TryAdvance(LastStandResearchTime time, out LastStandResearchTransition transition)
        {
            transition = null;
            if (time == null) return false;
            return TryAdvance(time.ElapsedMilliseconds, time.ObservedUtcMilliseconds, time.ClockAnomaly, out transition);
        }
        public bool TryAdvance(long elapsedMilliseconds, long observedUtcMilliseconds, bool clockAnomaly, out LastStandResearchTransition transition)
        {
            transition = null;
            if (elapsedMilliseconds < 0 || elapsedMilliseconds > LastStandResearchClock.MaximumUtcMilliseconds ||
                !LastStandResearchClock.ValidUtc(observedUtcMilliseconds) || value.revision == MaximumIdentity) return false;
            var next = value.Clone();
            var completions = new List<LastStandResearchCompletion>();
            long remaining = elapsedMilliseconds;
            for (int pass = 0; pass < 4; pass++)
            {
                long until = long.MaxValue;
                foreach (var slot in next.slots)
                    if (slot.active != null) until = Math.Min(until, slot.active.durationMilliseconds - slot.active.earnedMilliseconds);
                if (until == long.MaxValue || remaining == 0) break;
                long step = Math.Min(until, remaining);
                foreach (var slot in next.slots) if (slot.active != null) slot.active.earnedMilliseconds += step;
                remaining -= step;
                if (step < until) break;
                // All same-instant completions precede every queued start. Slot
                // index cannot decide whether a new Research Speed rank applies.
                foreach (var slot in next.slots)
                {
                    var p = slot.active;
                    if (p == null || p.earnedMilliseconds < p.durationMilliseconds) continue;
                    next.completedRanks[(int)p.track] = p.rank;
                    next.completionSequence++;
                    completions.Add(new LastStandResearchCompletion { Sequence = next.completionSequence, ProjectIdentity = p.identity, Track = p.track, Rank = p.rank });
                    slot.active = null;
                }
                foreach (var slot in next.slots)
                    if (slot.active == null && slot.queued != null) Promote(next, slot);
            }
            next.lastObservedUtcMilliseconds = observedUtcMilliseconds;
            if (elapsedMilliseconds != 0 || observedUtcMilliseconds != value.lastObservedUtcMilliseconds || completions.Count != 0) next.revision++;
            transition = new LastStandResearchTransition { State = new LastStandResearchState(next), WalletDelta = 0,
                Completions = completions.AsReadOnly(), ClockAnomaly = clockAnomaly || observedUtcMilliseconds < value.lastObservedUtcMilliseconds };
            return true;
        }

        public bool TryApply(LastStandResearchIntent intent, long salvageBalance, int bestTierOneWave, out LastStandResearchTransition transition)
        {
            transition = null;
            if (intent == null || salvageBalance < 0 || salvageBalance > MaximumIdentity || value.revision == MaximumIdentity ||
                intent.ExpectedRevision != value.revision || intent.Slot < 0 || intent.Slot >= LastStandResearchCatalog.UnlockedSlots(bestTierOneWave) ||
                !IsAvailableFor(bestTierOneWave)) return false;
            var currentSlot = value.slots[intent.Slot];
            if ((currentSlot.active?.identity ?? 0) != intent.ExpectedActiveIdentity || (currentSlot.queued?.identity ?? 0) != intent.ExpectedQueuedIdentity) return false;
            var next = value.Clone(); var slot = next.slots[intent.Slot]; long wallet = salvageBalance;
            try
            {
                switch (intent.Action)
                {
                    case LastStandResearchAction.Start:
                        if (slot.active != null || !Fund(next, intent, false, ref wallet, out slot.active)) return false;
                        Start(next, slot.active); break;
                    case LastStandResearchAction.Queue:
                        if (slot.active == null || slot.queued != null || !Fund(next, intent, true, ref wallet, out slot.queued)) return false;
                        break;
                    case LastStandResearchAction.Switch:
                        if (slot.active == null || (slot.active.track == intent.Track && slot.active.rank == intent.Rank)) return false;
                        Suspend(next, slot, ref wallet);
                        DropInvalidQueue(next, slot, ref wallet);
                        if (!Fund(next, intent, false, ref wallet, out slot.active)) return false;
                        Start(next, slot.active); break;
                    case LastStandResearchAction.Suspend:
                        if (slot.active == null) return false;
                        Suspend(next, slot, ref wallet); DropInvalidQueue(next, slot, ref wallet);
                        if (slot.queued != null) Promote(next, slot);
                        break;
                    case LastStandResearchAction.RemoveQueued:
                        if (slot.queued == null) return false;
                        Refund(next, slot.queued, ref wallet); slot.queued = null; break;
                    default: return false;
                }
                if (wallet < 0 || wallet > MaximumIdentity || !Valid(next)) return false;
                next.revision++;
                transition = new LastStandResearchTransition { State = new LastStandResearchState(next), WalletDelta = checked(wallet - salvageBalance),
                    Completions = Array.AsReadOnly(new LastStandResearchCompletion[0]) };
                return true;
            }
            catch (OverflowException) { return false; }
        }
        static bool Fund(LastStandResearchSnapshot next, LastStandResearchIntent intent, bool queued, ref long wallet, out LastStandResearchProjectSnapshot project)
        {
            project = null;
            if (!LastStandResearchCatalog.IsTrack(intent.Track)) return false;
            var definition = LastStandResearchCatalog.Get(intent.Track);
            int wanted = next.completedRanks[(int)intent.Track] + 1;
            var slot = next.slots[intent.Slot];
            if (queued && slot.active != null && slot.active.track == intent.Track) wanted++;
            if (intent.Rank != wanted || wanted > definition.MaximumRank) return false;
            for (int i = 0; i < next.slots.Length; i++)
            {
                var other = next.slots[i];
                if (other.queued != null && other.queued.track == intent.Track) return false;
                if (other.active != null && other.active.track == intent.Track && (!queued || i != intent.Slot)) return false;
            }
            var partial = next.partials[(int)intent.Track];
            long cost = partial?.chargedCost ?? definition.Cost(wanted);
            if (wallet < cost || (partial != null && partial.rank != wanted) || next.nextProjectIdentity == MaximumIdentity) return false;
            if (partial != null) { project = partial; next.partials[(int)intent.Track] = null; }
            else project = new LastStandResearchProjectSnapshot { identity = next.nextProjectIdentity++, track = intent.Track, rank = wanted, chargedCost = cost };
            wallet -= cost; return true;
        }
        static void Start(LastStandResearchSnapshot state, LastStandResearchProjectSnapshot project)
        {
            if (project.durationMilliseconds == 0)
                project.durationMilliseconds = LastStandResearchCatalog.Get(project.track).DurationMilliseconds(project.rank, state.completedRanks[(int)LastStandResearchTrackId.ResearchSpeed]);
        }
        static void Promote(LastStandResearchSnapshot state, LastStandResearchSlotSnapshot slot)
        { slot.active = slot.queued; slot.queued = null; Start(state, slot.active); }
        static void Refund(LastStandResearchSnapshot state, LastStandResearchProjectSnapshot project, ref long wallet)
        {
            wallet = checked(wallet + project.chargedCost);
            if (project.durationMilliseconds > 0) state.partials[(int)project.track] = project;
        }
        static void Suspend(LastStandResearchSnapshot state, LastStandResearchSlotSnapshot slot, ref long wallet)
        { Refund(state, slot.active, ref wallet); slot.active = null; }
        static void DropInvalidQueue(LastStandResearchSnapshot state, LastStandResearchSlotSnapshot slot, ref long wallet)
        {
            if (slot.queued == null || slot.queued.rank == state.completedRanks[(int)slot.queued.track] + 1) return;
            Refund(state, slot.queued, ref wallet); slot.queued = null;
        }
    }
}
