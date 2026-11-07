using System;
using System.Collections.Generic;
using System.Globalization;

namespace SingedTerra.LastStand
{
    // Pure checkpoint-owned telemetry. The transaction owner persists a clone at
    // each accepted wave and terminal boundary, never on a browser close event.
    public sealed class LastStandRunSummary
    {
        public int RunId { get; }
        public int Tier { get; }
        public string Fitting { get; }
        public string EconomyVersion { get; }
        public string StartContext { get; }
        public string EndContext { get; }
        public int HighestClearedWave { get; }
        public string FinishReason { get; }
        public bool SinceUpdate { get; }
        public long ActiveMilliseconds { get; }
        public long PausedMilliseconds { get; }
        public long ClosedMilliseconds { get; }
        public long RepeatableSalvage { get; }
        public long MilestoneSalvage { get; }
        public long ResearchBonusSalvage { get; }
        public IReadOnlyList<long> SpeedMilliseconds { get; }
        public bool Finalized => FinishReason != "";
        public bool Comparable => !SinceUpdate && ActiveMilliseconds > 0 && Finalized;
        public bool ShortSample => ActiveMilliseconds < 300000;
        public double? FarmingRate => ActiveMilliseconds == 0 ? (double?)null :
            (RepeatableSalvage + ResearchBonusSalvage) * (3600000.0 / ActiveMilliseconds);

        public LastStandRunSummary(int runId, int tier, string fitting, string economyVersion,
            string startContext, string endContext, int highestClearedWave, string finishReason,
            bool sinceUpdate, long activeMilliseconds, long pausedMilliseconds, long closedMilliseconds,
            long repeatableSalvage, long milestoneSalvage, long researchBonusSalvage, IEnumerable<long> speedMilliseconds)
        {
            if (runId < 1 || tier < 1 || highestClearedWave < 0 ||
                (finishReason != "" && finishReason != "defeat" && finishReason != "abandon"))
                throw new ArgumentException("Invalid run history identity or outcome.");
            LastStandRunHistory.ValidateText(fitting, 80, false);
            LastStandRunHistory.ValidateText(economyVersion, 80, false);
            LastStandRunHistory.ValidateText(startContext, 256, true);
            LastStandRunHistory.ValidateText(endContext, 256, true);
            foreach (long value in new[] {activeMilliseconds, pausedMilliseconds, closedMilliseconds,
                repeatableSalvage, milestoneSalvage, researchBonusSalvage}) LastStandRunHistory.ValidateCounter(value);
            LastStandRunHistory.Sum(repeatableSalvage, researchBonusSalvage);
            if (speedMilliseconds == null) throw new ArgumentNullException(nameof(speedMilliseconds));
            var speeds = new List<long>(); long sum = 0;
            foreach (long value in speedMilliseconds)
            {
                if (speeds.Count == 10) throw new ArgumentException("Too many speed bins.");
                LastStandRunHistory.ValidateCounter(value); sum = LastStandRunHistory.Sum(sum,value); speeds.Add(value);
            }
            if (speeds.Count != 10 || sum != activeMilliseconds) throw new ArgumentException("Speed mix must equal active duration.");
            RunId=runId; Tier=tier; Fitting=fitting; EconomyVersion=economyVersion; StartContext=startContext;
            EndContext=endContext; HighestClearedWave=highestClearedWave; FinishReason=finishReason;
            SinceUpdate=sinceUpdate; ActiveMilliseconds=activeMilliseconds; PausedMilliseconds=pausedMilliseconds;
            ClosedMilliseconds=closedMilliseconds; RepeatableSalvage=repeatableSalvage;
            MilestoneSalvage=milestoneSalvage; ResearchBonusSalvage=researchBonusSalvage;
            SpeedMilliseconds=speeds.AsReadOnly();
        }
        internal LastStandRunSummary With(int? wave=null, string reason=null, string context=null,
            long? active=null, long? paused=null, long? closed=null, long? repeatable=null,
            long? milestone=null, long? bonus=null, IEnumerable<long> speeds=null) =>
            new LastStandRunSummary(RunId,Tier,Fitting,EconomyVersion,StartContext,context??EndContext,
                wave??HighestClearedWave,reason??FinishReason,SinceUpdate,active??ActiveMilliseconds,
                paused??PausedMilliseconds,closed??ClosedMilliseconds,repeatable??RepeatableSalvage,
                milestone??MilestoneSalvage,bonus??ResearchBonusSalvage,speeds??SpeedMilliseconds);
    }

