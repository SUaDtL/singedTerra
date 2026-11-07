using System;
using System.Collections.Generic;
using System.Linq;
using SingedTerra.LastStand;

static class HistoryChecks
{
    static void Require(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Reject(Action action,string message)
    {try{action();}catch(ArgumentException){return;}catch(InvalidOperationException){return;}throw new Exception(message);}
    static LastStandRunHistory NewRun(int id=1,bool legacy=false)
    {var h=new LastStandRunHistory();h.Begin(id,1,"repair","wave-v2","speed 0; yield 0",legacy);return h;}
    static void TerminalTime()
    {
        var h=NewRun();h.AddActiveTime(60000,1);h.BankWave(1,100,1000,10,"speed 0; yield 0");
        Require(h.Current.FarmingRate==6600,"milestone excluded, repeatable research bonus included");
        h.AddActiveTime(540000,5);h.AddPausedTime(900000);h.AddClosedTime(3600000);
        h.Finish("defeat","speed 8; yield 0");var r=h.Snapshot().Recent[0];
        Require(r.ActiveMilliseconds==600000 && r.HighestClearedWave==1,"failed partial wave time retained with no reward");
        Require(r.FarmingRate==660,"terminal failed time lowers farming rate");
        Require(r.SpeedMilliseconds[1]==60000 && r.SpeedMilliseconds[9]==540000,"actual elapsed speed bins preserved");
    }
    static void CheckpointCopy()
    {
        var h=NewRun();h.AddActiveTime(50000,.5);h.BankWave(1,10,0,0,"a");var checkpoint=h.Copy();
        h.AddActiveTime(30000,5);h.BankWave(2,20,0,0,"b");
        Require(checkpoint.Current.HighestClearedWave==1 && checkpoint.Current.ActiveMilliseconds==50000,"live work cannot mutate saved snapshot");
        Require(!checkpoint.BankWave(1,10,0,0,"a"),"retry of accepted wave is idempotent");
        Require(checkpoint.Current.RepeatableSalvage==10,"retry did not duplicate income");
        var restored=new LastStandRunHistory(checkpoint.Snapshot());restored.AddActiveTime(25000,1);restored.Finish("abandon","a");
        Require(restored.Snapshot().Recent[0].ActiveMilliseconds==75000,"resumed run retains identity and adds measurable terminal time");
        Require(checkpoint.Current!=null,"copy finalization leaves checkpoint untouched");
    }
    static void BoundedExactlyOnce()
    {
        var h=new LastStandRunHistory();
        for(int n=1;n<=25;n++){h.Begin(n,n%2+1,"repair","v2","a");h.AddActiveTime(3600000,1);h.BankWave(1,n,0,0,"a");Require(h.Finish("defeat","a"),"finalized");}
        Require(h.Snapshot().Recent.Count==20 && h.Snapshot().Recent[0].RunId==6,"latest twenty bounded in order");
        Require(h.Snapshot().Lifetime.Runs==25 && h.Snapshot().Lifetime.RepeatableSalvage==325,"lifetime survives eviction");
        Require(!h.Finish("defeat","a"),"repeated finalization has no effect");
        Reject(()=>h.Begin(1,1,"repair","v2","a"),"evicted old run cannot finalize twice");
        Require(h.Snapshot().Tiers.Count==2,"aggregate bounded per tier");
    }
    static void Comparison()
    {
        var h=new LastStandRunHistory();
        for(int n=1;n<=4;n++)
        {h.Begin(n,1,n==2?"launcher":"repair","v2","a",n==4);h.AddActiveTime(n==3?60000:3600000,n==2?5:1);
         h.BankWave(1,n*10,9999,0,"a");h.Finish("defeat","a");}
        var c=h.Compare(1);
        Require(c.Samples==3 && c.ExcludedSamples==1 && c.ShortSamples==1,"legacy and short samples disclosed");
        Require(c.MedianPerHour==20 && c.MixedContexts,"median uses real time and reports changing context");
        Require(c.Description.Contains("under 5 minutes") && c.Description.Contains("do not prove"),"comparison cautions remain visible");
        Require(h.Compare(2).MedianPerHour==null,"no samples never becomes zero-rate recommendation");
    }
    static void Validation()
    {
        var h=NewRun();Reject(()=>h.AddActiveTime(1,0),"pause excluded from active clock");
        Reject(()=>h.AddActiveTime(1,Double.NaN),"nonfinite speed refused");Reject(()=>h.AddActiveTime(-1,1),"negative time refused");
        Reject(()=>h.BankWave(2,1,0,0,"a"),"skipped wave refused");Reject(()=>h.Finish("close","a"),"close does not finalize");
        Reject(()=>h.Begin(2,1,"repair","v2","a"),"overlapping run refused");
        Reject(()=>new LastStandRunSummary(1,1,"repair","v2","a","a",0,"",false,10,0,0,0,0,0,new long[10]),"speed total mismatch refused");
        Reject(()=>new LastStandHistorySnapshot(1,null,new LastStandRunSummary[0],new[]{new LastStandHistoryAggregate(1,1,0,0,0,0,0)},new LastStandHistoryAggregate(0,0,0,0,0,0,0)),"inconsistent aggregate refused");
        Reject(()=>new LastStandRunHistory(-1),"negative highwater refused");
        h.AddActiveTime(LastStandRunHistory.MaximumCounter,1);
        Reject(()=>h.AddActiveTime(1,1),"counter overflow bounded");
        Require(h.Current.ActiveMilliseconds==LastStandRunHistory.MaximumCounter,"failed update is atomic");
    }
    static void Immutable()
    {
        var speeds=new long[10];speeds[1]=1;
        var r=new LastStandRunSummary(1,1,"repair","v2","a","a",1,"defeat",false,1,0,0,1,0,0,speeds);
        speeds[1]=999;Require(r.SpeedMilliseconds[1]==1,"array captured by value");
        var list=r.SpeedMilliseconds as IList<long>;Require(list.IsReadOnly,"speed snapshot read only");
        var h=NewRun();var s=h.Snapshot();h.AddActiveTime(1,1);Require(s.Current.ActiveMilliseconds==0,"snapshot remains immutable");
    }
    public static int Main(string[] args)
    {
        var cases=new Dictionary<string,Action>{{"terminal_time",TerminalTime},{"checkpoint_copy",CheckpointCopy},
            {"bounded_once",BoundedExactlyOnce},{"comparison",Comparison},{"validation",Validation},{"immutable",Immutable}};
        try{cases[args[0]]();Console.WriteLine("PASS "+args[0]);return 0;}
        catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
