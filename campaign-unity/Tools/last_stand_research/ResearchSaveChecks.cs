using System;
using System.Collections.Generic;
using SingedTerra.LastStand;

// Test-only entrypoints expose the production private codecs, without replacing
// the owner, JSON parser, validation or transition code.
namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        public static string ResearchSaveTestWrite(LastStandResearchState state) => LastStandSaveJson.Write(ResearchJson(state));
        public static LastStandResearchState ResearchSaveTestRead(string raw) => ReadResearch(LastStandSaveJson.Read(raw));
        public static string HistorySaveTestWrite(LastStandRunHistory history) => LastStandSaveJson.Write(HistoryJson(history));
        public static LastStandRunHistory HistorySaveTestRead(string raw) => ReadHistory(LastStandSaveJson.Read(raw));
    }
}

static class ResearchSaveChecks
{
    const long Epoch = 1790000000000L;
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static void Reject(Action action, string message)
    {
        bool rejected = false;
        try { action(); }
        catch (FormatException) { rejected = true; }
        catch (ArgumentException) { rejected = true; }
        catch (OverflowException) { rejected = true; }
        Check(rejected, message);
    }
    static LastStandResearchState Fixture()
    {
        var s = LastStandResearchState.Create(Epoch);
        long wallet = 1000;
        Action<LastStandResearchAction, int, LastStandResearchTrackId, int> apply = (action, slot, track, rank) =>
        {
            var snap = s.Snapshot(); LastStandResearchTransition next;
            Check(s.TryApply(new LastStandResearchIntent { Action = action, Slot = slot, Track = track, Rank = rank,
                ExpectedRevision = s.Revision, ExpectedActiveIdentity = snap.slots[slot].active?.identity ?? 0,
                ExpectedQueuedIdentity = snap.slots[slot].queued?.identity ?? 0 }, wallet, 100, out next), "Research fixture action");
            wallet += next.WalletDelta; s = next.State;
        };
        apply(LastStandResearchAction.Start, 0, LastStandResearchTrackId.SalvageRecovery, 1);
        LastStandResearchTransition progress; Check(s.TryAdvance(12345, Epoch + 12345, false, out progress), "Fixture progress"); s = progress.State;
        apply(LastStandResearchAction.Switch, 0, LastStandResearchTrackId.GameSpeed, 1);
        apply(LastStandResearchAction.Queue, 0, LastStandResearchTrackId.GameSpeed, 2);
        apply(LastStandResearchAction.Start, 1, LastStandResearchTrackId.ResearchSpeed, 1);
        return s;
    }
    static string Mutate(string raw, Action<Dictionary<string, object>> mutate)
    { var value = LastStandSaveJson.Read(raw); mutate(value); return LastStandSaveJson.Write(value); }
    static void Research()
    {
        var s = Fixture(); string raw = LastStandProgression.ResearchSaveTestWrite(s);
        var restored = LastStandProgression.ResearchSaveTestRead(raw);
        Check(raw == LastStandProgression.ResearchSaveTestWrite(restored), "Research exact canonical roundtrip");
        Check(restored.LastObservedUtcMilliseconds == Epoch + 12345, "UTC survives Int32 boundary");
        Check(restored.Snapshot().partials[1].earnedMilliseconds == 12345, "Suspended progress survives");
        Check(restored.Snapshot().slots[0].queued.durationMilliseconds == 0, "Unstarted queue does not gain a timer");
        LastStandResearchTransition a, b;
        Check(s.TryAdvance(1000000000, Epoch + 1000000000, false, out a), "Advance original state");
        Check(restored.TryAdvance(1000000000, Epoch + 1000000000, false, out b), "Advance restored state");
        Check(a.Completions.Count == 3 && LastStandProgression.ResearchSaveTestWrite(a.State) == LastStandProgression.ResearchSaveTestWrite(b.State), "Future completions identical after roundtrip");
        var snapshot = s.Snapshot(); snapshot.revision = 3000000000L; snapshot.nextProjectIdentity = 4000000000L;
        Check(LastStandResearchState.TryRestore(snapshot, out s), "Large revision fixture");
        restored = LastStandProgression.ResearchSaveTestRead(LastStandProgression.ResearchSaveTestWrite(s));
        Check(restored.Revision == 3000000000L && restored.Snapshot().nextProjectIdentity == 4000000000L, "Long identities retain exact value");
    }
    static void InvalidResearch()
    {
        string raw = LastStandProgression.ResearchSaveTestWrite(Fixture());
        Action<Action<Dictionary<string, object>>, string> invalid = (mutation, message) => Reject(
            () => LastStandProgression.ResearchSaveTestRead(Mutate(raw, mutation)), message);
        invalid(x => x.Add("researchData", 99), "Unknown currency rejected");
        invalid(x => x["version"] = 2, "Future schema rejected");
        invalid(x => x["catalogVersion"] = "research-v2", "Unknown catalog rejected");
        invalid(x => x["lastObservedUtcMilliseconds"] = 253402300800000L, "Out-of-range UTC rejected");
        invalid(x => LastStandSaveJson.Array(x["slots"]).Add(null), "Extra slot rejected");
        invalid(x => LastStandSaveJson.Object(x["completedRanks"])["unknown"] = 1, "Extra track rejected");
        invalid(x => LastStandSaveJson.Object(LastStandSaveJson.Object(LastStandSaveJson.Array(x["slots"])[0])["active"])["chargedCost"] = 19, "Stored cost mismatch rejected");
        invalid(x => LastStandSaveJson.Object(LastStandSaveJson.Object(LastStandSaveJson.Array(x["slots"])[0])["queued"])["rank"] = 4, "Skipped queued rank rejected");
        invalid(x => x["completionSequence"] = 1, "Completion sequence must match grants");
        Reject(() => LastStandProgression.ResearchSaveTestRead(raw.Replace("\"revision\":", "\"revision\":1,\"revision\":")), "Duplicate key rejected");
        Reject(() => LastStandProgression.ResearchSaveTestRead(raw.Replace("1790000012345", "1790000012345.5")), "Fractional UTC rejected");
    }
    static LastStandRunHistory HistoryFixture()
    {
        var history = new LastStandRunHistory(7);
        for (int i = 8; i <= 30; i++)
        {
            history.Begin(i, i % 2 + 1, "launcher", "historical-economy-v1", "research-rank-1");
            history.AddActiveTime(3000000000L, .5); history.AddActiveTime(3600000, 5);
            history.AddPausedTime(12345); history.AddClosedTime(86400000);
            history.BankWave(1, 1, 15, 0, "research-rank-1"); history.BankWave(2, 2, 0, 1, "research-rank-2");
            history.Finish(i % 2 == 0 ? "defeat" : "abandon", "research-rank-2");
        }
        history.Begin(31, 1, "retired-fitting", "older-economy", "loaded checkpoint", true, 900);
        return history;
    }
    static void History()
    {
        var history = HistoryFixture(); string raw = LastStandProgression.HistorySaveTestWrite(history);
        var restored = LastStandProgression.HistorySaveTestRead(raw); var snap = restored.Snapshot();
        Check(raw == LastStandProgression.HistorySaveTestWrite(restored), "History exact canonical roundtrip");
        Check(snap.Recent.Count == 20 && snap.Lifetime.Runs == 23 && snap.LastFinalizedRunId == 30, "Ring and lifetime survive");
        Check(snap.Current.RunId == 31 && snap.Current.SinceUpdate && snap.Current.HighestClearedWave == 900, "Legacy current run marked since update");
        Check(snap.Recent[0].ActiveMilliseconds == 3003600000L && snap.Recent[0].SpeedMilliseconds[0] == 3000000000L, "Long duration and mixed speed survive");
        Check(restored.Compare(1).MedianPerHour == history.Compare(1).MedianPerHour, "Farming comparison preserved");
        Check(raw.Length < 65536, "Twenty-row history fits bounded envelope");
        var empty = LastStandProgression.HistorySaveTestRead(LastStandProgression.HistorySaveTestWrite(new LastStandRunHistory(12)));
        Check(empty.Snapshot().LastFinalizedRunId == 12 && empty.Snapshot().Lifetime.Runs == 0, "Migration floor invents no history");
    }
    static void InvalidHistory()
    {
        string raw = LastStandProgression.HistorySaveTestWrite(HistoryFixture());
        Action<Action<Dictionary<string, object>>, string> invalid = (mutation, message) => Reject(
            () => LastStandProgression.HistorySaveTestRead(Mutate(raw, mutation)), message);
        invalid(x => x["version"] = 2, "Future history schema rejected");
        invalid(x => x.Add("unknown", true), "Unknown field rejected");
        invalid(x => LastStandSaveJson.Object(x["lifetime"])["runs"] = 24, "Lifetime drift rejected");
        invalid(x => LastStandSaveJson.Array(x["recent"]).RemoveAt(0), "Missing recent row rejected");
        invalid(x => LastStandSaveJson.Object(LastStandSaveJson.Array(x["recent"])[0])["runId"] = 30, "Duplicate/out-of-order run rejected");
        invalid(x => LastStandSaveJson.Array(LastStandSaveJson.Object(LastStandSaveJson.Array(x["recent"])[0])["speedMilliseconds"])[0] = 1, "Speed bins must sum to active time");
        invalid(x => LastStandSaveJson.Object(x["current"])["runId"] = 29, "Finalized current ID rejected");
        invalid(x => LastStandSaveJson.Object(x["current"])["startContext"] = "bad\nlabel", "Control character rejected");
        invalid(x => LastStandSaveJson.Object(x["lifetime"])["activeMilliseconds"] = 9007199254740991L, "Counter model bound rejected");
    }
    static int Main(string[] args)
    {
        try
        {
            switch (args[0]) { case "research": Research(); break; case "invalid_research": InvalidResearch(); break;
                case "history": History(); break; case "invalid_history": InvalidHistory(); break; default: throw new Exception("Unknown case"); }
            Console.WriteLine("PASS " + args[0]); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
