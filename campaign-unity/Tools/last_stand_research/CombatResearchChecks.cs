using System;
using System.Collections.Generic;
using SingedTerra.LastStand;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        public static string CombatResearchWrite(LastStandResearchState state)=>LastStandSaveJson.Write(ResearchJson(state));
        public static LastStandResearchState CombatResearchRead(string raw)=>ReadResearch(LastStandSaveJson.Read(raw));
        public static string CombatResearchContext(LastStandResearchState state,LastStandShopCheckpoint shop)=>ResearchContext(new Record {Research=state},shop);
    }
}

static class CombatResearchChecks
{
    const long Epoch=1790000000000L;
    sealed class Store:ILastStandStorage
    {
        public string Raw;
        public string Read()=>Raw;
        public void Write(string raw){Raw=raw;}
    }
    sealed class TimeSource:ILastStandTime
    {
        public long UtcMilliseconds {get;set;}=Epoch;
        public double MonotonicSeconds {get;set;}
        public void Advance(long elapsed){UtcMilliseconds+=elapsed;MonotonicSeconds+=elapsed/1000d;}
    }
    static void Need(bool condition,string message){if(!condition)throw new Exception(message);}
    static void Reject(Action action,string message)
    {
        try{action();}catch(FormatException){return;}catch(ArgumentException){return;}
        throw new Exception(message);
    }
    static LastStandResearchIntent Intent(LastStandResearchState state,int slot,LastStandResearchTrackId track,
        LastStandResearchAction action=LastStandResearchAction.Start)=>LastStandResearchPresentation.Intent(state.Snapshot(),slot,track,action);
    static LastStandResearchState Apply(LastStandResearchState state,ref long wallet,int slot,LastStandResearchTrackId track,
        LastStandResearchAction action=LastStandResearchAction.Start)
    {
        Need(state.TryApply(Intent(state,slot,track,action),wallet,1000,500,out var change),"Funded action accepted");
        wallet+=change.WalletDelta;return change.State;
    }
    static Store Seed(int tierOne,int tierTwo,int wallet=100000)
    {
        var store=new Store();Need(LastStandProgression.Load(store,()=>Epoch).SaveState=="ready","Seed real owner");
        var map=LastStandSaveJson.Read(store.Raw);map["credits"]=wallet;
        Func<int,int> best=tier=>tier==1?tierOne:tier==2?tierTwo:0;
        var grants=LastStandRewardCatalog.Entitlements(best);
        var records=LastStandSaveJson.Object(map["tierRecords"]);var claims=new List<object>();
        foreach(var tier in LastStandTierCatalog.All)
        {
            var row=LastStandSaveJson.Object(records[tier.Key]);row["bestWave"]=best(tier.Id);
            row["unlocked"]=tier.RequiredTier==0||best(tier.RequiredTier)>=tier.RequiredWave;
            foreach(var milestone in LastStandRewardCatalog.Milestones(tier))if(milestone.Wave<=best(tier.Id))claims.Add(milestone.Id);
        }
        map["firstClears"]=claims;var fittings=new List<object>();foreach(var id in grants.Fittings)fittings.Add(id);
        map["unlockedFittings"]=fittings;store.Raw=LastStandSaveJson.Write(map);
        Need(LastStandProgression.Load(store,()=>Epoch).SaveState=="ready","Earned fixture admitted by real parser");return store;
    }
    static void EntitlementsAndQueues()
    {
        var state=LastStandResearchState.Create(Epoch);var armor=LastStandResearchTrackId.ArmorPiercing;
        Need(!state.TryApply(Intent(state,0,armor),100000,499,0,out _),"Combat track locked before T1 wave500");
        Need(!state.TryApply(Intent(state,0,armor),299,500,0,out _),"Cannot spend unavailable Salvage");
        Need(state.TryApply(Intent(state,0,armor),300,500,0,out var first)&&first.WalletDelta==-300,"Exact quoted first rank affordable");
        Need(!state.TryApply(Intent(state,2,armor),100000,1000,499,out _),"Lab3 locked before T2 wave500");
        Need(state.TryApply(Intent(state,2,armor),100000,1000,500,out _),"Lab3 unlock comes from shared reward projection");
        long wallet=100000;var tracks=new[]{armor,LastStandResearchTrackId.AreaControl,LastStandResearchTrackId.FieldEngineering};
        for(int slot=0;slot<3;slot++){state=Apply(state,ref wallet,slot,tracks[slot]);state=Apply(state,ref wallet,slot,tracks[slot],LastStandResearchAction.Queue);}
        long paid=wallet;Need(state.TryAdvance(100L*86400000,Epoch+100L*86400000,false,out var done),"Closed three-lab reconciliation");
        Need(done.Completions.Count==6&&done.WalletDelta==0&&wallet==paid,"Exactly six prepaid completions and no paid repeat");
        foreach(var track in tracks)Need(done.State.Rank(track)==2,"Both paid ranks complete once");
        foreach(var slot in done.State.Snapshot().slots)Need(slot.active==null&&slot.queued==null,"No automatic rank3 purchase");
        Need(!done.State.IsAvailableFor(499,0)&&done.State.IsAvailableFor(500,0),"Combat grants require earned entitlement");
        Need(!state.IsAvailableFor(1000,499)&&state.IsAvailableFor(1000,500),"Funded third lab requires its earned entitlement");
        state=LastStandResearchState.Create(Epoch);wallet=1000;state=Apply(state,ref wallet,0,armor);
        Need(state.TryAdvance(60000,Epoch+60000,false,out var progress),"Earned real-time partial");state=progress.State;
        long identity=state.Snapshot().slots[0].active.identity;state=Apply(state,ref wallet,0,armor,LastStandResearchAction.Suspend);
        Need(wallet==1000&&state.Snapshot().Partial(armor).earnedMilliseconds==60000,"Suspend refunds once and preserves new-track time");
        state=Apply(state,ref wallet,1,armor);
        Need(wallet==700&&state.Snapshot().slots[1].active.identity==identity&&state.Snapshot().slots[1].active.earnedMilliseconds==60000,"Resume repays exact cost and keeps identity/time");
    }
    static void LegacyMigration()
    {
        var state=LastStandResearchState.Create(Epoch);long wallet=1000;
        state=Apply(state,ref wallet,0,LastStandResearchTrackId.GameSpeed);
        state=Apply(state,ref wallet,0,LastStandResearchTrackId.GameSpeed,LastStandResearchAction.Queue);
        state=Apply(state,ref wallet,1,LastStandResearchTrackId.SalvageRecovery);
        Need(state.TryAdvance(12345,Epoch+12345,false,out var advance),"Legacy timer progress");state=advance.State;
        state=Apply(state,ref wallet,1,LastStandResearchTrackId.SalvageRecovery,LastStandResearchAction.Suspend);
        string canonical=LastStandProgression.CombatResearchWrite(state);
        var map=LastStandSaveJson.Read(canonical);map["catalogVersion"]=LastStandResearchCatalog.LegacyVersion;
        foreach(string key in new[]{"armorPiercing","areaControl","fieldEngineering"})
        {LastStandSaveJson.Object(map["completedRanks"]).Remove(key);LastStandSaveJson.Object(map["partials"]).Remove(key);}
        LastStandSaveJson.Array(map["slots"]).RemoveAt(2);
        string legacy=LastStandSaveJson.Write(map);var restored=LastStandProgression.CombatResearchRead(legacy);
        Need(LastStandProgression.CombatResearchWrite(restored)==canonical,"Old two-lab paid projects, partials, IDs, costs, duration and grants migrate losslessly");
        Need(restored.TryAdvance(90000000,Epoch+90000000,false,out var a),"Future migrated completions");
        Need(state.TryAdvance(90000000,Epoch+90000000,false,out var b),"Future original completions");
        Need(LastStandProgression.CombatResearchWrite(a.State)==LastStandProgression.CombatResearchWrite(b.State),"Migrated paid work has identical future completions");
        map["catalogVersion"]="research-v3";Reject(()=>LastStandProgression.CombatResearchRead(LastStandSaveJson.Write(map)),"Unknown future catalog rejected");
        map=LastStandSaveJson.Read(legacy);LastStandSaveJson.Object(map["completedRanks"])["armorPiercing"]=0;
        Reject(()=>LastStandProgression.CombatResearchRead(LastStandSaveJson.Write(map)),"Legacy shape cannot smuggle added track fields");
    }
    static void Quotes()
    {
        var state=LastStandResearchState.Create(Epoch);var snapshot=state.Snapshot();
        foreach(var track in new[]{LastStandResearchTrackId.ArmorPiercing,LastStandResearchTrackId.AreaControl,LastStandResearchTrackId.FieldEngineering})
        {
            var quote=LastStandResearchPresentation.ProjectQuote(snapshot,track,1);var definition=LastStandResearchCatalog.Get(track);
            Need(quote.Cost==definition.Cost(1)&&quote.DurationMilliseconds==definition.BaseDurationMilliseconds(1),"Quote uses authoritative funded values");
            Need(quote.BeforeEffect==LastStandResearchPresentation.Effect(track,0)&&quote.AfterEffect==LastStandResearchPresentation.Effect(track,1),"Before and after share effect projection");
            Need(quote.AppliesOnNextDeployment&&quote.AppliesTo.Length>10&&quote.ApplicationTiming.Contains("saved run"),"Quote discloses applicability and snapshot timing");
            Need(LastStandResearchPresentation.Availability(snapshot,track,100000,499,true).Contains("LOCKED"),"Lab communicates earned unlock");
            Need(LastStandResearchPresentation.Availability(snapshot,track,100000,500,true)=="READY TO START","Lab exposes available start");
        }
        var armor=LastStandResearchPresentation.ProjectQuote(snapshot,LastStandResearchTrackId.ArmorPiercing,1);
        Need(armor.AfterEffect.StartsWith("1 armor")&&armor.AppliesTo.Contains("Railgun"),"Flat armor effect and ignoring-weapon exception explicit");
        var area=LastStandResearchPresentation.ProjectQuote(snapshot,LastStandResearchTrackId.AreaControl,20);
        Need(area.AfterEffect.Contains("1.40x")&&area.AppliesTo.Contains("Mortar")&&area.AppliesTo.Contains("Arc Coil"),"Area cap is shared numeric projection");
        var profile=LastStandProgression.Load(Seed(500,0),()=>Epoch);
        var planner=LastStandProgressionPlanner.Project(profile,profile.ResearchSnapshot,LastStandFitting.Repair,"research:armorPiercing:1");
        Need(planner.Pinned.Cost==armor.Cost&&planner.Pinned.Detail.Contains(armor.AfterEffect)&&planner.Pinned.Detail.Contains(armor.AppliesTo)&&planner.Pinned.ActionAvailable,"Planner shares Lab funding, applicability and effects");
        profile=LastStandProgression.Load(Seed(1000,500),()=>Epoch);
        Need(profile.TryApplyLoadout(new LastStandLoadout("repair","mortar")),"Two-bay quote fixture");
        planner=LastStandProgressionPlanner.Project(profile,profile.ResearchSnapshot,LastStandFitting.Repair,"workshop:mortarAttack:1");
        Need(!planner.Pinned.Detail.Contains("Dormant")&&planner.Pinned.ActionAvailable,"Secondary-bay Workshop upgrade must be active in Planner");
        area=LastStandResearchPresentation.ProjectQuote(snapshot,LastStandResearchTrackId.AreaControl,1,loadout:new LastStandLoadout("launcher","mortar"));
        Need(area.AppliesToBothBays&&area.LoadoutApplicability.Contains("both"),"Area quote covers both equipped damage fittings");
        var engineering=LastStandResearchPresentation.ProjectQuote(snapshot,LastStandResearchTrackId.FieldEngineering,1,loadout:new LastStandLoadout("repair","shield"));
        Need(engineering.AppliesToBothBays,"Engineering quote covers repair and shield in either bay");
        armor=LastStandResearchPresentation.ProjectQuote(snapshot,LastStandResearchTrackId.ArmorPiercing,1,loadout:new LastStandLoadout("repair","railgun"));
        Need(armor.AppliesToBaseCannon&&!armor.AppliesToPrimaryBay&&!armor.AppliesToSecondaryBay,"Armor still benefits base cannon without eligible fittings");
        Need(armor.LoadoutApplicability=="Applies to the base cannon.","Cannon-only armor quote must not imply dormant research");
        foreach(var loadout in new[]{new LastStandLoadout("launcher"),new LastStandLoadout("repair","arc"),new LastStandLoadout("launcher","mortar")})
        {
            armor=LastStandResearchPresentation.ProjectQuote(snapshot,LastStandResearchTrackId.ArmorPiercing,1,loadout:loadout);
            Need(armor.LoadoutApplicability.Contains("base cannon"),"Armor applicability must retain the base cannon alongside matching bays: "+loadout);
            Need(armor.LoadoutApplicability.Contains(armor.AppliesToBothBays?"both":armor.AppliesToPrimaryBay?"bay 1":"bay 2"),"Armor matching bay description stays specific");
        }
        foreach(var loadout in new[]{new LastStandLoadout("railgun"),new LastStandLoadout("repair","shield")})
        {
            area=LastStandResearchPresentation.ProjectQuote(snapshot,LastStandResearchTrackId.AreaControl,1,loadout:loadout);
            Need(!area.AppliesToSelectedLoadout&&area.LoadoutApplicability.StartsWith("No matching fitting"),"Unmatched combat research remains dormant");
        }
        area=LastStandResearchPresentation.ProjectQuote(snapshot,LastStandResearchTrackId.AreaControl,1,loadout:new LastStandLoadout("launcher"));
        Need(area.LoadoutApplicability=="Applies to the fitting in bay 1."&&!area.AppliesToSecondaryBay,"Single-bay area quote stays specific");
        engineering=LastStandResearchPresentation.ProjectQuote(snapshot,LastStandResearchTrackId.FieldEngineering,1,loadout:new LastStandLoadout("railgun","shield"));
        Need(engineering.LoadoutApplicability=="Applies to the fitting in bay 2."&&!engineering.AppliesToBaseCannon,"Secondary engineering quote stays specific");
        foreach(var track in new[]{LastStandResearchTrackId.GameSpeed,LastStandResearchTrackId.SalvageRecovery,LastStandResearchTrackId.ResearchSpeed,LastStandResearchTrackId.ScrapLogistics})
        foreach(var loadout in new[]{new LastStandLoadout("repair"),new LastStandLoadout("arc","repair")})
        {
            Need(profile.TryApplyLoadout(loadout),"Global Planner applicability fixture");
            var definition=LastStandResearchCatalog.Get(track);
            var lab=LastStandResearchPresentation.ProjectQuote(profile.ResearchSnapshot,track,1,loadout:profile.SelectedLoadout);
            planner=LastStandProgressionPlanner.Project(profile,profile.ResearchSnapshot,loadout.Primary,"research:"+definition.Key+":1");
            Need(planner.Pinned.Detail.Contains(lab.LoadoutApplicability)&&lab.LoadoutApplicability=="Applies to all loadouts.","Lab and Planner global applicability match with one or two bays");
        }
        var store=Seed(1000,500);state=LastStandResearchState.Create(Epoch);long wallet=100000;
        for(int n=0;n<10;n++){
            state=Apply(state,ref wallet,0,LastStandResearchTrackId.AreaControl);
            long elapsed=state.Snapshot().slots[0].active.durationMilliseconds;
            Need(state.TryAdvance(elapsed,state.Snapshot().lastObservedUtcMilliseconds+elapsed,false,out var completed),"Funded area rank completes");state=completed.State;
        }
        var save=LastStandSaveJson.Read(store.Raw);save["research"]=LastStandSaveJson.Read(LastStandProgression.CombatResearchWrite(state));
        store.Raw=LastStandSaveJson.Write(save);profile=LastStandProgression.Load(store,()=>state.Snapshot().lastObservedUtcMilliseconds);
        Need(profile.SaveState=="ready"&&profile.TryApplyLoadout(new LastStandLoadout("launcher","mortar")),"Area10 quote profile admitted");
        LastStandShopCard launcher=null;
        foreach(var card in LastStandShopPresentation.ProjectPermanent(profile,profile.SelectedLoadout).Cards)if(card.TrackId==LastStandUpgradeTrackId.LauncherAttack)launcher=card;
        Need(launcher.CurrentEffectDescription=="14 damage"&&launcher.NextEffectDescription=="19 damage"&&launcher.ResultEffectDescription=="19 damage","Workshop quote includes completed combat research in current, next and purchased effects");
        planner=LastStandProgressionPlanner.Project(profile,profile.ResearchSnapshot,LastStandFitting.Launcher,"workshop:launcherAttack:1");
        Need(planner.Pinned.Detail.Contains("14 damage -> 19 damage"),"Planner Workshop target shares the same researched effects");
        Need(profile.TryDeploy(),"Deploy researched build for run quote");var shop=profile.Checkpoint.RestoreShop();shop.ObserveAuthoritativeKills(100);
        foreach(var card in LastStandShopPresentation.ProjectRun(shop).Cards)if(card.TrackId==LastStandUpgradeTrackId.LauncherAttack)launcher=card;
        Need(launcher.CurrentEffectDescription=="14 damage"&&launcher.NextEffectDescription=="19 damage"&&launcher.ResultEffectDescription=="19 damage","Run bulk result uses the captured research snapshot");
        var retained=LastStandRunCheckpoint.Start(9,1,"launcher",new int[10],LastStandRunEdition.CombatDepth).RestoreShop();retained.ObserveAuthoritativeKills(100);
        foreach(var card in LastStandShopPresentation.ProjectRun(retained).Cards)if(card.TrackId==LastStandUpgradeTrackId.LauncherAttack)launcher=card;
        Need(launcher.CurrentEffectDescription=="12 damage"&&launcher.ResultEffectDescription=="16 damage","Retained run quote keeps its original unresearched values");
    }
    static void CompletionDuringRun()
    {
        var store=Seed(1000,500);var profile=LastStandProgression.Load(store,()=>Epoch);var time=new TimeSource();
        Need(profile.TryApplyLoadout(new LastStandLoadout("repair","mortar")),"History uses a paired build");
        Need(profile.TryDeploy()&&profile.Checkpoint.CombatResearch.IsEmpty,"Deployment begins with captured zero ranks");
        Need(profile.HistorySnapshot.Current.Fitting=="repair+mortar"&&profile.ResearchContext().Contains(";l:repair+mortar;c:0,0,0"),"New history identifies both bays and captured combat ranks");
        var app=new LastStandResearchCoordinator(profile,time);Need(app.Initialize(),"One research coordinator initializes");
        foreach(var pair in new[]{Tuple.Create(0,LastStandResearchTrackId.ArmorPiercing),Tuple.Create(1,LastStandResearchTrackId.GameSpeed),Tuple.Create(2,LastStandResearchTrackId.SalvageRecovery)})
            Need(app.Submit(LastStandResearchPresentation.Intent(app.Snapshot,pair.Item1,pair.Item2,LastStandResearchAction.Start)),"Shared coordinator funds live research");
        long duration=app.Quote(LastStandResearchTrackId.ArmorPiercing,1).DurationMilliseconds;
        time.Advance(duration);Need(app.Reconcile(),"Research completes during active run");
        Need(profile.ResearchRank(LastStandResearchTrackId.ArmorPiercing)==1&&profile.MaximumGameSpeed==1.5&&profile.ResearchRank(LastStandResearchTrackId.SalvageRecovery)==1,"New ranks complete and old live benefits remain available");
        Need(profile.Checkpoint.CombatResearch.IsEmpty&&profile.Checkpoint.RestoreModel().CombatResearch.IsEmpty&&profile.Checkpoint.RestoreShop().CombatResearch.IsEmpty,"Running checkpoint/model/shop never adopt newly completed combat ranks");
        Need(profile.ResearchContext().StartsWith("research-v2:1,1,0,0;")&&profile.ResearchContext().Contains(";c:0,0,0"),"Live original research updates history without relabeling captured combat ranks");
        profile=LastStandProgression.Load(store,()=>time.UtcMilliseconds);
        Need(profile.SaveState=="ready"&&profile.Checkpoint.CombatResearch.IsEmpty&&profile.ResearchRank(LastStandResearchTrackId.ArmorPiercing)==1,"Save roundtrip preserves snapshot boundary");
        Need(!profile.ResearchSnapshotIsFunded(new LastStandCombatResearchSnapshot(2,0,0)),"Future captured rank must be funded");
        var checkpointShop=profile.Checkpoint.Shop;
        var wrongBuild=new LastStandShopState(checkpointShop.RunId,LastStandFitting.Repair,checkpointShop.PermanentLevels,
            checkpointShop.EconomyVersion,profile.Checkpoint.Edition,profile.Checkpoint.Tier,new LastStandLoadout("repair","launcher"),checkpointShop.CombatResearch);
        Need(!profile.TryFinalizeRun(null,"abandon",wrongBuild),"Terminal shop cannot replace the captured secondary fitting");
        Need(profile.TryFinalizeRun(null,"abandon")&&profile.TryDeploy(),"Next deployment admitted");
        Need(profile.Checkpoint.CombatResearch.ArmorPiercing==1&&profile.Checkpoint.RestoreModel().CombatResearch.ArmorPiercing==1,"New deployment captures completed combat rank");
        Need(profile.HistorySnapshot.Current.StartContext.Contains(";c:1,0,0"),"Next deployment history records the newly captured rank");
        var state=LastStandProgression.CombatResearchRead(LastStandSaveJson.Write(LastStandSaveJson.Object(LastStandSaveJson.Read(store.Raw)["research"])));
        foreach(var edition in new[]{LastStandRunEdition.Legacy(LastStandUpgradeCatalog.LegacyEconomyVersion),
            LastStandRunEdition.Legacy(LastStandUpgradeCatalog.PreviousEconomyVersion),LastStandRunEdition.Legacy(LastStandUpgradeCatalog.RetainedEconomyVersion),LastStandRunEdition.CombatDepth})
        {
            var checkpoint=LastStandRunCheckpoint.Start(7,1,"repair",new int[LastStandUpgradeCatalog.ForEconomy(edition.EconomyVersion).Tracks.Count],edition);
            string expected="research-v1:1,1,0,0;p:"+string.Join(",",checkpoint.Shop.PermanentLevels)+";r:"+string.Join(",",checkpoint.Shop.RunPurchases);
            Need(LastStandProgression.CombatResearchContext(state,checkpoint.Shop)==expected,"Each retained edition keeps its opaque four-track context despite new funded ranks");
        }
        var rollback=new LastStandResearchCoordinator(profile,new TimeSource {UtcMilliseconds=time.UtcMilliseconds-60000});
        Need(rollback.Initialize()&&profile.ResearchRank(LastStandResearchTrackId.ArmorPiercing)==1,"Clock rollback cannot remove or duplicate ranks");
    }
    static int Main(string[] args)
    {
        try{switch(args[0]){case "entitlements":EntitlementsAndQueues();break;case "migration":LegacyMigration();break;
            case "quotes":Quotes();break;case "deployment":CompletionDuringRun();break;default:throw new Exception("Unknown case");}
            Console.WriteLine("PASS "+args[0]);return 0;}
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
