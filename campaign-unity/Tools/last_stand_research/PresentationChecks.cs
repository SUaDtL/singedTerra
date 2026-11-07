using System;
using System.Collections.Generic;
using System.Linq;
using SingedTerra.LastStand;

static class PresentationChecks
{
    static void Require(bool ok,string message){if(!ok)throw new Exception(message);}
    static void Catalog()
    {
        var rows=new List<LastStandResearchListEntry>();
        for(int i=0;i<40;i++)rows.Add(new LastStandResearchListEntry("project-"+i,"Project "+i,i%2==0?"Economy":"Combat"));
        var list=new LastStandResearchList(rows);Require(list.Visible.Count==40,"forty catalog rows represented");
        list.Select("project-39");list.Filter("Combat","");Require(list.SelectedKey=="project-39" && list.Visible.Count==20,"filter retains visible stable identity");
        list.Filter("Economy","Project 2");Require(list.Visible.Count==6 && list.SelectedKey=="project-2","search matches actual project text");
        list.Filter("","missing");Require(list.Visible.Count==0 && list.SelectedKey==null,"empty filter is truthful");
        list.Filter("","");rows.Clear();Require(list.Visible.Count==40,"list owns catalog snapshot");
    }
    static LastStandResearchState Started()
    {
        var state=LastStandResearchState.Create(0);var intent=LastStandResearchPresentation.Intent(state.Snapshot(),0,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Start);
        Require(state.TryApply(intent,1000,100,out var next),"setup funded");return next.State;
    }
    static void Actions()
    {
        var state=LastStandResearchState.Create(0);var s=state.Snapshot();
        var start=LastStandResearchPresentation.Intent(s,0,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Start);
        Require(!LastStandResearchPresentation.CanSubmit(s,start,1000,24),"locked Lab cannot start");
        Require(!LastStandResearchPresentation.CanSubmit(s,start,0,25),"insufficient shared Salvage cannot start");
        Require(LastStandResearchPresentation.CanSubmit(s,start,1000,25),"eligible first Lab opens");
        s=Started().Snapshot();var queue=LastStandResearchPresentation.Intent(s,0,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Queue);
        Require(queue.Rank==2 && LastStandResearchPresentation.CanSubmit(s,queue,1000,100),"next same track rank may queue behind active");
        var other=LastStandResearchPresentation.Intent(s,1,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Start);
        Require(!LastStandResearchPresentation.CanSubmit(s,other,1000,100),"track cannot occupy two slots");
        Require(LastStandResearchPresentation.Quote(s,queue).Contains("estimate; duration locks on start"),"queued fresh duration labeled estimate");
    }
    static void Suspended()
    {
        var state=Started();Require(state.TryAdvance(60000,60000,false,out var elapsed),"elapsed setup");state=elapsed.State;
        var intent=LastStandResearchPresentation.Intent(state.Snapshot(),0,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Suspend);
        Require(state.TryApply(intent,980,100,out var suspended),"suspend setup");var snapshot=suspended.State.Snapshot();
        var resume=LastStandResearchPresentation.Intent(snapshot,1,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Start);
        string quote=LastStandResearchPresentation.Quote(snapshot,resume);
        Require(quote.Contains("20 Salvage") && quote.Contains("9m 0s") && quote.Contains("repays refunded cost"),"resume shows retained time and repayment");
        Require(LastStandResearchPresentation.TrackState(snapshot,LastStandResearchTrackId.GameSpeed).Contains("SUSPENDED"),"suspension state inspectable");
        Require(LastStandResearchPresentation.CanSubmit(snapshot,resume,20,100),"suspended work may resume elsewhere");
    }
    static void Readouts()
    {
        Require(LastStandResearchPresentation.Effect(LastStandResearchTrackId.GameSpeed,8).Contains("5.0x"),"speed effect actual cap");
        Require(LastStandResearchPresentation.Effect(LastStandResearchTrackId.ResearchSpeed,1).Contains("Does not accelerate itself"),"self research exclusion disclosed");
        Require(LastStandResearchPresentation.Duration(1)=="1s" && LastStandResearchPresentation.Duration(86400001)=="1d 0h","ceil duration never claims complete early");
    }
    static void Garage()
    {
        int[,] sizes={{390,844},{390,688},{844,266},{720,640},{1366,768},{1920,1080},{844,220},{600,220}};
        string[] ids={"Deploy","Menu","TierPrevious","TierNext","FittingPrevious","FittingNext","ShopEntry","ResearchEntry"};
        for(int i=0;i<sizes.GetLength(0);i++)
        {
            float w=sizes[i,0],h=sizes[i,1];var view=LastStandHudLayout.Project(w,h,"garage",ids);
            var controls=view.Slots.Where(x=>x.Kind=="control").ToArray();
            Require(controls.Any(x=>x.Id=="ResearchEntry"),"direct garage Research route present");
            foreach(var a in controls)
            {
                var b=a.Bounds;Require(b.X>=0 && b.Y>=0 && b.X+b.Width<=w+.01 && b.Y+b.Height<=h+.01 && b.Width>=44 && b.Height>=44,"targets bounded at "+w+"x"+h+" "+a.Id);
                foreach(var other in controls)if(other!=a)
                {var c=other.Bounds;Require(!(b.X<c.X+c.Width-.01 && c.X<b.X+b.Width-.01 && b.Y<c.Y+c.Height-.01 && c.Y<b.Y+b.Height-.01),"targets overlap "+a.Id+"/"+other.Id+" at "+w+"x"+h);}
            }
        }
        var battle=LastStandHudLayout.Project(1366,768,"battle",new[]{"Menu","SpeedMinus","SpeedRate","SpeedPlus","ShopEntry"});
        Require(!battle.Slots.Any(x=>x.Id=="ResearchEntry"),"no new combat toolbar action");
    }
    static void BulkGeometry()
    {
        int[,] sizes={{390,688},{844,266},{720,516},{1366,664},{1920,976}};
        string[] keys={"cannonAttack","launcherAttack","hullCapacity","armor","cannonCycle","fieldRepair","scattergunAttack","scrapYield"};
        string[] controls={"Menu","SpeedRate","ShopEntry"};
        for(int i=0;i<sizes.GetLength(0);i++)
        {
            float w=sizes[i,0],h=sizes[i,1];
            var input=new LastStandHudLayout.ShopPanelInput(true,keys,0,
                Enumerable.Repeat(100f,keys.Length).ToArray(),Enumerable.Repeat(60f,keys.Length).ToArray(),
                Enumerable.Repeat(40f,keys.Length).ToArray(),40);
            var view=LastStandHudLayout.Project(w,h,"battle",controls,input);
            var quantity=view.Slots.Single(x=>x.Id=="ShopQuantity");var viewport=view.Slots.Single(x=>x.Id=="ShopViewport");
            Require(quantity.Bounds.Width>=100 && quantity.Bounds.Height>=44,"quantity target readable and full sized");
            Require(viewport.Bounds.Height>=44 && view.MaximumScrollOffset>0,"bulk detail keeps a real scroll viewport");
            foreach(var other in view.Slots.Where(x=>x.Parent=="ShopPanel" && x!=quantity))
            {
                var a=quantity.Bounds;var b=other.Bounds;
                Require(!(a.X<b.X+b.Width-.01 && b.X<a.X+a.Width-.01 && a.Y<b.Y+b.Height-.01 && b.Y<a.Y+a.Height-.01),
                    "quantity overlaps "+other.Id+" at "+w+"x"+h);
            }
            foreach(var box in view.Slots.Where(x=>x.Parent=="ShopPanel"))
                Require(box.Bounds.X>=0&&box.Bounds.Y>=0&&box.Bounds.X+box.Bounds.Width<=w+.01&&box.Bounds.Y+box.Bounds.Height<=h+.01,
                    "fixed shop content on screen "+box.Id);
        }
    }
    public static int Main(string[] args)
    {
        var cases=new Dictionary<string,Action>{{"catalog",Catalog},{"actions",Actions},{"suspended",Suspended},{"readouts",Readouts},{"garage",Garage},{"bulk",BulkGeometry}};
        try{cases[args[0]]();Console.WriteLine("PASS "+args[0]);return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
