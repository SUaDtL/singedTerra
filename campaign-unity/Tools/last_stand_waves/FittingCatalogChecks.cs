using System;
using System.Linq;
using SingedTerra.LastStand;

public static class FittingCatalogChecks
{
    static void Need(bool value,string message) { if(!value)throw new Exception(message); }
    public static void Main(string[] args)
    {
        var options=LastStandFittingCatalog.Options;
        Need(options.Count==5,"five explicitly named fitting choices exist");
        Need(options.Select(x=>x.Id).SequenceEqual(new[]{"repair","launcher","scattergun","mortar","railgun"}),"stable fitting order and appended armament IDs");
        Need(options[0].Unlocked && options[1].Unlocked && options.Skip(2).All(x=>!x.Unlocked),"existing fittings stay unlocked; milestone fittings start locked");
        var type=typeof(LastStandFittingCatalog);
        var id=type.GetMethod("Id"); var parse=type.GetMethod("Parse"); var available=type.GetMethod("OptionsFor");
        Need(id!=null && parse!=null && available!=null,"explicit enum identity and per-save availability API");
        foreach(var option in options)
            Need((string)id.Invoke(null,new[]{parse.Invoke(null,new object[]{option.Id})})==option.Id,"fitting identity round trip");
        bool rejected=false;
        try { parse.Invoke(null,new object[]{"unrecognized"}); }
        catch(System.Reflection.TargetInvocationException e) { rejected=e.InnerException is ArgumentException; }
        Need(rejected,"unknown identity cannot silently become Repair");
        var unlocked=(System.Collections.Generic.IReadOnlyList<LastStandSelectionOption>)available.Invoke(null,new object[]{new Func<string,bool>(value=>value=="scattergun")});
        Need(unlocked.Take(3).All(x=>x.Unlocked) && unlocked.Skip(3).All(x=>!x.Unlocked),"earned Scattergun unlocks exactly its own choice without unlocking later armaments");
        Need(options.Skip(2).All(x=>!x.Unlocked),"per-save availability cannot mutate default catalog");
        Console.WriteLine("ST_LS_ARMAMENT_PASS fitting_catalog");
    }
}