    public sealed class LastStandHistoryAggregate
    {
        public int Tier { get; }
        public int Runs { get; }
        public int BestWave { get; }
        public long ActiveMilliseconds { get; }
        public long RepeatableSalvage { get; }
        public long MilestoneSalvage { get; }
        public long ResearchBonusSalvage { get; }
        public LastStandHistoryAggregate(int tier, int runs, int bestWave, long activeMilliseconds,
            long repeatableSalvage, long milestoneSalvage, long researchBonusSalvage)
        {
            if(tier<0 || runs<0 || bestWave<0)throw new ArgumentException("Invalid aggregate.");
            foreach(long value in new[]{activeMilliseconds,repeatableSalvage,milestoneSalvage,researchBonusSalvage})
                LastStandRunHistory.ValidateCounter(value);
            if(runs==0 && (bestWave!=0 || activeMilliseconds!=0 || repeatableSalvage!=0 ||
                milestoneSalvage!=0 || researchBonusSalvage!=0))throw new ArgumentException("Empty aggregate has measurements.");
            Tier=tier;Runs=runs;BestWave=bestWave;ActiveMilliseconds=activeMilliseconds;
            RepeatableSalvage=repeatableSalvage;MilestoneSalvage=milestoneSalvage;ResearchBonusSalvage=researchBonusSalvage;
        }
        internal LastStandHistoryAggregate Add(LastStandRunSummary run) => new LastStandHistoryAggregate(
            Tier,checked(Runs+1),Math.Max(BestWave,run.HighestClearedWave),
            LastStandRunHistory.Sum(ActiveMilliseconds,run.ActiveMilliseconds),
            LastStandRunHistory.Sum(RepeatableSalvage,run.RepeatableSalvage),
            LastStandRunHistory.Sum(MilestoneSalvage,run.MilestoneSalvage),
            LastStandRunHistory.Sum(ResearchBonusSalvage,run.ResearchBonusSalvage));
    }

    public sealed class LastStandHistorySnapshot
    {
        public int LastFinalizedRunId { get; }
        public LastStandRunSummary Current { get; }
        public IReadOnlyList<LastStandRunSummary> Recent { get; }
        public IReadOnlyList<LastStandHistoryAggregate> Tiers { get; }
        public LastStandHistoryAggregate Lifetime { get; }
        public LastStandHistorySnapshot(int lastFinalizedRunId, LastStandRunSummary current,
            IEnumerable<LastStandRunSummary> recent, IEnumerable<LastStandHistoryAggregate> tiers,
            LastStandHistoryAggregate lifetime)
        {
            if(lastFinalizedRunId<0 || recent==null || tiers==null || lifetime==null || lifetime.Tier!=0 ||
                (current!=null && (current.Finalized || current.RunId<=lastFinalizedRunId)))
                throw new ArgumentException("Invalid history snapshot.");
            var results=new List<LastStandRunSummary>(); int previous=0;
            foreach(var run in recent)
            {
                if(results.Count==LastStandRunHistory.MaximumRecent || run==null || !run.Finalized ||
                    run.RunId<=previous || run.RunId>lastFinalizedRunId)throw new ArgumentException("Invalid recent run order.");
                previous=run.RunId; results.Add(run);
            }
            var aggregates=new List<LastStandHistoryAggregate>(); var ids=new HashSet<int>();
            int count=0,best=0;long active=0,repeat=0,milestone=0,bonus=0;
            foreach(var tier in tiers)
            {
                if(aggregates.Count==LastStandRunHistory.MaximumTiers || tier==null || tier.Tier<1 ||
                    !ids.Add(tier.Tier))throw new ArgumentException("Invalid aggregate tier.");
                count=checked(count+tier.Runs);best=Math.Max(best,tier.BestWave);
                active=LastStandRunHistory.Sum(active,tier.ActiveMilliseconds);
                repeat=LastStandRunHistory.Sum(repeat,tier.RepeatableSalvage);
                milestone=LastStandRunHistory.Sum(milestone,tier.MilestoneSalvage);
                bonus=LastStandRunHistory.Sum(bonus,tier.ResearchBonusSalvage); aggregates.Add(tier);
                int sampleCount=0,sampleBest=0;long sampleActive=0,sampleRepeat=0,sampleMilestone=0,sampleBonus=0;
                foreach(var run in results)if(run.Tier==tier.Tier)
                { sampleCount++;sampleBest=Math.Max(sampleBest,run.HighestClearedWave);
                  sampleActive=LastStandRunHistory.Sum(sampleActive,run.ActiveMilliseconds);
                  sampleRepeat=LastStandRunHistory.Sum(sampleRepeat,run.RepeatableSalvage);
                  sampleMilestone=LastStandRunHistory.Sum(sampleMilestone,run.MilestoneSalvage);
                  sampleBonus=LastStandRunHistory.Sum(sampleBonus,run.ResearchBonusSalvage); }
                if(sampleCount>tier.Runs || sampleBest>tier.BestWave || sampleActive>tier.ActiveMilliseconds ||
                    sampleRepeat>tier.RepeatableSalvage || sampleMilestone>tier.MilestoneSalvage ||
                    sampleBonus>tier.ResearchBonusSalvage)throw new ArgumentException("Recent samples exceed aggregate.");
            }
            if(count!=lifetime.Runs || best!=lifetime.BestWave || active!=lifetime.ActiveMilliseconds ||
                repeat!=lifetime.RepeatableSalvage || milestone!=lifetime.MilestoneSalvage ||
                bonus!=lifetime.ResearchBonusSalvage || count>lastFinalizedRunId)
                throw new ArgumentException("Lifetime aggregate does not match tiers.");
            foreach(var run in results)if(!ids.Contains(run.Tier))throw new ArgumentException("Missing run aggregate.");
            if(count>0 && (results.Count!=Math.Min(count,LastStandRunHistory.MaximumRecent) || previous!=lastFinalizedRunId))
                throw new ArgumentException("Missing latest finalized history.");
            LastFinalizedRunId=lastFinalizedRunId;Current=current;Recent=results.AsReadOnly();
            aggregates.Sort((a,b)=>a.Tier.CompareTo(b.Tier));Tiers=aggregates.AsReadOnly();Lifetime=lifetime;
        }
    }

