using System;
using SingedTerra.LastStand;

static class ResearchEngineChecks
{
    const long Epoch = 1790000000000L;
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static LastStandResearchIntent Intent(LastStandResearchState s, LastStandResearchAction action, int slot,
        LastStandResearchTrackId track = LastStandResearchTrackId.GameSpeed, int rank = 1)
    {
        var snap = s.Snapshot();
        return new LastStandResearchIntent { Action = action, Slot = slot, Track = track, Rank = rank, ExpectedRevision = s.Revision,
            ExpectedActiveIdentity = snap.slots[slot].active?.identity ?? 0, ExpectedQueuedIdentity = snap.slots[slot].queued?.identity ?? 0 };
    }
    static LastStandResearchState Apply(LastStandResearchState s, ref long wallet, LastStandResearchAction action, int slot,
        LastStandResearchTrackId track = LastStandResearchTrackId.GameSpeed, int rank = 1)
    {
        LastStandResearchTransition t;
        Check(s.TryApply(Intent(s, action, slot, track, rank), wallet, 100, out t), "Action rejected: " + action + " " + track);
        wallet += t.WalletDelta; return t.State;
    }
    static LastStandResearchState Advance(LastStandResearchState s, long elapsed)
    {
        LastStandResearchTransition t;
        Check(s.TryAdvance(elapsed, s.LastObservedUtcMilliseconds + elapsed, false, out t), "Advance rejected"); return t.State;
    }
    static void Catalog()
    {
        Check(LastStandResearchCatalog.Tracks.Count == 4, "Four tracks");
        long speedDuration = 0;
        foreach (var d in LastStandResearchCatalog.Tracks)
        {
            long priorCost = 0, priorDuration = 0;
            for (int r = 1; r <= d.MaximumRank; r++)
            {
                Check(d.Cost(r) > priorCost && d.BaseDurationMilliseconds(r) > priorDuration, "Increasing staged ladders");
                priorCost = d.Cost(r); priorDuration = d.BaseDurationMilliseconds(r);
                if (d.Id == LastStandResearchTrackId.GameSpeed) speedDuration += priorDuration;
            }
        }
        Check(speedDuration == (35L * 24 * 60 + 7 * 60 + 10) * 60000, "35d7h10m base chain");
        var research = LastStandResearchCatalog.Get(LastStandResearchTrackId.ResearchSpeed);
        Check(research.DurationMilliseconds(3, 100) == research.BaseDurationMilliseconds(3), "Research Speed cannot accelerate itself");
        Check(LastStandResearchCatalog.Get(LastStandResearchTrackId.GameSpeed).DurationMilliseconds(1, 100) == 200000, "Research speed divides other timer");
        long total = 0, payout; int carry = 0, next;
        for (int i = 0; i < 50; i++) { Check(LastStandResearchCatalog.TryMultiplyReward(1, 1, carry, out payout, out next), "Reward"); total += payout; carry = next; }
        Check(total == 51 && carry == 0, "Fifty small rewards retain one full bonus");
        Check(!LastStandResearchCatalog.TryMultiplyReward(long.MaxValue, 100, 17, out payout, out next) && next == 17 && payout == 0, "Overflow is not a partial payout");
    }
    static void Funding()
    {
        var s = LastStandResearchState.Create(Epoch); LastStandResearchTransition t; long wallet = 1000;
        var first = Intent(s, LastStandResearchAction.Start, 0);
        Check(!s.TryApply(first, wallet, 24, out t), "Lab locked before 25");
        Check(!s.TryApply(first, 19, 25, out t), "Must afford shared Salvage");
        Check(s.TryApply(first, 20, 25, out t) && t.WalletDelta == -20, "First speed fits starter budget");
        Check(s.Revision == 0 && s.Snapshot().slots[0].active == null, "Transition does not mutate original");
        s = t.State;
        Check(!s.TryApply(first, wallet, 25, out t), "Stale revision no-op");
        Check(!s.TryApply(Intent(s, LastStandResearchAction.Start, 1, LastStandResearchTrackId.SalvageRecovery), wallet, 99, out t), "Second lab locked before 100");
        Check(!s.TryApply(Intent(s, LastStandResearchAction.Start, 1), wallet, 100, out t), "Same track cannot span slots");
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.GameSpeed, 2);
        Check(!s.TryApply(Intent(s, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.GameSpeed, 3), wallet, 100, out t), "Queue bounded to one");
        Check(!s.TryApply(Intent(s, LastStandResearchAction.Start, 1, LastStandResearchTrackId.SalvageRecovery, 2), wallet, 100, out t), "Cannot skip ranks");
    }
    static void Offline()
    {
        var s = LastStandResearchState.Create(Epoch); long wallet = 1000;
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0);
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.GameSpeed, 2);
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 1, LastStandResearchTrackId.SalvageRecovery);
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 1, LastStandResearchTrackId.ScrapLogistics);
        long chargedWallet = wallet;
        LastStandResearchTransition t;
        Check(s.TryAdvance(100L * 86400000, Epoch + 100L * 86400000, false, out t), "Closed reconciliation");
        Check(t.Completions.Count == 4 && t.WalletDelta == 0 && wallet == chargedWallet, "Only four prepaid completions; no new spending");
        s = t.State;
        Check(s.MaximumGameSpeed == 2 && s.Rank(LastStandResearchTrackId.SalvageRecovery) == 1 && s.Rank(LastStandResearchTrackId.ScrapLogistics) == 1, "All grants applied");
        Check(s.Snapshot().slots[0].active == null && s.Snapshot().slots[1].active == null && s.Snapshot().completionSequence == 4, "Idle and durable IDs");
        Check(s.TryAdvance(0, s.LastObservedUtcMilliseconds, false, out t) && t.Completions.Count == 0, "Reload cannot repeat completions");
    }
    static void Simultaneous()
    {
        var s = LastStandResearchState.Create(Epoch); long wallet = 1000;
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0, LastStandResearchTrackId.SalvageRecovery);
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.GameSpeed);
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 1, LastStandResearchTrackId.ResearchSpeed);
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 1, LastStandResearchTrackId.ScrapLogistics);
        var snap = s.Snapshot();
        snap.slots[0].active.earnedMilliseconds = snap.slots[0].active.durationMilliseconds - 1000;
        snap.slots[1].active.earnedMilliseconds = snap.slots[1].active.durationMilliseconds - 1000;
        Check(LastStandResearchState.TryRestore(snap, out s), "Valid simultaneous fixture");
        s = Advance(s, 1000); snap = s.Snapshot();
        Check(s.Rank(LastStandResearchTrackId.ResearchSpeed) == 1, "Speed research completed");
        Check(snap.slots[0].active.durationMilliseconds == LastStandResearchCatalog.Get(LastStandResearchTrackId.GameSpeed).DurationMilliseconds(1, 1), "Slot zero queue sees slot one same-instant bonus");
        Check(snap.slots[1].active.durationMilliseconds == LastStandResearchCatalog.Get(LastStandResearchTrackId.ScrapLogistics).DurationMilliseconds(1, 1), "Both queues share completed bonus");
        Check(snap.slots[0].active.earnedMilliseconds == 0 && snap.slots[1].active.earnedMilliseconds == 0, "Queue did not progress before start");
    }
    static void Switching()
    {
        var s = LastStandResearchState.Create(Epoch); long wallet = 100;
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0); s = Advance(s, 120000);
        var original = s.Snapshot().slots[0].active;
        s = Apply(s, ref wallet, LastStandResearchAction.Switch, 0, LastStandResearchTrackId.SalvageRecovery);
        Check(wallet == 73 && s.Snapshot().partials[0].earnedMilliseconds == 120000, "Switch refunds old, charges replacement and retains progress");
        s = Apply(s, ref wallet, LastStandResearchAction.Suspend, 0);
        Check(wallet == 100, "Refund once"); LastStandResearchTransition t;
        Check(!s.TryApply(Intent(s, LastStandResearchAction.Suspend, 0), wallet, 100, out t), "Cannot refund twice");
        s = Advance(s, 1000000);
        Check(s.Snapshot().partials[0].earnedMilliseconds == 120000 && s.Rank(LastStandResearchTrackId.GameSpeed) == 0, "Unslotted partial never progresses");
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0);
        Check(wallet == 80 && s.Snapshot().slots[0].active.identity == original.identity && s.Snapshot().slots[0].active.earnedMilliseconds == 120000 && s.Snapshot().slots[0].active.durationMilliseconds == original.durationMilliseconds, "Resume repays stored cost and preserves ID/time/duration");
        s = Advance(s, 480000); Check(s.MaximumGameSpeed == 1.5 && s.Snapshot().partials[0] == null, "Funded partial completes once");
    }
    static void DurationLocks()
    {
        var s = LastStandResearchState.Create(Epoch); long wallet = 1000;
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0);
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.GameSpeed, 2);
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 1, LastStandResearchTrackId.ResearchSpeed);
        s = Advance(s, 1000); var snapshot = s.Snapshot();
        snapshot.slots[1].active.earnedMilliseconds = snapshot.slots[1].active.durationMilliseconds - 1000;
        Check(LastStandResearchState.TryRestore(snapshot, out s), "Duration fixture"); s = Advance(s, 1000);
        Check(s.Rank(LastStandResearchTrackId.ResearchSpeed) == 1 && s.Snapshot().slots[0].active.durationMilliseconds == 600000,
            "Research completion cannot retime an active project");
        s = Apply(s, ref wallet, LastStandResearchAction.Suspend, 0);
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0);
        Check(s.Snapshot().slots[0].active.durationMilliseconds == 600000 && s.Snapshot().slots[0].active.earnedMilliseconds == 2000,
            "Suspending and resuming cannot unlock a cheaper timer");
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.GameSpeed, 2);
        s = Advance(s, 598000);
        Check(s.Snapshot().slots[0].active.durationMilliseconds == LastStandResearchCatalog.Get(LastStandResearchTrackId.GameSpeed).DurationMilliseconds(2, 1),
            "A new queued rank locks current bonus only on actual start");
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 1, LastStandResearchTrackId.ResearchSpeed, 2);
        Check(s.Snapshot().slots[1].active.durationMilliseconds == LastStandResearchCatalog.Get(LastStandResearchTrackId.ResearchSpeed).BaseDurationMilliseconds(2),
            "Research Speed starts its next rank without self bonus");
    }
    static void QueueSwitch()
    {
        var s = LastStandResearchState.Create(Epoch); long wallet = 100;
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0);
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.GameSpeed, 2);
        s = Apply(s, ref wallet, LastStandResearchAction.Switch, 0, LastStandResearchTrackId.SalvageRecovery);
        Check(wallet == 73 && s.Snapshot().slots[0].queued == null, "Invalid dependent queue refunded with old active");
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.ScrapLogistics);
        var queuedId = s.Snapshot().slots[0].queued.identity;
        s = Apply(s, ref wallet, LastStandResearchAction.Switch, 0, LastStandResearchTrackId.GameSpeed);
        Check(s.Snapshot().slots[0].queued.identity == queuedId, "Still-valid queue stays queued on switch");
        LastStandResearchTransition t; long rev = s.Revision; long activeId = s.Snapshot().slots[0].active.identity;
        Check(!s.TryApply(Intent(s, LastStandResearchAction.Switch, 0, LastStandResearchTrackId.SalvageRecovery), 0, 100, out t), "Unaffordable replacement rejected despite refund");
        Check(s.Revision == rev && s.Snapshot().slots[0].active.identity == activeId && s.Snapshot().slots[0].queued.identity == queuedId, "Rejected Switch is atomic noop");
        s = Apply(s, ref wallet, LastStandResearchAction.Suspend, 0);
        Check(s.Snapshot().slots[0].active.identity == queuedId && s.Snapshot().slots[0].queued == null, "Plain Suspend promotes valid queue");
    }
    static void PartialQueue()
    {
        var s = LastStandResearchState.Create(Epoch); long wallet = 1000;
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0, LastStandResearchTrackId.SalvageRecovery); s = Advance(s, 60000);
        s = Apply(s, ref wallet, LastStandResearchAction.Suspend, 0);
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0);
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.SalvageRecovery);
        Check(s.Snapshot().slots[0].queued.earnedMilliseconds == 60000, "Queued partial retained");
        s = Apply(s, ref wallet, LastStandResearchAction.RemoveQueued, 0);
        Check(s.Snapshot().partials[1].earnedMilliseconds == 60000 && wallet == 980, "Cancel partial queue returns cost and saved progress");
        s = Apply(s, ref wallet, LastStandResearchAction.Queue, 0, LastStandResearchTrackId.SalvageRecovery);
        s = Advance(s, 600000);
        Check(s.Snapshot().slots[0].active.track == LastStandResearchTrackId.SalvageRecovery && s.Snapshot().slots[0].active.earnedMilliseconds == 60000, "Partial only advances once started");
    }
    static void Validation()
    {
        var s = LastStandResearchState.Create(Epoch); long wallet = 1000;
        s = Apply(s, ref wallet, LastStandResearchAction.Start, 0);
        var snap = s.Snapshot(); LastStandResearchState restored;
        snap.slots[0].active.chargedCost = -1; Check(!LastStandResearchState.TryRestore(snap, out restored), "Malformed cost rejected");
        Check(s.Snapshot().slots[0].active.chargedCost == 20, "Snapshot does not alias state");
        snap = s.Snapshot(); snap.slots[1].active = snap.slots[0].active.Clone(); Check(!LastStandResearchState.TryRestore(snap, out restored), "Duplicate identity rejected");
        snap = s.Snapshot(); snap.completedRanks = new int[3]; Check(!LastStandResearchState.TryRestore(snap, out restored), "Wrong arrays rejected");
        snap = s.Snapshot(); snap.slots[0].active.earnedMilliseconds = snap.slots[0].active.durationMilliseconds; Check(!LastStandResearchState.TryRestore(snap, out restored), "Uncommitted completion not valid snapshot");
        snap = s.Snapshot(); snap.slots[0].active.durationMilliseconds = LastStandResearchCatalog.Get(LastStandResearchTrackId.GameSpeed).DurationMilliseconds(1, 1);
        Check(!LastStandResearchState.TryRestore(snap, out restored), "Locked timer cannot claim an unearned research bonus");
        snap = s.Snapshot(); snap.lastObservedUtcMilliseconds = long.MaxValue; Check(!LastStandResearchState.TryRestore(snap, out restored), "Invalid UTC rejected");
        snap = s.Snapshot(); Check(LastStandResearchState.TryRestore(snap, out restored), "Valid snapshot restores");
        snap.slots[0].active.earnedMilliseconds = 1; Check(restored.Snapshot().slots[0].active.earnedMilliseconds == 0, "Restore deep-copies input");
        Check(!restored.IsAvailableFor(24) && restored.IsAvailableFor(25), "Owner may verify unlock consistency");
    }
    static void Clock()
    {
        var c = new LastStandResearchClock(Epoch); LastStandResearchTime sample, retry;
        Check(c.TrySample(Epoch + 120000, 10, out sample) && sample.ElapsedMilliseconds == 120000, "Closed time from UTC");
        Check(!new LastStandResearchClock(Epoch).Commit(sample), "Old-session sample cannot commit to a replacement clock");
        Check(c.TrySample(Epoch + 120000, 10, out retry) && retry.ElapsedMilliseconds == 120000, "Failed write does not consume clock");
        Check(c.Commit(sample) && !c.Commit(retry), "Commit generation blocks stale observation");
        Check(c.TrySample(Epoch + 86400000, 11, out sample) && sample.ElapsedMilliseconds == 1000, "Open wall jump cannot speed research");
        Check(c.Commit(sample), "Commit observation");
        Check(c.TrySample(Epoch - 86400000, 12, out sample) && sample.ElapsedMilliseconds == 1000 && sample.ClockAnomaly, "Backward wall clock preserves monotonic second");
        Check(c.Commit(sample), "Backward reanchor");
        Check(!c.TrySample(-1, 13, out sample) && !c.TrySample(Epoch, double.NaN, out sample), "Invalid timestamps rejected");
    }
    static void ClockEdges()
    {
        var c = new LastStandResearchClock(Epoch); LastStandResearchTime t;
        Check(c.TrySample(Epoch - 100000, 0, out t) && t.ElapsedMilliseconds == 0 && t.ClockAnomaly, "Closed rollback never negative"); c.Commit(t);
        long sum = 0;
        for (int i = 1; i <= 10; i++) { Check(c.TrySample(Epoch, i * .0001, out t), "Fraction sample"); sum += t.ElapsedMilliseconds; c.Commit(t); }
        Check(sum == 1, "Sub-millisecond observations retain fractions");
        Check(c.TrySample(Epoch, 0, out t) && t.ElapsedMilliseconds == 0 && t.ClockAnomaly, "Monotonic rollback reanchors with no negative time"); c.Commit(t);
        Check(c.TrySample(Epoch, double.MaxValue, out t) && t.ElapsedMilliseconds == LastStandResearchClock.MaximumUtcMilliseconds, "Huge finite interval converts safely");
    }
    static int Main(string[] args)
    {
        try
        {
            switch (args[0])
            {
                case "catalog": Catalog(); break; case "funding": Funding(); break; case "offline": Offline(); break;
                case "simultaneous": Simultaneous(); break; case "switch": Switching(); break; case "queue_switch": QueueSwitch(); break;
                case "duration_locks": DurationLocks(); break;
                case "partial_queue": PartialQueue(); break; case "validation": Validation(); break; case "clock": Clock(); break; case "clock_edges": ClockEdges(); break;
                default: throw new Exception("Unknown case");
            }
            Console.WriteLine("PASS " + args[0]); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
