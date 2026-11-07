using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace SingedTerra.LastStand
{
    // A read-only identity over already saved measurements. Context labels are
    // opaque: never split or interpret them as current upgrade/research state.
    public sealed class LastStandHistoryCohort
    {
        public LastStandRunSummary Anchor { get; }
        readonly long[] speedComposition;

        public LastStandHistoryCohort(LastStandRunSummary anchor)
        {
            Anchor=anchor??throw new ArgumentNullException(nameof(anchor));
            speedComposition=Normalize(anchor);
        }
        static long[] Normalize(LastStandRunSummary run)
        {
            long divisor=run.ActiveMilliseconds;
            foreach(long value in run.SpeedMilliseconds)
            {
                long a=divisor,b=value;
                while(b!=0){long remainder=a%b;a=b;b=remainder;}
                divisor=a;
            }
            var result=new long[run.SpeedMilliseconds.Count];
            if(divisor>0)for(int i=0;i<result.Length;i++)result[i]=run.SpeedMilliseconds[i]/divisor;
            return result;
        }
        public bool Matches(LastStandRunSummary run) => run!=null &&
            String.Equals(Anchor.Fitting,run.Fitting,StringComparison.Ordinal) &&
            String.Equals(Anchor.EconomyVersion,run.EconomyVersion,StringComparison.Ordinal) &&
            String.Equals(Anchor.StartContext,run.StartContext,StringComparison.Ordinal) &&
            String.Equals(Anchor.EndContext,run.EndContext,StringComparison.Ordinal) && SameSpeed(run);
        public bool SameSpeed(LastStandRunSummary run)
        {
            if(run==null)return false;
            var other=Normalize(run);
            for(int i=0;i<speedComposition.Length;i++)if(speedComposition[i]!=other[i])return false;
            return true;
        }
        public string Description
        {
            get
            {
                var text=new StringBuilder("Matches run ").Append(Anchor.RunId)
                    .Append(" in armament, reward rules, starting upgrades and finishing upgrades.");
                text.Append("\nSpeed composition: ");bool any=false;
                for(int i=0;i<speedComposition.Length;i++)if(speedComposition[i]>0)
                {
                    if(any)text.Append(", ");any=true;
                    text.Append(((i+1)*.5).ToString("0.0",CultureInfo.InvariantCulture)).Append("x ")
                        .Append((100.0*Anchor.SpeedMilliseconds[i]/Anchor.ActiveMilliseconds).ToString("0.##",CultureInfo.InvariantCulture)).Append("%");
                }
                if(!any)text.Append("unmeasured");
                return text.ToString();
            }
        }
    }

    public enum LastStandHistoryComparisonState { NoSamples, InsufficientSamples, MixedConditions, Ready }

    public sealed class LastStandHistoryTierComparison
    {
        public int Tier { get; }
        public int Samples { get; }
        public int ShortSamples { get; }
        public int SinceUpdateSamples { get; }
        public int ProvisionalSamples { get; }
        public int UnmeasuredSamples { get; }
        public int OtherConditionSamples { get; }
        public int ExcludedSamples => ShortSamples+SinceUpdateSamples+ProvisionalSamples+UnmeasuredSamples+OtherConditionSamples;
        public bool MixedConditions { get; }
        public double? MedianPerHour { get; }
        public LastStandHistoryComparisonState State { get; }
        internal LastStandHistoryTierComparison(int tier,List<double> rates,int shorts,int since,int provisional,
            int unmeasured,int others,bool mixed)
        {
            Tier=tier;Samples=rates.Count;ShortSamples=shorts;SinceUpdateSamples=since;ProvisionalSamples=provisional;
            UnmeasuredSamples=unmeasured;OtherConditionSamples=others;MixedConditions=mixed;
            State=mixed?LastStandHistoryComparisonState.MixedConditions:
                Samples==0?LastStandHistoryComparisonState.NoSamples:
                Samples<LastStandHistoryComparison.MinimumSamples?LastStandHistoryComparisonState.InsufficientSamples:
                LastStandHistoryComparisonState.Ready;
            if(State==LastStandHistoryComparisonState.Ready)
            {
                rates.Sort();int middle=Samples/2;
                MedianPerHour=Samples%2==1?rates[middle]:(rates[middle-1]+rates[middle])/2;
            }
        }
        public string Description
        {
            get
            {
                var text=new StringBuilder("TIER ").Append(Tier).Append("\n");
                if(State==LastStandHistoryComparisonState.MixedConditions)
                    text.Append("Mixed conditions: select one condition group to see a median.");
                else if(MedianPerHour.HasValue)
                    text.Append(MedianPerHour.Value.ToString("0.0",CultureInfo.InvariantCulture)).Append(" repeatable Salvage / active hour | median of ").Append(Samples).Append(" runs");
                else text.Append("Insufficient samples: ").Append(Samples).Append(" / ").Append(LastStandHistoryComparison.MinimumSamples)
                    .Append(" complete runs of at least 5 minutes. Median unavailable.");
                text.Append("\nExcluded in this tier: ").Append(ShortSamples).Append(" under 5 minutes, ")
                    .Append(SinceUpdateSamples).Append(" since update, ").Append(ProvisionalSamples).Append(" provisional, ")
                    .Append(UnmeasuredSamples).Append(" without active time, ").Append(OtherConditionSamples).Append(" other conditions.");
                text.Append(" Small samples do not prove the best farming tier.");
                return text.ToString();
            }
        }
    }

    public enum LastStandHistoryPairState { SameRun, IncompleteMeasurements, Ready }

    public sealed class LastStandHistoryPairComparison
    {
        public LastStandRunSummary A { get; }
        public LastStandRunSummary B { get; }
        public IReadOnlyList<string> Differences { get; }
        public bool MixedConditions { get; }
        public long WaveDelta => (long)B.HighestClearedWave-A.HighestClearedWave;
        public long ActiveMillisecondsDelta => B.ActiveMilliseconds-A.ActiveMilliseconds;
        public long RepeatableSalvageDelta => (B.RepeatableSalvage+B.ResearchBonusSalvage)-(A.RepeatableSalvage+A.ResearchBonusSalvage);
        public double? RateDeltaPerHour { get; }
        public LastStandHistoryPairState State { get; }
        internal LastStandHistoryPairComparison(LastStandRunSummary a,LastStandRunSummary b)
        {
            A=a??throw new ArgumentNullException(nameof(a));B=b??throw new ArgumentNullException(nameof(b));
            var differences=new List<string>();var cohort=new LastStandHistoryCohort(a);
            if(a.Tier!=b.Tier)differences.Add("Tier");
            if(a.EconomyVersion!=b.EconomyVersion)differences.Add("Economy");
            if(a.Fitting!=b.Fitting)differences.Add("Fitting");
            if(a.StartContext!=b.StartContext)differences.Add("Start context");
            if(a.EndContext!=b.EndContext)differences.Add("End context");
            if(!cohort.SameSpeed(b))differences.Add("Speed composition");
            Differences=differences.AsReadOnly();MixedConditions=!cohort.Matches(b);
            State=a.RunId==b.RunId?LastStandHistoryPairState.SameRun:
                !LastStandHistoryComparison.Eligible(a)||!LastStandHistoryComparison.Eligible(b)?LastStandHistoryPairState.IncompleteMeasurements:
                LastStandHistoryPairState.Ready;
            if(State==LastStandHistoryPairState.Ready)RateDeltaPerHour=b.FarmingRate.Value-a.FarmingRate.Value;
        }
        public string Description
        {
            get
            {
                var text=new StringBuilder("RUN ").Append(A.RunId).Append(" (A) TO RUN ").Append(B.RunId).Append(" (B)\n");
                if(State==LastStandHistoryPairState.SameRun)text.Append("Select two different runs. Rate delta unavailable.");
                else if(RateDeltaPerHour.HasValue)
                    text.Append("B minus A: ").Append(RateDeltaPerHour.Value.ToString("+0.0;-0.0;0.0",CultureInfo.InvariantCulture))
                        .Append(" repeatable Salvage / active hour");
                else text.Append("Rate delta unavailable. Both runs need full finalized measurements and at least 5 minutes of active time.")
                    .Append("\nA: ").Append(LastStandHistoryComparison.MeasurementState(A)).Append(" | B: ").Append(LastStandHistoryComparison.MeasurementState(B));
                text.Append("\nB minus A measured totals: ").Append(WaveDelta.ToString("+0;-0;0",CultureInfo.InvariantCulture))
                    .Append(" cleared waves; ").Append(RepeatableSalvageDelta.ToString("+0;-0;0",CultureInfo.InvariantCulture))
                    .Append(" repeatable Salvage; ").Append((ActiveMillisecondsDelta/60000.0).ToString("+0.00;-0.00;0.00",CultureInfo.InvariantCulture)).Append(" active minutes.");
                text.Append("\nDifferent: ").Append(Differences.Count==0?"none of the recorded conditions":String.Join(", ",Differences));
                if(MixedConditions)text.Append(". Mixed conditions.");
                text.Append("\nThis is an observation, not a causal improvement or a best-tier recommendation.");
                return text.ToString();
            }
        }
    }

    public static class LastStandHistoryComparison
    {
        public const int MinimumSamples=3;
        public const long MinimumActiveMilliseconds=300000;
        public static bool Eligible(LastStandRunSummary run)=>run!=null&&run.Finalized&&!run.SinceUpdate&&run.ActiveMilliseconds>=MinimumActiveMilliseconds;
        public static string MeasurementState(LastStandRunSummary run)
        {
            if(run==null)throw new ArgumentNullException(nameof(run));
            if(!run.Finalized)return "provisional";
            if(run.SinceUpdate)return "since update; earlier measurements unavailable";
            if(run.ActiveMilliseconds==0)return "no active time";
            if(run.ActiveMilliseconds<MinimumActiveMilliseconds)return "under 5 minutes";
            return "complete measurement";
        }
        public static IReadOnlyList<LastStandHistoryCohort> Cohorts(LastStandHistorySnapshot snapshot)
        {
            if(snapshot==null)throw new ArgumentNullException(nameof(snapshot));
            var cohorts=new List<LastStandHistoryCohort>();
            for(int i=snapshot.Recent.Count-1;i>=0;i--)AddCohort(cohorts,snapshot.Recent[i]);
            if(snapshot.Current!=null)AddCohort(cohorts,snapshot.Current);
            return cohorts.AsReadOnly();
        }
        static void AddCohort(List<LastStandHistoryCohort> cohorts,LastStandRunSummary run)
        {
            foreach(var cohort in cohorts)if(cohort.Matches(run))return;
            cohorts.Add(new LastStandHistoryCohort(run));
        }
        public static LastStandHistoryTierComparison ForTier(LastStandHistorySnapshot snapshot,int tier,LastStandHistoryCohort cohort)
        {
            if(snapshot==null)throw new ArgumentNullException(nameof(snapshot));
            if(tier<1)throw new ArgumentOutOfRangeException(nameof(tier));
            var rates=new List<double>();var eligibleCohorts=new List<LastStandHistoryCohort>();
            int shorts=0,since=0,provisional=0,unmeasured=0,others=0;
            var runs=new List<LastStandRunSummary>(snapshot.Recent);if(snapshot.Current!=null)runs.Add(snapshot.Current);
            foreach(var run in runs)
            {
                if(run.Tier!=tier)continue;
                if(!run.Finalized){provisional++;continue;}
                if(run.SinceUpdate){since++;continue;}
                if(run.ActiveMilliseconds==0){unmeasured++;continue;}
                if(run.ActiveMilliseconds<MinimumActiveMilliseconds){shorts++;continue;}
                if(cohort!=null&&!cohort.Matches(run)){others++;continue;}
                rates.Add(run.FarmingRate.Value);AddCohort(eligibleCohorts,run);
            }
            return new LastStandHistoryTierComparison(tier,rates,shorts,since,provisional,unmeasured,others,eligibleCohorts.Count>1);
        }
        public static LastStandHistoryPairComparison Between(LastStandRunSummary a,LastStandRunSummary b)=>new LastStandHistoryPairComparison(a,b);
    }
}
