using System;
using System.Collections.Generic;
using SingedTerra.LastStand;

static class ProgressionPlannerChecks
{
    const long Epoch=1790000000000L;
    sealed class Storage : ILastStandStorage
    {
        public string Raw;
        public int Writes;
        public string Read()=>Raw;
        public void Write(string value){Raw=value;Writes++;}
    }
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static LastStandProgression Load(Storage store)=>LastStandProgression.Load(store,()=>Epoch);
    static Storage Seed(int wallet=0,int bestWave=0)
    {
        var store=new Storage();Check(Load(store).SaveState=="ready","fresh fixture");
        var map=LastStandSaveJson.Read(store.Raw);map["credits"]=wallet;
        LastStandSaveJson.Object(LastStandSaveJson.Object(map["tierRecords"])["tier-1"])["bestWave"]=bestWave;
        var milestones=new List<object>();
        foreach(var m in LastStandRewardCatalog.Milestones(LastStandTierCatalog.Get(1)))if(m.Wave<=bestWave)milestones.Add(m.Id);
        map["firstClears"]=milestones;
        if(bestWave>=100)LastStandSaveJson.Array(map["unlockedFittings"]).Add("scattergun");
        store.Raw=LastStandSaveJson.Write(map);Check(Load(store).SaveState=="ready","fixture validates with actual parser");return store;
    }
    static LastStandPlannerView View(LastStandProgression p,string pin="",LastStandResearchSnapshot research=null)=>
        LastStandProgressionPlanner.Project(p,research??p.ResearchSnapshot,LastStandFittingCatalog.Parse(p.SelectedFitting),pin);
    static LastStandPlannerGoal Goal(LastStandPlannerView view,string key)
    {foreach(var row in view.Goals)if(row.Key==key)return row;throw new Exception("Missing goal "+key);}
    static LastStandResearchTime Time(LastStandProgression p,long elapsed=0)
    {
        var clock=new LastStandResearchClock(p.ResearchSnapshot.lastObservedUtcMilliseconds);
        Check(clock.TrySample(p.ResearchSnapshot.lastObservedUtcMilliseconds+elapsed,0,out var time),"clock fixture");return time;
    }
    static void ResearchAction(LastStandProgression p,LastStandResearchAction action)
    {
        var intent=LastStandResearchPresentation.Intent(p.ResearchSnapshot,0,LastStandResearchTrackId.GameSpeed,action);
        Check(p.TryResearchAction(intent,Time(p)),"research action "+action);
    }
    static void CatalogAndPurity()
    {
        var store=Seed();var p=Load(store);string before=store.Raw;int writes=store.Writes;
        var view=View(p,"tier:tier-2");
        Check(view.Pinned.Key=="tier:tier-2"&&!view.Pinned.Achieved&&view.Pinned.Detail.Contains("Tier 1 wave 300"),"tier unlock goal uses catalog");
        Check(Goal(view,"fitting:mortar").Detail.Contains("Tier 1 wave 500"),"fitting milestone provenance");
        var keys=new HashSet<string>();foreach(var goal in view.Goals)Check(keys.Add(goal.Key),"unique goal identities");
        Check(!keys.Contains("tier:tier-3"),"show only first locked tier");
        Check(Goal(view,"tier:tier-1").Achieved,"unlocked goal state");
        Check(view.Wallet==0&&store.Raw==before&&store.Writes==writes,"projection cannot change profile or clock");
    }
    static void SharedBudgetQuotes()
    {
        var store=Seed();var p=Load(store);var view=View(p);
        foreach(var card in LastStandShopPresentation.ProjectPermanent(p,LastStandFitting.Repair).Cards)
        {
            var goal=Goal(view,"workshop:"+card.Key+":1");
            Check(goal.Cost==card.NextPrice&&goal.Shortfall==card.NextPrice,"planner must quote real next price with empty wallet");
            Check(!goal.ActionAvailable&&goal.Detail.Contains(card.CurrentEffectDescription)&&goal.Detail.Contains(card.NextEffectDescription),"real effects and funding refusal");
        }
        var speed=Goal(view,"research:gameSpeed:1");
        Check(speed.Cost==20&&speed.Shortfall==20&&speed.Detail.Contains("10m")&&!speed.ActionAvailable,"research exact cost and duration");
        Check(speed.Detail.Contains("wave 25"),"lab locked prerequisite");
        var quote=LastStandResearchPresentation.ProjectQuote(p.ResearchSnapshot,LastStandResearchTrackId.GameSpeed,1);
        Check(quote.Rank==1&&quote.Cost==20&&quote.DurationMilliseconds==600000&&quote.RemainingMilliseconds==600000&&
            !quote.ResumesPartial,"shared quote exposes exact first-rank price and real-time duration");
        Check(LastStandResearchPresentation.ProjectQuote(p.ResearchSnapshot,LastStandResearchTrackId.GameSpeed,9)==null,
            "no quote beyond authored research cap");
        Check(LastStandResearchPresentation.Availability(p.ResearchSnapshot,LastStandResearchTrackId.GameSpeed,1000,0,true)=="PREVIEW - RESEARCH LOCKED",
            "affordable research is still only a preview before the lab unlock");
        Check(LastStandResearchPresentation.Availability(p.ResearchSnapshot,LastStandResearchTrackId.GameSpeed,19,25,true)=="NEED 1 SALVAGE",
            "project list states the exact funding shortfall");
        Check(LastStandResearchPresentation.Availability(p.ResearchSnapshot,LastStandResearchTrackId.GameSpeed,20,25,false)=="SAVE REQUIRED",
            "project list cannot promise availability while actions are blocked");
        store=Seed(20,25);p=Load(store);view=View(p);
        Check(Goal(view,"research:gameSpeed:1").ActionAvailable&&Goal(view,"research:gameSpeed:1").Shortfall==0,"exactly affordable research");
        Check(LastStandResearchPresentation.Availability(p.ResearchSnapshot,LastStandResearchTrackId.GameSpeed,20,25,true)=="READY TO START",
            "unlocked affordable idle lab offers research");
        Check(Goal(view,"workshop:cannonAttack:1").ActionAvailable,"same wallet can fund workshop alternative");
        p=Load(Seed(27,25));
        var salvageIntent=LastStandResearchPresentation.Intent(p.ResearchSnapshot,0,LastStandResearchTrackId.SalvageRecovery,LastStandResearchAction.Start);
        Check(p.TryResearchAction(salvageIntent,Time(p))&&p.Wallet==0,"funded alternate project fixture");
        Check(LastStandResearchPresentation.Availability(p.ResearchSnapshot,LastStandResearchTrackId.GameSpeed,0,25,true)=="CAN SWITCH PROJECT",
            "refund-funded switch must not be mislabeled as an unaffordable project");
        var switchOffer=LastStandResearchPresentation.ProjectAction(p.ResearchSnapshot,
            LastStandResearchPresentation.Intent(p.ResearchSnapshot,0,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Switch),0,25);
        Check(switchOffer.CanSubmit&&switchOffer.Refund==27&&switchOffer.Funding.Cost==20&&switchOffer.Shortfall==0,
            "shared action preview accounts for refund before affordability");
    }
    static void FixedPinAndUnavailable()
    {
        var p=Load(Seed(100));var before=View(p,"workshop:cannonAttack:1");
        Check(!before.Pinned.Achieved&&p.TryPurchase(LastStandUpgradeTrackId.CannonAttack),"real permanent purchase");
        var after=View(p,before.Pinned.Key);
        Check(after.Pinned.Key=="workshop:cannonAttack:1"&&after.Pinned.Achieved&&after.Pinned.Cost==null,"pin must not silently retarget");
        Check(Goal(after,"workshop:cannonAttack:2").Cost.HasValue,"next level offered separately");
        foreach(string key in new[]{"research:removed:1","workshop:cannonAttack:999999","research:gameSpeed:01"})
        {var unknown=View(p,key).Pinned;Check(!unknown.Available&&unknown.Key==key&&!unknown.ActionAvailable&&unknown.Cost==null,"unknown pin preserved with no invented price");}
        Check(View(p).Pinned==null,"clear pin leaves none");
    }
    static void FundedAndSuspended()
    {
        var store=Seed(1000,100);var p=Load(store);ResearchAction(p,LastStandResearchAction.Start);
        var queueOffer=View(p,"research:gameSpeed:2").Pinned;
        Check(queueOffer.ActionAvailable&&queueOffer.Availability=="Can fund in Research"&&queueOffer.Cost==60,
            "next queued rank must agree with actual queue admission");
        ResearchAction(p,LastStandResearchAction.Queue);string saved=store.Raw;int writes=store.Writes;
        var active=View(p,"research:gameSpeed:1").Pinned;var queued=View(p,"research:gameSpeed:2").Pinned;
        Check(active.Availability=="Active"&&queued.Availability=="Queued"&&active.Cost==0&&queued.Cost==0,
            "funded ranks must not request paying again");
        Check(!active.ActionAvailable&&!queued.ActionAvailable&&active.Shortfall==0&&queued.Shortfall==0,"funded legality");
        var suspend=LastStandResearchPresentation.ProjectAction(p.ResearchSnapshot,
            LastStandResearchPresentation.Intent(p.ResearchSnapshot,0,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Suspend),0,100);
        Check(suspend.CanSubmit&&suspend.Refund==80&&suspend.RemovesQueuedProject,
            "suspend preview includes the canceled queued successor refund");
        var change=LastStandResearchPresentation.ProjectAction(p.ResearchSnapshot,
            LastStandResearchPresentation.Intent(p.ResearchSnapshot,0,LastStandResearchTrackId.ResearchSpeed,LastStandResearchAction.Switch),0,100);
        Check(change.CanSubmit&&change.Refund==80&&change.Funding.Cost==17&&change.RemovesQueuedProject,
            "switch preview explains all refunded and canceled work");
        Check(store.Raw==saved&&store.Writes==writes,"reading funded research does not advance or respend");
        ResearchAction(p,LastStandResearchAction.RemoveQueued);
        Check(p.TryReconcileResearch(Time(p,300000)),"earn partial time");ResearchAction(p,LastStandResearchAction.Suspend);
        var partial=View(p,"research:gameSpeed:1").Pinned;
        Check(partial.Cost==20&&partial.Detail.Contains("5m")&&partial.Detail.Contains("refunded cost")&&partial.ActionAvailable,
            "resume quote must repay original charge and retain earned time");
        var quote=LastStandResearchPresentation.ProjectQuote(p.ResearchSnapshot,LastStandResearchTrackId.GameSpeed,1);
        Check(quote.ResumesPartial&&quote.Cost==20&&quote.EarnedMilliseconds==300000&&quote.RemainingMilliseconds==300000,
            "shared Lab/Planner projection retains the paid duration and elapsed time");
        ResearchAction(p,LastStandResearchAction.Start);
        var different=LastStandResearchPresentation.Intent(p.ResearchSnapshot,0,LastStandResearchTrackId.ResearchSpeed,LastStandResearchAction.Queue);
        Check(p.TryResearchAction(different,Time(p)),"queue a different track");
        var promote=LastStandResearchPresentation.ProjectAction(p.ResearchSnapshot,
            LastStandResearchPresentation.Intent(p.ResearchSnapshot,0,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Suspend),p.Wallet,100);
        Check(promote.CanSubmit&&promote.Refund==20&&!promote.RemovesQueuedProject&&promote.StartsQueuedProject,
            "suspend promotes a different queued track without inventing cancellation or a second refund");
    }
    static void CapsSaveAndActiveRun()
    {
        var store=Seed(1000,100);var raw=LastStandSaveJson.Read(store.Raw);
        LastStandSaveJson.Object(raw["permanentLevels"])["armor"]=LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor).PermanentCap;
        store.Raw=LastStandSaveJson.Write(raw);var p=Load(store);var view=View(p);
        var armor=LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor);
        var cap=Goal(view,"workshop:armor:"+armor.PermanentCap);
        Check(cap.Achieved&&cap.Cost==null&&!cap.ActionAvailable,"cap is achieved without zero-cost purchase");
        Check(!Goal(view,"workshop:mortarAttack:1").ActionAvailable,"locked/mismatched mortar refuses purchase");
        Check(p.TryDeploy(),"active checkpoint");string saved=store.Raw;var checkpoint=p.Checkpoint;
        var goal=View(p,"workshop:cannonAttack:1").Pinned;
        Check(goal.ActionAvailable&&goal.Detail.Contains("next deployment"),"active-run owner permits only next-run permanent benefit");
        Check(store.Raw==saved&&p.Checkpoint==checkpoint,"planner preserves live checkpoint");
        var broken=Load(new Storage {Raw="corrupt"});var bad=View(broken);
        Check(!Goal(bad,"workshop:cannonAttack:1").ActionAvailable&&!Goal(bad,"research:gameSpeed:1").ActionAvailable,
            "unavailable profile cannot imply an action");
        Check(!Goal(bad,"tier:tier-1").Detail.Contains("Tier 0 wave 0")&&
            !Goal(bad,"fitting:repair").Detail.Contains("Tier 0 wave 0"),"unavailable starter profile must not invent an unlock requirement");
    }
    static void ResearchCompletedAndStaleSnapshot()
    {
        var p=Load(Seed(1000,100));ResearchAction(p,LastStandResearchAction.Start);
        Check(p.TryReconcileResearch(Time(p,600000)),"complete funded rank");
        var completed=View(p,"research:gameSpeed:1").Pinned;
        Check(completed.Achieved&&completed.Cost==null&&!completed.ActionAvailable,"completed research pin remains achieved");
        var invalid=p.ResearchSnapshot;invalid.catalogVersion="future-research";
        var unknown=View(p,"research:gameSpeed:1",invalid).Pinned;
        Check(!unknown.Achieved&&!unknown.ActionAvailable&&unknown.Cost==null&&unknown.Detail.Contains("unavailable"),
            "unsupported snapshot cannot invent completion or quote");
    }
    public static int Main(string[] args)
    {
        try
        {
            switch(args[0])
            {
                case "catalog":CatalogAndPurity();break;
                case "budget":SharedBudgetQuotes();break;
                case "pin":FixedPinAndUnavailable();break;
                case "funded":FundedAndSuspended();break;
                case "restrictions":CapsSaveAndActiveRun();break;
                case "completed":ResearchCompletedAndStaleSnapshot();break;
                default:throw new Exception("Unknown case "+args[0]);
            }
            Console.WriteLine("PASS "+args[0]);return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
