using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        static long ResearchLong(Dictionary<string, object> map, string key) => LastStandSaveJson.LongInteger(map[key]);
        static object ResearchProjectJson(LastStandResearchProjectSnapshot p) => p == null ? null : Map(
            "identity", p.identity, "track", LastStandResearchCatalog.Get(p.track).Key, "rank", p.rank,
            "chargedCost", p.chargedCost, "durationMilliseconds", p.durationMilliseconds, "earnedMilliseconds", p.earnedMilliseconds);
        static Dictionary<string, object> ResearchJson(LastStandResearchState state)
        {
            if (state == null) throw new FormatException("Missing research state.");
            var s = state.Snapshot(); var ranks = Map(); var partials = Map(); var slots = new List<object>();
            foreach (var definition in LastStandResearchCatalog.Tracks)
            {
                int index = (int)definition.Id;
                ranks.Add(definition.Key, s.completedRanks[index]); partials.Add(definition.Key, ResearchProjectJson(s.partials[index]));
            }
            foreach (var slot in s.slots) slots.Add(Map("active", ResearchProjectJson(slot.active), "queued", ResearchProjectJson(slot.queued)));
            return Map("version", s.version, "catalogVersion", s.catalogVersion, "revision", s.revision,
                "lastObservedUtcMilliseconds", s.lastObservedUtcMilliseconds, "nextProjectIdentity", s.nextProjectIdentity,
                "completionSequence", s.completionSequence, "completedRanks", ranks, "slots", slots, "partials", partials);
        }
        static LastStandResearchProjectSnapshot ReadResearchProject(object value)
        {
            if (value == null) return null;
            var p = LastStandSaveJson.Object(value);
            LastStandSaveJson.Fields(p, "identity", "track", "rank", "chargedCost", "durationMilliseconds", "earnedMilliseconds");
            if (!LastStandResearchCatalog.TryGet(Text(p, "track"), out var definition)) throw new FormatException("Unknown research track.");
            return new LastStandResearchProjectSnapshot { identity = ResearchLong(p, "identity"), track = definition.Id,
                rank = Number(p, "rank"), chargedCost = ResearchLong(p, "chargedCost"),
                durationMilliseconds = ResearchLong(p, "durationMilliseconds"), earnedMilliseconds = ResearchLong(p, "earnedMilliseconds") };
        }
        static LastStandResearchState ReadResearch(object value)
        {
            var r = LastStandSaveJson.Object(value);
            LastStandSaveJson.Fields(r, "version", "catalogVersion", "revision", "lastObservedUtcMilliseconds", "nextProjectIdentity",
                "completionSequence", "completedRanks", "slots", "partials");
            var ranks = LastStandSaveJson.Object(r["completedRanks"]); var partials = LastStandSaveJson.Object(r["partials"]);
            var keys = new List<string>(); foreach (var definition in LastStandResearchCatalog.Tracks) keys.Add(definition.Key);
            LastStandSaveJson.Fields(ranks, keys.ToArray()); LastStandSaveJson.Fields(partials, keys.ToArray());
            var slots = LastStandSaveJson.Array(r["slots"]);
            if (slots.Count != LastStandResearchCatalog.SlotCount) throw new FormatException("Invalid research slot count.");
            var result = new LastStandResearchSnapshot { version = Number(r, "version"), catalogVersion = Text(r, "catalogVersion"),
                revision = ResearchLong(r, "revision"), lastObservedUtcMilliseconds = ResearchLong(r, "lastObservedUtcMilliseconds"),
                nextProjectIdentity = ResearchLong(r, "nextProjectIdentity"), completionSequence = ResearchLong(r, "completionSequence") };
            foreach (var definition in LastStandResearchCatalog.Tracks)
            {
                int index = (int)definition.Id;
                result.completedRanks[index] = Number(ranks, definition.Key); result.partials[index] = ReadResearchProject(partials[definition.Key]);
            }
            for (int i = 0; i < slots.Count; i++)
            {
                var slot = LastStandSaveJson.Object(slots[i]); LastStandSaveJson.Fields(slot, "active", "queued");
                result.slots[i] = new LastStandResearchSlotSnapshot { active = ReadResearchProject(slot["active"]), queued = ReadResearchProject(slot["queued"]) };
            }
            if (!LastStandResearchState.TryRestore(result, out var state)) throw new FormatException("Invalid research state.");
            return state;
        }

        static object HistoryRunJson(LastStandRunSummary run) => run == null ? null : Map(
            "runId", run.RunId, "tier", run.Tier, "fitting", run.Fitting, "economyVersion", run.EconomyVersion,
            "startContext", run.StartContext, "endContext", run.EndContext, "highestClearedWave", run.HighestClearedWave,
            "finishReason", run.FinishReason, "sinceUpdate", run.SinceUpdate, "activeMilliseconds", run.ActiveMilliseconds,
            "pausedMilliseconds", run.PausedMilliseconds, "closedMilliseconds", run.ClosedMilliseconds,
            "repeatableSalvage", run.RepeatableSalvage, "milestoneSalvage", run.MilestoneSalvage,
            "researchBonusSalvage", run.ResearchBonusSalvage, "speedMilliseconds", run.SpeedMilliseconds);
        static object HistoryAggregateJson(LastStandHistoryAggregate aggregate) => Map("tier", aggregate.Tier,
            "runs", aggregate.Runs, "bestWave", aggregate.BestWave, "activeMilliseconds", aggregate.ActiveMilliseconds,
            "repeatableSalvage", aggregate.RepeatableSalvage, "milestoneSalvage", aggregate.MilestoneSalvage,
            "researchBonusSalvage", aggregate.ResearchBonusSalvage);
        static Dictionary<string, object> HistoryJson(LastStandRunHistory history)
        {
            if (history == null) throw new FormatException("Missing run history.");
            var snapshot = history.Snapshot(); var recent = new List<object>(); var tiers = new List<object>();
            foreach (var run in snapshot.Recent) recent.Add(HistoryRunJson(run));
            foreach (var tier in snapshot.Tiers) tiers.Add(HistoryAggregateJson(tier));
            return Map("version", 1, "lastFinalizedRunId", snapshot.LastFinalizedRunId, "current", HistoryRunJson(snapshot.Current),
                "recent", recent, "tiers", tiers, "lifetime", HistoryAggregateJson(snapshot.Lifetime));
        }
        static LastStandRunSummary ReadHistoryRun(object value)
        {
            if (value == null) return null;
            var r = LastStandSaveJson.Object(value);
            LastStandSaveJson.Fields(r, "runId", "tier", "fitting", "economyVersion", "startContext", "endContext",
                "highestClearedWave", "finishReason", "sinceUpdate", "activeMilliseconds", "pausedMilliseconds", "closedMilliseconds",
                "repeatableSalvage", "milestoneSalvage", "researchBonusSalvage", "speedMilliseconds");
            var speeds = LastStandSaveJson.Array(r["speedMilliseconds"]);
            if (speeds.Count != 10) throw new FormatException("Invalid speed history count.");
            var milliseconds = new List<long>(); foreach (var item in speeds) milliseconds.Add(LastStandSaveJson.LongInteger(item));
            return new LastStandRunSummary(Number(r, "runId"), Number(r, "tier"), Text(r, "fitting"), Text(r, "economyVersion"),
                Text(r, "startContext"), Text(r, "endContext"), Number(r, "highestClearedWave"), Text(r, "finishReason"), Bool(r, "sinceUpdate"),
                ResearchLong(r, "activeMilliseconds"), ResearchLong(r, "pausedMilliseconds"), ResearchLong(r, "closedMilliseconds"),
                ResearchLong(r, "repeatableSalvage"), ResearchLong(r, "milestoneSalvage"), ResearchLong(r, "researchBonusSalvage"), milliseconds);
        }
        static LastStandHistoryAggregate ReadHistoryAggregate(object value)
        {
            var r = LastStandSaveJson.Object(value);
            LastStandSaveJson.Fields(r, "tier", "runs", "bestWave", "activeMilliseconds", "repeatableSalvage", "milestoneSalvage", "researchBonusSalvage");
            return new LastStandHistoryAggregate(Number(r, "tier"), Number(r, "runs"), Number(r, "bestWave"), ResearchLong(r, "activeMilliseconds"),
                ResearchLong(r, "repeatableSalvage"), ResearchLong(r, "milestoneSalvage"), ResearchLong(r, "researchBonusSalvage"));
        }
        static LastStandRunHistory ReadHistory(object value)
        {
            var r = LastStandSaveJson.Object(value);
            LastStandSaveJson.Fields(r, "version", "lastFinalizedRunId", "current", "recent", "tiers", "lifetime");
            if (Number(r, "version") != 1) throw new FormatException("Unsupported run history version.");
            var recent = LastStandSaveJson.Array(r["recent"]); var tiers = LastStandSaveJson.Array(r["tiers"]);
            if (recent.Count > LastStandRunHistory.MaximumRecent || tiers.Count > LastStandRunHistory.MaximumTiers)
                throw new FormatException("Run history exceeds bound.");
            var runs = new List<LastStandRunSummary>(); foreach (var item in recent) runs.Add(ReadHistoryRun(item));
            var aggregates = new List<LastStandHistoryAggregate>(); foreach (var item in tiers) aggregates.Add(ReadHistoryAggregate(item));
            return new LastStandRunHistory(new LastStandHistorySnapshot(Number(r, "lastFinalizedRunId"), ReadHistoryRun(r["current"]),
                runs, aggregates, ReadHistoryAggregate(r["lifetime"])));
        }
    }
}
