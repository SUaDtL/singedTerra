using System;
using System.IO;
using System.Collections.Generic;
using SingedTerra.LastStand;
using B=CombatBalanceMeasurements;

public static class BuildcraftFarmingMeasurements
{
    static Dictionary<string,object> Run(B.Seed seed,int tier,int wave)
    {
        var c=seed.Fork();B.Require(c.Profile.TryApplyLoadout(new LastStandLoadout("launcher","repair")),"Earned farming build");
        var allocation=B.BuySplit(c);
        var row=B.Run(c,tier,"launcher+repair","max900",10,6000000,wave);
        row["allocation"]=allocation;row["parentProfileSha256"]=B.Hash(seed.Raw);
        row["repeatableSalvagePerActiveHour"]=((long)row["repeatableSalvage"]+(long)row["researchBonusSalvage"])*3600000d/Math.Max(1,(long)row["activeMilliseconds"]);
        return row;
    }
    public static int Main(string[] args)
    {
        try {
            var input=LastStandSaveJson.Read(File.ReadAllText(args[0]));string raw=File.ReadAllText(args[1]);
            var context=new B.Context(raw,LastStandSaveJson.LongInteger(input["calendarMilliseconds"]),
                LastStandSaveJson.LongInteger(input["permanentSpent"]),LastStandSaveJson.LongInteger(input["researchSpent"]));
            B.Require(context.Profile.MaximumGameSpeed==5,"Paid 5x farming comparison required");var seed=new B.Seed(context,0);var rows=new List<object>();
            for(int tier=1;tier<6;tier++)rows.Add(B.D("lowerTier",tier,"deepLower",Run(seed,tier,2000),
                "shallowHigher30",Run(seed,tier+1,30),"shallowHigher100",Run(seed,tier+1,100)));
            B.WriteReport(Console.Out,B.D("farming",rows,"lowTouchDeepRun",Run(seed,1,5000),"parentProfileSha256",B.Hash(raw),
                "qualification","Production-model projection from unchanged earned bytes, with at most one bulk purchase per 15 active minutes. Defeat before requested waves remains a failure to reach them; this is not elapsed endurance or owner play-feel evidence."));
            return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
