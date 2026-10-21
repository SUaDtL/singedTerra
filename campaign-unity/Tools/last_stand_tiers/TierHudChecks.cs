using System;
using System.Linq;
using SingedTerra.LastStand;

static class TierHudChecks
{
    static void Check(bool value, string reason) { if (!value) throw new Exception(reason); }
    static readonly int[,] Profiles = {{1920,976},{1366,664},{720,516},{390,688},{844,266},{844,220}};
    static readonly string[] Garage = {"ToggleFitting","Deploy","ToggleMute","ToggleTier","ShopEntry"};
    static readonly string[] Workshop = {"ToggleFitting","Purchase","Redeploy","RetrySave","ToggleMute","ToggleTier","ShopEntry"};
    static void Geometry()
    {
        for (int i=0;i<Profiles.GetLength(0);i++) foreach (bool workshop in new[] {false,true})
        {
            int width=Profiles[i,0],height=Profiles[i,1];
            var controls=workshop ? Workshop : Garage;
            var p=LastStandHudLayout.Project(width,height,workshop ? "workshop" : "garage",controls);
            var card=p.Slots.Single(s=>s.Id=="LastStandCard").Bounds;
            var dock=p.Slots.Single(s=>s.Id=="LastStandDock").Bounds;
            Check(card.Y+card.Height<=dock.Y+.01f,"tier card crosses dock at "+width+"x"+height);
            foreach(var id in controls)
            {
                var b=p.Slots.Single(s=>s.Id==id).Bounds;
                Check(b.Width>=44 && b.Height>=44,"tier action target below 44px: "+id);
                Check(b.X>=0 && b.Y>=0 && b.X+b.Width<=width+.01f && b.Y+b.Height<=height+.01f,"tier control offscreen");
            }
            Check(p.Slots.Single(s=>s.Id=="PhaseDetail").Bounds.Height>=100,"lost five detail lines");
            Check(p.Slots.Single(s=>s.Id=="SaveStatus").Bounds.Height>=100,"lost five save lines");
        }
        // Real shop controls hide the quick-purchase action, leaving six targets.
        for(int i=0;i<5;i++)
        {
            var p=LastStandHudLayout.Project(Profiles[i,0],Profiles[i,1],"workshop",Workshop.Where(s=>s!="Purchase").ToArray(),
                new LastStandHudLayout.ShopPanelInput(true,new[]{"cannonAttack","launcherAttack"},0,null,null,null,60));
            var card=p.Slots.Single(s=>s.Id=="LastStandCard").Bounds;
            var dock=p.Slots.Single(s=>s.Id=="LastStandDock").Bounds;
            Check(card.Y+card.Height<=dock.Y+.01f,"tier open-shop summary crosses dock");
            Check(p.Slots.Single(s=>s.Id=="ToggleTier").Bounds.Height>=44,"tier selection disappears in shop");
        }
    }
    static void Text()
    {
        Check(LastStandTierHudText.Goal(1)=="Tier 1 / Goal 60s" && LastStandTierHudText.Goal(2)=="Tier 2 / Goal 90s","catalog goals");
        Check(!LastStandTierHudText.GoalMet(1,1199) && LastStandTierHudText.GoalMet(1,1200),"exact goal threshold");
        Check(!LastStandTierHudText.GoalMet(2,1799) && LastStandTierHudText.GoalMet(2,1800),"second tier threshold");
        Check(LastStandTierHudText.Progress(2,1799)=="T2 89/90s","honest completed simulated seconds");
        Check(LastStandTierHudText.Best(0,0)=="Best: no saved run","do not invent history");
        Check(LastStandTierHudText.Best(3600,int.MaxValue).Contains("180.0s / 2147483647 disabled"),"independent saved records");
        Check(LastStandTierHudText.Improvements(false,false)=="No new personal best","ties do not announce a new best");
        var saved=LastStandTierHudText.Result(1,false,1200,10,1,23,true,true,false,true);
        Check(saved.Contains("New best: time; T2 unlocked") && saved.Contains("Wallet  23 salvage") && saved.Contains("Earned salvage  1"),"saved result flags and wallet");
        var limit=LastStandTierHudText.Result(2,true,3600,30,0,int.MaxValue,true,false,true,false);
        Check(limit.Contains("Earned salvage  0 / No victory") && limit.Contains("Continue to the workshop."),"limit is not victory/reward");
        var uncertain=LastStandTierHudText.Result(1,false,1200,10,1,0,false,true,true,true);
        Check(!uncertain.Contains("New best") && !uncertain.Contains("unlocked") && !uncertain.Contains("Earned") && uncertain.Contains("Waiting for save confirmation"),"uncertain result is not saved proof");
        var legacy=LastStandTierHudText.Result(0,false,1200,10,1,0,true,false,false,false);
        Check(legacy.Contains("Legacy result: no tier credit"),"legacy claim remains honest");
        // Fixed line budgets are an early readability guard, not font shaping or browser proof.
        foreach(var result in new[]{saved,limit,uncertain,legacy,LastStandTierHudText.Result(2,true,3600,int.MaxValue,0,int.MaxValue,true,true,true,false)})
        {
            Check(result.Split('\n').Length==5,"result exceeds the five-line slot");
            foreach(var line in result.Split('\n')) Check(line.Length<=42,"result exceeds narrow text budget: "+line);
        }
        Check(LastStandTierHudText.LockReason.Length<=42,"locked tier reason exceeds narrow text budget");
    }
    static void LiveGoal()
    {
        var heading = typeof(LastStandTierHudText).GetMethod("BattleHeading");
        Check(heading != null,"live goal heading must explain the run-end save boundary");
        string Read(int tier,int ticks) => (string)heading.Invoke(null,new object[]{tier,ticks});
        foreach(var tier in new[]{1,2})
        {
            int threshold=LastStandTierCatalog.Get(tier).GoalTicks;
            Check(Read(tier,threshold-1)=="HOLD THE POSITION","do not announce goal before its exact threshold");
            foreach(var ticks in new[]{threshold,threshold+1,LastStandTierCatalog.HorizonTicks})
            {
                var text=Read(tier,ticks);
                Check(text=="Goal met; saves at end","live goal explains future persistence");
                Check(!text.Contains("saved") && !text.Contains("unlocked") && !text.Contains("best"),"live progress is not saved credit");
                Check(text.Split('\n').Length==1 && text.Length<=25,"keep the live banner in one compact line");
            }
        }
    }
    public static int Main(string[] args)
    {
        try { if(args[0]=="geometry")Geometry(); else if(args[0]=="text")Text(); else if(args[0]=="live-goal")LiveGoal(); else throw new Exception("unknown case");
            Console.WriteLine("PASS "+args[0]);return 0; }
        catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
    }
}
