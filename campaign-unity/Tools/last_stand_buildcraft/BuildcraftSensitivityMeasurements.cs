using System;
using System.IO;
using System.Collections.Generic;
using SingedTerra.LastStand;
using B=CombatBalanceMeasurements;

// Counterfactual parameters are compiled into a temporary catalog copy. The
// earned seed is never altered, re-funded or represented as a perturbed history.
public static class BuildcraftSensitivityMeasurements
{
    public static int Main(string[] args)
    {
        try {
            var input=LastStandSaveJson.Read(File.ReadAllText(args[0]));
            string raw=File.ReadAllText(args[1]);
            var original=new B.Context(raw,LastStandSaveJson.LongInteger(input["calendarMilliseconds"]),
                LastStandSaveJson.LongInteger(input["permanentSpent"]),LastStandSaveJson.LongInteger(input["researchSpent"]));
            var seed=new B.Seed(original,0);var rows=new List<object>();
            foreach(string name in new[]{"repair+launcher","launcher+mortar","mortar+railgun","scattergun+arc","repair+shield","arc+shield"})
            foreach(int tier in new[]{3,5,6}){
                var c=seed.Fork();var parts=name.Split('+');var loadout=new LastStandLoadout(parts[0],parts[1]);
                if(!c.Profile.IsTierUnlocked(tier)||!loadout.IsAvailable(c.Profile.EquipmentBayCount,c.Profile.IsFittingUnlocked)){
                    rows.Add(B.D("tier",tier,"fitting",name,"outcome","unavailable"));continue;
                }
                B.Require(c.Profile.TryApplyLoadout(loadout),"Earned sensitivity loadout");
                var allocation=B.BuySplit(c);
                var row=B.Run(c,tier,name,"max900",(int)(c.Profile.MaximumGameSpeed*2),1000000,500);
                row["allocation"]=allocation;row["parentProfileSha256"]=B.Hash(raw);rows.Add(row);
            }
            B.WriteReport(Console.Out,B.D("rows",rows,"parentProfileSha256",B.Hash(raw),
                "qualification","Parameter counterfactual from one unchanged earned seed; prior acquisition is not re-simulated under perturbed prices or damage. Damage retains original level-zero floors; integer prices round to the nearest unit."));
            return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
