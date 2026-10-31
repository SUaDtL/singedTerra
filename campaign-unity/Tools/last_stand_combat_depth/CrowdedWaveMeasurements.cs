using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using SingedTerra.Encounter;
using SingedTerra.LastStand;
using B=CombatBalanceMeasurements;

// Read-only observer attached to the retained measurement loop, never the model.
public static class CrowdedWaveMeasurements
{
    public sealed class Observer
    {
        readonly int first,last;
        int currentWave,lastTick,beforeTick,beforeHull,beforeSpawned,beforeLiving;
        int startTick,startHull,startKills,minimumHull,peakLiving;
        long startScrap,livingSum,previousGross;
        bool pending,observing;
        B.RoleEffects effects;
        Dictionary<string,object> previousBoundary;
        readonly long initialGross;
        public Dictionary<string,object> WindowStart;
        public readonly List<object> Rows=new List<object>();
        public Observer(int firstWave,int lastWave,long grossAtDeployment=0){first=firstWave;last=lastWave;initialGross=previousGross=grossAtDeployment;}
        static int Living(EncounterModel model){int count=0;foreach(var foe in model.Foes)if(foe.Alive)count++;return count;}
        public void Before(EncounterModel model,LastStandShopState shop)
        {
            B.Require(!pending&&model.Tick==lastTick,"Missing/reordered observer tick");pending=true;
            if(previousBoundary==null)previousBoundary=B.D("wave",0,"tick",model.Tick,"hull",model.Hull,"maximumHull",model.CurrentMaximumHull,"kills",model.Kills,"earnedScrap",shop.EarnedScrap,"cumulativeGrossSalvage",initialGross);
            beforeTick=model.Tick;beforeHull=model.Hull;beforeSpawned=model.Spawned;beforeLiving=Living(model);
            if(currentWave!=model.Wave){currentWave=model.Wave;observing=currentWave>=first&&currentWave<=last;
                startTick=model.Tick;startHull=minimumHull=model.Hull;startKills=model.Kills;startScrap=shop.EarnedScrap;
                if(currentWave==first)WindowStart=previousBoundary;
                peakLiving=beforeLiving;livingSum=0;effects=observing?new B.RoleEffects():null;}
        }
        public void After(EncounterModel model,LastStandShopState shop)
        {
            B.Require(pending&&model.Tick==beforeTick+1&&model.Wave==currentWave,"Missing/reordered observer step");pending=false;lastTick=model.Tick;
            if(!observing)return;
            effects.Observe(model);peakLiving=Math.Max(peakLiving,beforeLiving+model.Spawned-beforeSpawned);livingSum+=Living(model);
            int hull=beforeHull;
            foreach(var item in model.Events){if(item.Kind==EncounterEventKind.Repair)hull+=item.Amount;
                else if(item.Kind==EncounterEventKind.CloseHit||item.Kind==EncounterEventKind.RangedHit)hull-=item.Amount;
                minimumHull=Math.Min(minimumHull,hull);}
            B.Require(hull==model.Hull,"Event pressure/healing differs from actual hull");
        }
        public void Commit(B.Context context,EncounterModel model)
        {
            B.Require(!pending&&model.Tick==lastTick&&model.CompletedWave==currentWave,"Unobserved wave commit");
            var boundary=B.D("wave",model.CompletedWave,"tick",model.Tick,"hull",model.Hull,"maximumHull",model.CurrentMaximumHull,"kills",model.Kills,
                "earnedScrap",context.Profile.Checkpoint.RestoreShop().EarnedScrap,"cumulativeGrossSalvage",context.Gross);
            if(observing)Rows.Add(B.D("wave",currentWave,"startTick",startTick,"endTick",model.Tick,"ticks",model.Tick-startTick,
                "startingHull",startHull,"endingHull",model.Hull,"minimumHull",minimumHull,"kills",model.Kills-startKills,
                "earnedScrap",context.Profile.Checkpoint.RestoreShop().EarnedScrap-startScrap,"salvageGross",context.Gross-previousGross,
                "peakLivingBeforeAttacks",peakLiving,"livingEnemyTickSum",livingSum,"roleEffects",effects.Snapshot(),"beforeBoundary",previousBoundary,"afterBoundary",boundary));
            previousGross=context.Gross;previousBoundary=boundary;
        }
    }
    public static Observer Current;
    public static void Before(EncounterModel model,LastStandShopState shop){Current?.Before(model,shop);}
    public static void After(EncounterModel model,LastStandShopState shop){Current?.After(model,shop);}
    static void Commit(B.Context context,EncounterModel model){Current?.Commit(context,model);}
    static void Checks()
    {
        var a=new B.Context();Current=new Observer(1,1);
        var observed=B.Run(a,1,"launcher","none",2,10000,1,Commit);
        B.Require(Current.Rows.Count==1,"One actual wave record");
        var row=(Dictionary<string,object>)Current.Rows[0];
        B.Require(Convert.ToInt64(row["kills"])==6,"Observer records all six actual wave1 kills");
        B.Require((int)row["startTick"]==0&&(int)row["endTick"]==(int)observed["ticks"]&&(int)row["ticks"]==(int)observed["ticks"],"Actual wave duration, not last-event span");
        B.Require((long)row["earnedScrap"]==18&&(int)row["startingHull"]==(int)row["endingHull"],"Independent actual wave1 currency/hull oracle");
        Current=null;var b=new B.Context();var plain=B.Run(b,1,"launcher","none",2,10000,1);
        using(var x=new StringWriter())using(var y=new StringWriter()){
            B.WriteReport(x,observed);B.WriteReport(y,plain);B.Require(x.ToString()==y.ToString()&&a.Store.Raw==b.Store.Raw,"Observer leaves all model, accounting and saved bytes unchanged");}
        var shop=new LastStandShopState(1,LastStandFitting.Launcher,new int[LastStandUpgradeCatalog.Tracks.Count]);
        var model=EncounterModel.CreatePlayable(LastStandFitting.Launcher,1,shop);var gap=new Observer(1,1);
        gap.Before(model,shop);model.Step();model.Step();bool refused=false;try{gap.After(model,shop);}catch(InvalidOperationException){refused=true;}
        B.Require(refused,"Missing actual observer step must be rejected");
        Console.WriteLine("PASS actual-wave-observer-and-parity");
    }
    public static int Main(string[] args)
    {
        try {
            if(args.Length==1&&args[0]=="check"){Checks();return 0;}
            B.Require(args.Length==5,"Exact earned profile plus four funding fields required");
            string raw=File.ReadAllText(args[0]);decimal elapsed=decimal.Parse(args[1],CultureInfo.InvariantCulture);
            long permanent=long.Parse(args[2],CultureInfo.InvariantCulture),research=long.Parse(args[3],CultureInfo.InvariantCulture),gross=long.Parse(args[4],CultureInfo.InvariantCulture);
            var loaded=new B.Context(raw,elapsed,permanent,research);loaded.Audit();B.Require(loaded.Gross==gross,"Earned seed gross mismatch");
            var seed=new B.Seed(loaded,0){Raw=raw,Elapsed=elapsed,Permanent=permanent,Research=research,Gross=gross};
            var runs=new List<object>();
            foreach(string fit in new[]{"repair","launcher","scattergun","mortar","railgun"}){
                var c=seed.Fork();B.Require(c.Profile.TrySelectFitting(fit),"Earned fitting unavailable");var allocation=B.BuySplit(c);
                Current=new Observer(281,300,c.Gross);var result=B.Run(c,3,fit,"none",2,500000,300,Commit);
                runs.Add(B.D("fitting",fit,"parentProfileSha256",B.Hash(raw),"oneTimeAllocation",allocation,"run",result,"windowStart",Current.WindowStart,"waves",Current.Rows));
            }
            B.WriteReport(Console.Out,B.D("policyId","crowded-tier3-281-300-v1","parentProfileSha256",B.Hash(raw),"cumulativeEarnedSalvage",gross,"runs",runs));Console.WriteLine();return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
