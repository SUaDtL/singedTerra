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
        Check(LastStandTierHudText.Goal(1)=="Tier 1 / Clear every enemy to advance" &&
            LastStandTierHudText.Goal(2)=="Tier 2 / Clear every enemy to advance","wave completion explains its actual condition");
        Check(!LastStandTierHudText.GoalMet(1,299) && LastStandTierHudText.GoalMet(1,300),"exact Tier 2 wave unlock threshold");
        Check(!LastStandTierHudText.GoalMet(2,299) && LastStandTierHudText.GoalMet(2,300) &&
            !LastStandTierHudText.GoalMet(3,299) && LastStandTierHudText.GoalMet(3,300) &&
            !LastStandTierHudText.GoalMet(4,int.MaxValue),"each authored next tier has an exact threshold; final tier does not invent another");
        Check(LastStandTierHudText.Progress(2,1799)=="T2 / WAVE 1799","live progress labels the wave rather than elapsed seconds");
        Check(LastStandTierHudText.WaveBest(0)=="Best: no completed wave" &&
            LastStandTierHudText.WaveBest(5000)=="Best: wave 5000","wave best never invents a completion");
        Check(LastStandTierHudText.NextMilestone(1,99)=="Next W100: +50 Salvage\nUnlock Auxiliary Scattergun" &&
            LastStandTierHudText.NextMilestone(1,100)=="Next W200: +100 Salvage" &&
            LastStandTierHudText.NextMilestone(2,10000)=="Keep farming repeatable wave rewards.","next milestone advances without implying a run ending");
        Check(LastStandTierHudText.WaveProgress(1,300,2)=="T1 / WAVE 300 / 2 LEFT","remaining enemies stay distinct from completed waves");
        Check(LastStandTierHudText.Best(0,0)=="Best: no saved run","do not invent history");
        Check(LastStandTierHudText.Best(3600,int.MaxValue).Contains("Legacy best 180.0s / 2147483647 disabled"),"retained time and kill records are labeled historical");
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
        foreach(var tier in new[]{1,2})
        foreach(var wave in new[]{1,299,300,301,2000,5000,int.MaxValue})
        {
            var text=LastStandTierHudText.BattleHeading(tier,wave);
            Check(text=="CLEAR WAVE "+wave,"live heading names the current uncleared wave");
            Check(!text.Contains("saved") && !text.Contains("unlocked") && !text.Contains("best"),"live identity does not assert saved credit");
            Check(text.Split('\n').Length==1 && text.Length<=25,"keep the live banner in one compact line");
        }
    }
    public static int Main(string[] args)
    {
        try { if(args[0]=="geometry")Geometry(); else if(args[0]=="text")Text(); else if(args[0]=="live-goal")LiveGoal(); else throw new Exception("unknown case");
            Console.WriteLine("PASS "+args[0]);return 0; }
        catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
    }
}
