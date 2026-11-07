using System;
using System.Collections.Generic;
using SingedTerra.LastStand;

static class SaveCodecChecks
{
    static void Assert(bool value,string message) { if(!value)throw new Exception(message); }
    static void Rejected(string source)
    {
        try { LastStandSaveJson.Read(source); }
        catch(FormatException) { return; }
        throw new Exception("Accepted unsafe numeric save: "+source);
    }
    static void Main(string[] args)
    {
        if(args[0]=="elapsed")
        {
            long timestamp=1792800000000L;
            var input=new Dictionary<string,object> { {"utcMs",timestamp},{"activeMs",5000000000L},{"wallet",25} };
            var saved=LastStandSaveJson.Write(input);
            var parsed=LastStandSaveJson.Read(saved);
            Assert(Convert.ToInt64(parsed["utcMs"])==timestamp,"UTC lost precision");
            Assert(Convert.ToInt64(parsed["activeMs"])==5000000000L,"Lifetime duration overflow");
            Assert(LastStandSaveJson.Integer(parsed["wallet"])==25,"Existing int fields changed");
            bool narrowRejected=false;
            try { LastStandSaveJson.Integer(parsed["utcMs"]); } catch(FormatException) { narrowRejected=true; }
            Assert(narrowRejected,"Wide value silently coerced into wallet-sized field");
        }
        else if(args[0]=="bounds")
        {
            Assert(Convert.ToInt64(LastStandSaveJson.Read("{\"value\":9007199254740991}")["value"])==9007199254740991L,"Safe integer boundary rejected");
            foreach(string n in new[]{"9007199254740992","9223372036854775808","-1","1.5","1e3","01"})
                Rejected("{\"value\":"+n+"}");
            foreach(long value in new[]{-1L,9007199254740992L})
            {
                bool rejected=false;
                try { LastStandSaveJson.Write(new Dictionary<string,object>{{"value",value}}); }
                catch(FormatException) { rejected=true; }
                Assert(rejected,"Unsafe long write accepted");
            }
        }
        else throw new Exception("Unknown case");
        Console.WriteLine("PASS "+args[0]);
    }
}
