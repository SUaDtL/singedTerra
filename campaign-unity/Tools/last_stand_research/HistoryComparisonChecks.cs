using System;
using System.Collections.Generic;
using System.Linq;
using SingedTerra.LastStand;

static class HistoryComparisonChecks
{
    static void Require(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static LastStandRunSummary Run(int id,int tier=1,long active=600000,long salvage=100,
        string economy="current",string fitting="repair",string start="opaque start",string end="opaque end",
        bool since=false,string reason="defeat",long milestone=0,long bonus=0,long pause=0,long closed=0,long[] bins=null,int wave=50)
    {
        if(bins==null){bins=new long[10];bins[1]=active;}
        return new LastStandRunSummary(id,tier,fitting,economy,start,end,wave,reason,since,active,pause,closed,
            salvage,milestone,bonus,bins);
    }
    static LastStandHistorySnapshot Snapshot(params LastStandRunSummary[] runs)
    {
        var recent=new List<LastStandRunSummary>();var tiers=new Dictionary<int,LastStandHistoryAggregate>();
        var lifetime=new LastStandHistoryAggregate(0,0,0,0,0,0,0);LastStandRunSummary current=null;int last=0;
        foreach(var run in runs)
        {
            if(!run.Finalized){current=run;continue;}
            recent.Add(run);last=run.RunId;lifetime=lifetime.Add(run);
            if(!tiers.ContainsKey(run.Tier))tiers.Add(run.Tier,new LastStandHistoryAggregate(run.Tier,0,0,0,0,0,0));
            tiers[run.Tier]=tiers[run.Tier].Add(run);
        }
        return new LastStandHistorySnapshot(last,current,recent,tiers.Values,lifetime);
    }
    static void CohortIdentity()
    {
        var bins=new long[10];bins[0]=200000;bins[9]=400000;
        var twice=new long[10];twice[0]=400000;twice[9]=800000;
        var anchor=Run(1,bins:bins);var cohort=new LastStandHistoryCohort(anchor);
        Require(cohort.Matches(Run(2,tier:2,active:1200000,bins:twice)),"normalized speed composition spans duration and tier");
        Require(!cohort.Matches(Run(3,bins:twice,active:1200000,economy:"retained")),"economy editions never pool");
        Require(!cohort.Matches(Run(4,bins:bins,start:"opaque start ")),"opaque context retains exact whitespace");
        Require(!cohort.Matches(Run(5,bins:bins,end:"opaque End")),"opaque context retains exact case");
        Require(!cohort.Matches(Run(6,bins:bins,fitting:"launcher")),"different fitting never pools");
        var almost=new long[10];almost[0]=200001;almost[9]=399999;
        Require(!cohort.Matches(Run(7,bins:almost)),"rounded percentages cannot merge distinct speed composition");
        var delimiter=new LastStandHistoryCohort(Run(8,fitting:"a|b",economy:"c"));
        Require(!delimiter.Matches(Run(9,fitting:"a",economy:"b|c")),"field boundaries cannot collide");
        Require(new LastStandHistoryCohort(Run(10,active:0)).Matches(Run(11,active:0)),"zero-time history remains representable");
        Require(!new LastStandHistoryCohort(Run(12,active:0)).Matches(Run(13)),"unmeasured speed cannot match measured speed");
    }
    static void Eligibility()
    {
        var anchor=Run(1,active:300000);var cohort=new LastStandHistoryCohort(anchor);
        var snapshot=Snapshot(anchor,Run(2,active:299999),Run(3,since:true),Run(4,active:0),Run(5),Run(6,reason:""));
        var result=LastStandHistoryComparison.ForTier(snapshot,1,cohort);
        Require(result.Samples==2 && result.MedianPerHour==null && result.State==LastStandHistoryComparisonState.InsufficientSamples,
            "two samples never produce meaningful median");
        Require(result.ShortSamples==1 && result.SinceUpdateSamples==1 && result.ProvisionalSamples==1 &&
            result.UnmeasuredSamples==1 && result.ExcludedSamples==4,"each ineligible record is accounted once");
        Require(result.Description.Contains("2 / 3") && result.Description.Contains("since update") &&
            result.Description.Contains("provisional"),"insufficient and excluded states are visible");
        Require(LastStandHistoryComparison.ForTier(snapshot,9,cohort).State==LastStandHistoryComparisonState.NoSamples,
            "absent tier has no synthetic zero rate");
    }
    static void TierMedians()
    {
        var a=Run(1,salvage:10);var cohort=new LastStandHistoryCohort(a);
        var snapshot=Snapshot(a,Run(2,salvage:30),Run(3,salvage:20),Run(4,tier:2,salvage:100),
            Run(5,tier:2,salvage:200),Run(6,tier:2,salvage:300),Run(7,salvage:999999,active:60000));
        var first=LastStandHistoryComparison.ForTier(snapshot,1,cohort);
        var second=LastStandHistoryComparison.ForTier(snapshot,2,cohort);
        Require(first.State==LastStandHistoryComparisonState.Ready && first.Samples==3 && first.MedianPerHour==120,
            "median excludes short windfall and uses active hours");
        Require(second.MedianPerHour==1200 && second.Samples==3,"tiers retain separate medians");
        Require(first.Description.Contains("do not prove"),"median cannot imply best tier");
        var even=LastStandHistoryComparison.ForTier(Snapshot(a,Run(2,salvage:30),Run(3,salvage:20),Run(4,salvage:40)),1,cohort);
        Require(even.MedianPerHour==150,"even median averages middle rates");
    }
    static void MixedConditions()
    {
        var anchor=Run(1);var snapshot=Snapshot(anchor,Run(2),Run(3),Run(4,economy:"retained"));
        var mixed=LastStandHistoryComparison.ForTier(snapshot,1,null);
        Require(mixed.MixedConditions && mixed.MedianPerHour==null && mixed.State==LastStandHistoryComparisonState.MixedConditions,
            "unfiltered mixed editions withhold pooled median");
        var selected=LastStandHistoryComparison.ForTier(snapshot,1,new LastStandHistoryCohort(anchor));
        Require(selected.Samples==3 && selected.OtherConditionSamples==1 && selected.MedianPerHour==600,
            "exact selected cohort excludes other edition");
        Require(LastStandHistoryComparison.Cohorts(snapshot).Count==2,"cohort list deduplicates exact observed conditions");
        Require(LastStandHistoryComparison.ForTier(Snapshot(anchor,Run(2),Run(3)),1,null).MedianPerHour==600,
            "unfiltered single cohort is honest");
    }
    static void PairDifferences()
    {
        var a=Run(1,salvage:100,bonus:10,milestone:900000,pause:900000,closed:900000);
        var b=Run(2,tier:2,salvage:200,bonus:20,milestone:1,pause:1,closed:1,economy:"retained",fitting:"launcher",start:"new",end:"changed");
        var pair=LastStandHistoryComparison.Between(a,b);
        Require(pair.RateDeltaPerHour==660 && pair.ActiveMillisecondsDelta==0 && pair.RepeatableSalvageDelta==110,
            "pair delta excludes milestone pause and closed time and includes repeatable research increment");
        foreach(string label in new[]{"Tier","Economy","Fitting","Start context","End context"})
            Require(pair.Differences.Contains(label),"pair discloses "+label);
        Require(pair.MixedConditions && pair.Description.Contains("not a causal") && pair.Description.Contains("B minus A"),
            "mixed observation not a causal improvement");
        Require(LastStandHistoryComparison.Between(b,a).RateDeltaPerHour==-660,"signed delta follows selection direction");
        Require(LastStandHistoryComparison.Between(a,a).State==LastStandHistoryPairState.SameRun,"same run selection cannot imply improvement");
    }
    static void PairLimits()
    {
        var a=Run(1);
        foreach(var b in new[]{Run(2,active:299999),Run(3,since:true),Run(4,reason:""),Run(5,active:0)})
        {
            var pair=LastStandHistoryComparison.Between(a,b);
            Require(!pair.RateDeltaPerHour.HasValue && pair.State==LastStandHistoryPairState.IncompleteMeasurements,
                "short since-update provisional and zero-time deltas are withheld");
            Require(pair.Description.Contains("Rate delta unavailable"),"withheld rate is explicit");
        }
        var bins=new long[10];bins[9]=600000;
        Require(LastStandHistoryComparison.Between(a,Run(6,bins:bins)).Differences.Contains("Speed composition"),
            "speed differences are named");
    }
    static void PairWaveDeltas()
    {
        var a=Run(1,wave:10);var b=Run(2,wave:15);
        Require(LastStandHistoryComparison.Between(a,b).Description.Contains("+5 cleared waves"),
            "comparison must display signed cleared-wave improvement");
        Require(LastStandHistoryComparison.Between(b,a).Description.Contains("-5 cleared waves"),
            "wave delta follows B minus A direction");
        Require(LastStandHistoryComparison.Between(a,Run(3,wave:10)).Description.Contains("0 cleared waves"),
            "equal wave values show an explicit zero delta");
        var low=Run(4,wave:0);var high=Run(5,wave:int.MaxValue);
        Require(LastStandHistoryComparison.Between(low,high).Description.Contains("+2147483647 cleared waves")&&
            LastStandHistoryComparison.Between(high,low).Description.Contains("-2147483647 cleared waves"),
            "wave deltas preserve supported counter boundaries");
    }
    static void ProjectionOnly()
    {
        var h=new LastStandRunHistory();h.Begin(1,1,"repair","current","opaque");h.AddActiveTime(600000,1);
        h.BankWave(1,100,20,5,"opaque");h.Finish("defeat","opaque");h.Begin(2,1,"repair","current","opaque");
        var before=h.Snapshot();var cohorts=LastStandHistoryComparison.Cohorts(before);
        LastStandHistoryComparison.ForTier(before,1,cohorts[0]);LastStandHistoryComparison.Between(before.Recent[0],before.Current);
        Require(Object.ReferenceEquals(before,h.Snapshot()) && h.Current!=null && before.Lifetime.Runs==1,
            "analysis never changes checkpoint or finalizes current run");
        Require(((IList<LastStandHistoryCohort>)cohorts).IsReadOnly,"cohort projection is immutable");
    }
    public static int Main(string[] args)
    {
        var cases=new Dictionary<string,Action>{{"cohort_identity",CohortIdentity},{"eligibility",Eligibility},
            {"tier_medians",TierMedians},{"mixed_conditions",MixedConditions},{"pair_differences",PairDifferences},
            {"pair_limits",PairLimits},{"pair_wave_deltas",PairWaveDeltas},{"projection_only",ProjectionOnly}};
        try{cases[args[0]]();Console.WriteLine("PASS "+args[0]);return 0;}
        catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