    public sealed class LastStandRunHistory
    {
        public const int MaximumRecent=20, MaximumTiers=64;
        public const long MaximumCounter=9000000000000000L;
        LastStandHistorySnapshot snapshot;
        public LastStandRunHistory(int finalizedFloor=0) : this(new LastStandHistorySnapshot(finalizedFloor,null,
            new LastStandRunSummary[0],new LastStandHistoryAggregate[0],new LastStandHistoryAggregate(0,0,0,0,0,0,0))) { }
        public LastStandRunHistory(LastStandHistorySnapshot restored)
        { snapshot=restored??throw new ArgumentNullException(nameof(restored)); }
        public LastStandHistorySnapshot Snapshot()=>snapshot;
        public LastStandRunHistory Copy()=>new LastStandRunHistory(snapshot);
        public LastStandRunSummary Current=>snapshot.Current;
        internal static void ValidateCounter(long value)
        { if(value<0 || value>MaximumCounter)throw new ArgumentOutOfRangeException(nameof(value)); }
        internal static long Sum(long a,long b) { long total=checked(a+b);ValidateCounter(total);return total; }
        internal static void ValidateText(string value,int bound,bool empty)
        {
            if(value==null || value.Length>bound || (!empty && String.IsNullOrWhiteSpace(value)))throw new ArgumentException("Invalid history label.");
            foreach(char c in value)if(Char.IsControl(c))throw new ArgumentException("Control character in history label.");
        }
        void SetCurrent(LastStandRunSummary current) => snapshot=new LastStandHistorySnapshot(snapshot.LastFinalizedRunId,
            current,snapshot.Recent,snapshot.Tiers,snapshot.Lifetime);
        LastStandRunSummary RequireCurrent()=>Current??throw new InvalidOperationException("No active history run.");
        public void Begin(int runId,int tier,string fitting,string economyVersion,string startContext,
            bool sinceUpdate=false,int initialClearedWave=0)
        {
            if(Current!=null || runId<=snapshot.LastFinalizedRunId)throw new InvalidOperationException("Run already active or finalized.");
            SetCurrent(new LastStandRunSummary(runId,tier,fitting,economyVersion,startContext,startContext,
                initialClearedWave,"",sinceUpdate,0,0,0,0,0,0,new long[10]));
        }
        public void AddActiveTime(long milliseconds,double speed)
        {
            var run=RequireCurrent();ValidateCounter(milliseconds);
            if(Double.IsNaN(speed)||Double.IsInfinity(speed)||speed<.5||speed>5||speed*2!=Math.Floor(speed*2))
                throw new ArgumentOutOfRangeException(nameof(speed));
            var bins=new List<long>(run.SpeedMilliseconds);int index=(int)(speed*2)-1;
            bins[index]=Sum(bins[index],milliseconds);
            SetCurrent(run.With(active:Sum(run.ActiveMilliseconds,milliseconds),speeds:bins));
        }
        public void AddPausedTime(long milliseconds)
        { var run=RequireCurrent();ValidateCounter(milliseconds);SetCurrent(run.With(paused:Sum(run.PausedMilliseconds,milliseconds))); }
        public void AddClosedTime(long milliseconds)
        { var run=RequireCurrent();ValidateCounter(milliseconds);SetCurrent(run.With(closed:Sum(run.ClosedMilliseconds,milliseconds))); }
        // Returns false for a retried accepted boundary. Values are *increments*,
        // and bonus is only the research increment, never part of base repeatable.
        public bool BankWave(int wave,long repeatable,long milestone,long researchBonus,string endContext)
        {
            var run=RequireCurrent();ValidateCounter(repeatable);ValidateCounter(milestone);ValidateCounter(researchBonus);
            ValidateText(endContext,256,true);
            if(wave==run.HighestClearedWave)return false;
            if(wave!=checked(run.HighestClearedWave+1))throw new ArgumentException("Wave history must advance one accepted boundary.");
            SetCurrent(run.With(wave:wave,context:endContext,repeatable:Sum(run.RepeatableSalvage,repeatable),
                milestone:Sum(run.MilestoneSalvage,milestone),bonus:Sum(run.ResearchBonusSalvage,researchBonus)));
            return true;
        }
        public bool Finish(string reason,string endContext)
        {
            if(reason!="defeat" && reason!="abandon")throw new ArgumentException("Only defeat or explicit abandon finalizes history.");
            if(Current==null)return false;
            var final=Current.With(reason:reason,context:endContext);
            var recent=new List<LastStandRunSummary>(snapshot.Recent);recent.Add(final);
            if(recent.Count>MaximumRecent)recent.RemoveAt(0);
            var tiers=new List<LastStandHistoryAggregate>(snapshot.Tiers);int index=tiers.FindIndex(t=>t.Tier==final.Tier);
            if(index<0)tiers.Add(new LastStandHistoryAggregate(final.Tier,0,0,0,0,0,0).Add(final));
            else tiers[index]=tiers[index].Add(final);
            snapshot=new LastStandHistorySnapshot(final.RunId,null,recent,tiers,snapshot.Lifetime.Add(final));return true;
        }
        public LastStandFarmingComparison Compare(int tier)
        {
            if(tier<0)throw new ArgumentOutOfRangeException(nameof(tier));
            var rates=new List<double>();var contexts=new HashSet<string>(StringComparer.Ordinal);
            int shorts=0,excluded=0;
            foreach(var run in snapshot.Recent)if(tier==0 || run.Tier==tier)
            {
                if(!run.Comparable){excluded++;continue;}
                rates.Add(run.FarmingRate.Value);if(run.ShortSample)shorts++;
                long divisor=run.ActiveMilliseconds;
                foreach(long value in run.SpeedMilliseconds)if(value>0)
                {long a=divisor,b=value;while(b!=0){long remainder=a%b;a=b;b=remainder;}divisor=a;}
                string mix="";for(int n=0;n<run.SpeedMilliseconds.Count;n++)mix+=(run.SpeedMilliseconds[n]/divisor)+",";
                contexts.Add(run.Fitting+"|"+run.EconomyVersion+"|"+run.StartContext+"|"+run.EndContext+"|"+mix);
            }
            rates.Sort();double? median=rates.Count==0?(double?)null:rates.Count%2==1?rates[rates.Count/2]:
                (rates[rates.Count/2-1]+rates[rates.Count/2])/2;
            return new LastStandFarmingComparison(tier,rates.Count,shorts,excluded,contexts.Count>1,median);
        }
    }
    public sealed class LastStandFarmingComparison
    {
        public int Tier { get; }
        public int Samples { get; }
        public int ShortSamples { get; }
        public int ExcludedSamples { get; }
        public bool MixedContexts { get; }
        public double? MedianPerHour { get; }
        internal LastStandFarmingComparison(int tier,int samples,int shorts,int excluded,bool mixed,double? median)
        {Tier=tier;Samples=samples;ShortSamples=shorts;ExcludedSamples=excluded;MixedContexts=mixed;MedianPerHour=median;}
        public string Description => (MedianPerHour.HasValue?MedianPerHour.Value.ToString("0.0",CultureInfo.InvariantCulture)+" Salvage / active hour":"No comparable samples")+
            " | median of "+Samples+" recent runs"+(ShortSamples>0?" | "+ShortSamples+" under 5 minutes: unstable rates":"")+
            (MixedContexts?" | different fitting, speed or upgrade contexts":"")+
            (ExcludedSamples>0?" | "+ExcludedSamples+" incomplete measurements excluded":"")+". Small samples do not prove the best farming tier.";
    }
}
