using System;
using System.Collections.Generic;
using System.IO;
using SingedTerra.LastStand;
using SingedTerra.Encounter;
using B=CombatBalanceMeasurements;

public static class BuildcraftBalanceMeasurements
{
    public const int FundingTickLimit=24000000,FundingRunLimit=96,ComparisonTicks=1000000,ComparisonWave=500;
    public static readonly int[] RequiredWaves={100,300,750,2000,5000};
    static List<string> Loadouts()
    {
        var result=new List<string>();var fittings=LastStandFittingCatalog.Definitions;
        for(int i=0;i<fittings.Count;i++){result.Add(fittings[i].Id);for(int j=0;j<i;j++)result.Add(fittings[j].Id+"+"+fittings[i].Id);}
        return result;
    }
    static LastStandLoadout Parse(string name){var parts=name.Split('+');return new LastStandLoadout(parts[0],parts.Length==1?null:parts[1]);}
    static bool Owned(B.Context c,string name)=>Parse(name).IsAvailable(c.Profile.EquipmentBayCount,c.Profile.IsFittingUnlocked);
    static Dictionary<string,object> Seed(B.Context c)=>B.D("profileJson",c.Store.Raw,"profileSha256",B.Hash(c.Store.Raw),"grossSalvage",c.Gross,
        "wallet",c.Profile.Wallet,"permanentSpent",c.PermanentSpent,"researchSpent",c.ResearchSpent,"calendarMilliseconds",(long)c.Clock.Elapsed,
        "maximumSpeed",c.Profile.MaximumGameSpeed,"equipmentBays",c.Profile.EquipmentBayCount,"bestWaves",Best(c),"researchRanks",c.Profile.ResearchSnapshot.completedRanks);
    static int[] Best(B.Context c){var best=new int[6];for(int i=0;i<6;i++)best[i]=c.Profile.GetBestWave(i+1);return best;}
    static bool AllOwned(B.Context c){foreach(string loadout in Loadouts())if(!Owned(c,loadout))return false;return c.Profile.IsTierUnlocked(6);}
    static Dictionary<string,object> Compare(B.Seed seed,int tier,string name,string policy,int maximumTicks=ComparisonTicks,int endWave=ComparisonWave)
    {
        var c=seed.Fork();string reason=!c.Profile.IsTierUnlocked(tier)?"tier-not-earned":!Owned(c,name)?"fitting-or-bay-not-earned":null;
        if(reason!=null)return B.D("tier",tier,"fitting",name,"policy",policy,"outcome","unavailable","reason",reason,"parentProfileSha256",B.Hash(seed.Raw));
        B.Require(c.Profile.TryApplyLoadout(Parse(name)),"Comparison preparation");var allocation=B.BuySplit(c);
        var row=B.Run(c,tier,name,policy,(int)(c.Profile.MaximumGameSpeed*2),maximumTicks,endWave);
        row["parentProfileSha256"]=B.Hash(seed.Raw);row["grossAtFork"]=seed.Gross;row["allocation"]=allocation;
        row["damage"]=Damage(row);row["salvagePerActiveHour"]=Rate((long)row["repeatableSalvage"]+(long)row["researchBonusSalvage"],(long)row["activeMilliseconds"]);
        return row;
    }
    static long Damage(Dictionary<string,object> row)
    {
        long damage=0;foreach(var item in (List<object>)((Dictionary<string,object>)row["roleEffects"])["damageByWeaponAndEnemy"])
            damage+=(long)((Dictionary<string,object>)item)["effectiveDamage"];return damage;
    }
    static double Rate(long income,long milliseconds)=>milliseconds==0?0:income*3600000d/milliseconds;
    static double[] Scores(Dictionary<string,object> row)=>new[]{(double)(int)row["highestClearedWave"],(double)(int)row["finalHull"],
        (long)row["damage"]*20d/Math.Max(1,(int)row["ticks"]),(double)row["salvagePerActiveHour"]};
    static bool Dominates(Dictionary<string,object> a,Dictionary<string,object> b)
    {
        var x=Scores(a);var y=Scores(b);bool better=false;for(int i=0;i<x.Length;i++){if(x[i]+1e-9<y[i])return false;better|=x[i]>y[i]+1e-9;}return better;
    }
    static Dictionary<string,object> Frontier(List<object> matrix)
    {
        var rows=new List<object>();var choices=new HashSet<string>();var universals=new HashSet<string>();bool measured=true;
        foreach(string name in Loadouts())if(name.Contains("+"))universals.Add(name);
        for(int tier=1;tier<=6;tier++){
            var pairs=new List<Dictionary<string,object>>();foreach(var item in matrix){var row=(Dictionary<string,object>)item;if((int)row["tier"]==tier&&((string)row["fitting"]).Contains("+")&&(string)row["outcome"]!="unavailable")pairs.Add(row);}
            if(pairs.Count!=21)measured=false;
            var frontier=new List<string>();foreach(var row in pairs){bool dominated=false;foreach(var other in pairs)if(Dominates(other,row)){dominated=true;break;}if(!dominated){frontier.Add((string)row["fitting"]);choices.Add((string)row["fitting"]);}}
            foreach(string name in new List<string>(universals)){
                var candidate=pairs.Find(row=>(string)row["fitting"]==name);if(candidate==null){universals.Remove(name);continue;}
                foreach(var other in pairs)if(other!=candidate&&!Dominates(candidate,other)){universals.Remove(name);break;}
            }
            rows.Add(B.D("tier",tier,"measuredPairs",pairs.Count,"pairs",frontier));
        }
        return B.D("allPairsEarned",measured,"frontiers",rows,"distinctFrontierPairs",new List<string>(choices),"universalDominators",new List<string>(universals),
            "passes",measured&&choices.Count>=3&&universals.Count==0,"metrics",new[]{"highestClearedWave","finalHull","effectiveDamagePerSimulationSecond","repeatableSalvagePerActiveHour"});
    }
    static List<object> Pacing()
    {
        var rows=new List<object>();foreach(int wave in RequiredWaves){long minimum=0;for(int n=1;n<=wave;n++){
            var group=LastStandWaveCatalog.ForWave(LastStandTierCatalog.Get(1),n);
            minimum+=(n==1?1:LastStandWaveCatalog.Intermission(LastStandRunEdition.Current))+(long)(group.EnemyCount-1)*group.SpawnIntervalTicks;
        }
        rows.Add(B.D("wave",wave,"minimumSpawnTicks",minimum,"minimumHoursAt5x",minimum*.05/5/3600,"kind","theoretical-spawn-floor-not-earned-run"));}
        return rows;
    }
    public static Dictionary<string,object> Measure(bool quick=false,string fundingOutput=null)
    {
        B.Require(LastStandRunEdition.Current.IsBuildcraft,"Buildcraft edition required");var c=new B.Context();B.Require(c.Gross==0&&c.Profile.Wallet==0,"Fresh empty origin");
        var funding=new List<object>();var unlocks=new List<object>();var seen=new HashSet<string>();int ticks=0;
        Action<B.Context,EncounterModel> capture=(context,model)=>{
            foreach(int wave in RequiredWaves)if(context.Profile.GetBestWave(1)>=wave&&seen.Add("tier-1-wave-"+wave))unlocks.Add(B.D("event","tier-1-wave-"+wave,"calendarMilliseconds",(long)context.Clock.Elapsed,"grossSalvage",context.Gross));
            foreach(var fitting in LastStandFittingCatalog.Definitions)if(context.Profile.IsFittingUnlocked(fitting.Id)&&seen.Add("fitting-"+fitting.Id))unlocks.Add(B.D("event","fitting-"+fitting.Id,"calendarMilliseconds",(long)context.Clock.Elapsed,"grossSalvage",context.Gross));
            if(context.Profile.EquipmentBayCount==2&&seen.Add("second-bay"))unlocks.Add(B.D("event","second-bay","calendarMilliseconds",(long)context.Clock.Elapsed,"grossSalvage",context.Gross));
        };
        for(int run=0;run<(quick?2:FundingRunLimit)&&ticks<(quick?100000:FundingTickLimit);run++){
            string fit=c.Profile.EquipmentBayCount==2?"launcher+repair":"launcher";B.Require(c.Profile.TryApplyLoadout(Parse(fit)),"funding fitting");
            B.BuyPermanent(c,c.Gross/2,false);B.FundResearch(c,true);int tier=1;
            if(run%2==1)for(int candidate=2;candidate<=6;candidate++)if(c.Profile.IsTierUnlocked(candidate))tier=candidate;
            var row=B.Run(c,tier,fit,"afterKill",0,Math.Min(quick?50000:5000000,(quick?100000:FundingTickLimit)-ticks),5000,capture);
            ticks+=(int)row["ticks"];row["run"]=run+1;funding.Add(row);B.FundResearch(c,true);
            c.Clock.Elapsed+=20L*3600000;c.ClosedMilliseconds+=20L*3600000;B.Require(c.Research.Reconcile(),"paid closed research");c.Audit();
            Console.Error.WriteLine("funding run="+(run+1)+" ticks="+ticks+" best="+String.Join(",",Best(c))+" gross="+c.Gross+" wallet="+c.Profile.Wallet);
            if(AllOwned(c)&&c.Profile.Wallet>=10000&&c.Profile.MaximumGameSpeed==5)break;
        }
        long waitStarted=(long)c.Clock.Elapsed;
        if(!quick)for(int hours=0;hours<60*24&&c.Profile.MaximumGameSpeed<5;hours+=20){
            B.FundResearch(c,true,true);c.Clock.Elapsed+=20L*3600000;c.ClosedMilliseconds+=20L*3600000;
            B.Require(c.Research.Reconcile(),"paid speed research while closed");c.Audit();
        }
        long researchWait=(long)c.Clock.Elapsed-waitStarted;
        if(fundingOutput!=null)using(var writer=new StreamWriter(fundingOutput))B.WriteReport(writer,
            B.D("phase","funding-complete","funding",funding,"acquisition",unlocks,"seed",Seed(c),"researchPurchases",c.ResearchJournal,"researchCompletions",c.Completions,"postFundingWaitMilliseconds",researchWait));
        Console.Error.WriteLine("funding complete maxSpeed="+c.Profile.MaximumGameSpeed+" closedWaitHours="+researchWait/3600000);
        var seed=new B.Seed(c,0);var matrix=new List<object>();int cells=0;
        foreach(string fitting in Loadouts())for(int tier=1;tier<=6;tier++){
            matrix.Add(Compare(seed,tier,fitting,"max900",quick?2000:ComparisonTicks));
            if(++cells%28==0)Console.Error.WriteLine("matrix "+cells+"/168");
        }
        var alternatives=new List<object>();foreach(string pair in new[]{"launcher+repair","arc+shield","repair+shield"})foreach(int tier in new[]{1,3,5,6})alternatives.Add(Compare(seed,tier,pair,"none",quick?2000:ComparisonTicks));
        var farms=new List<object>();for(int tier=1;tier<6;tier++){
            var low=Compare(seed,tier,"launcher+repair","max900",quick?2000:1000000,300);
            var high=Compare(seed,tier+1,"launcher+repair","max900",quick?2000:1000000,30);
            farms.Add(B.D("lowerTier",tier,"deeper",low,"shallowHigher",high));
        }
        var earnedDeep=Compare(seed,1,"launcher+repair","afterKill",quick?2000:25000000,5000);
        return B.D("schema",1,"policy","buildcraft-earned-pairs-v1","rulesVersion",LastStandRunEdition.Current.RulesVersion,"economyVersion",LastStandUpgradeCatalog.EconomyVersion,
            "quick",quick,"limits",B.D("fundingTicks",quick?100000:FundingTickLimit,"fundingRuns",quick?2:FundingRunLimit,"comparisonTicks",quick?2000:ComparisonTicks,"comparisonWave",ComparisonWave),
            "funding",funding,"acquisition",unlocks,"seed",Seed(c),"researchPurchases",c.ResearchJournal,"researchCompletions",c.Completions,"postFundingWaitMilliseconds",researchWait,
            "matrix",matrix,"frontier",Frontier(matrix),"alternateSpending",alternatives,"farming",farms,"earnedDeepRun",earnedDeep,"pacing",Pacing(),
            "qualification","Source-bound production simulation only. Unavailable unlocks remain unavailable. No rendered play-feel, native/device or real-duration soak claim.");
    }
    public static int Main(string[] args)
    {try{B.WriteReport(Console.Out,Measure(args.Length>0&&args[0]=="quick",args.Length>1?args[1]:null));Console.WriteLine();return 0;}catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
