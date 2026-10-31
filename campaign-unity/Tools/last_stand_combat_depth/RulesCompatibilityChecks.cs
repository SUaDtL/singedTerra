using System;
using System.Collections.Generic;
using System.IO;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        public static string RulesResearchJson(LastStandResearchState state)=>LastStandSaveJson.Write(ResearchJson(state));
        public static object RulesHistoryJson(LastStandRunHistory history)=>HistoryJson(history);
        public static object RulesCheckpointJson(LastStandRunCheckpoint checkpoint)=>CheckpointJson(checkpoint);
    }
}
static class RulesCompatibilityChecks
{
    const long Epoch=1790000000000L;
    sealed class Store : ILastStandStorage,ILastStandStorageOwnership
    {
        public string Raw,Fault;public int Writes;public bool Owner=true;bool pendingReadback,returnWrong;
        public bool CanWrite=>Owner;
        public string Read(){if(Fault=="read"||pendingReadback){pendingReadback=false;throw new Exception("read fault");}
            if(returnWrong){returnWrong=false;return Fault=="null-readback"?null:Raw+" ";}
            if(Fault=="lose-owner")Owner=false;return Raw;}
        public void Write(string raw){if(Fault=="before")throw new Exception("write fault");Raw=raw;Writes++;
            pendingReadback=Fault=="readback";returnWrong=Fault=="wrong-readback"||Fault=="null-readback";
            if(Fault=="after")throw new Exception("unconfirmed write");}
    }
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static LastStandProgression Load(Store store)=>LastStandProgression.Load(store,()=>Epoch);
    static bool Ready(LastStandProgression p)=>p.SaveState=="ready";
    static Dictionary<string,object> Obj(object value)=>LastStandSaveJson.Object(value);
    static string Part(string raw,string key)=>LastStandSaveJson.Write(LastStandSaveJson.Read(raw)[key]);
    static void V6(Store store)=>Check(LastStandSaveJson.Integer(LastStandSaveJson.Read(store.Raw)["version"])==6,"Expected atomic v6 envelope");
    static void Legacy(string v5,string v4,string snapshot)
    {
        foreach(string raw in new[]{File.ReadAllText(v4),File.ReadAllText(v5)}){
            var store=new Store{Raw=raw};var p=Load(store);Check(Ready(p),"Supported original profile");V6(store);
            if(raw==File.ReadAllText(v5))Check(Part(raw,"research")==Part(store.Raw,"research"),"Research preserved");
            var cp=p.Checkpoint;Check(cp.RulesVersion=="last-stand-waves-v1","Original combat edition");
            var model=cp.RestoreModel();var shop=cp.RestoreShop();
            if(raw==File.ReadAllText(v4))Check(model.Snapshot()==File.ReadAllText(snapshot),"Independent v4 snapshot");
            var encoded=Obj(LastStandSaveJson.Read(store.Raw)["checkpoint"]);
            Check(encoded.ContainsKey("contentVersion")&&(string)encoded["contentVersion"]=="last-stand-content-v1","Original content edition persisted");
            string before=model.Snapshot();var again=Load(store);Check(again.Checkpoint.RestoreModel().Snapshot()==before,"Reload unchanged");
            int best=model.CompletedWave;model.ContinueAfterCheckpoint();int remaining=100000;
            while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&remaining-->0){model.Step();shop.ObserveAuthoritativeKills(model.Kills,model.Wave,0);}
            Check(model.AwaitingWaveCommit&&model.CompletedWave==best+1&&p.TryCommitWave(model,shop),"Retained wave commits with retained rules");
            Check(p.TryFinalizeRun(null,"abandon")&&p.TryDeploy(),"Next run deploys");
            Check(p.Checkpoint.RulesVersion!="last-stand-waves-v1","Only next deployment selects new combat edition");
        }
        Check((int)LastStandFitting.Launcher==0&&(int)LastStandFitting.Repair==1&&(int)LastStandFitting.Scattergun==2,"Fitting identities retained");
        var v3=LastStandUpgradeCatalog.ForEconomy("research-farming-economy-v3");
        Check(v3.Tracks.Count==8&&v3.Get(LastStandUpgradeTrackId.CannonAttack).RunPrice(30)==216,"Frozen v3 price");
        Check(LastStandUpgradeCatalog.ForEconomy("research-farming-economy-v2").Get(LastStandUpgradeTrackId.CannonAttack).RunPrice(30)==153,"Frozen v2 price");
    }
    static string RichV5(string path)
    {
        var data=LastStandSaveJson.Read(File.ReadAllText(path));var tiers=Obj(data["tierRecords"]);
        Obj(tiers["tier-1"])["bestWave"]=500;Obj(tiers["tier-2"])["bestWave"]=300;Obj(tiers["tier-2"])["unlocked"]=true;
        var claims=new List<object>();foreach(int tier in new[]{1,2})foreach(int wave in new[]{10,25,50,100,200,300,500})
            if(wave<=(tier==1?500:300))claims.Add("tier-"+tier+":wave-"+wave);
        claims.Sort((a,b)=>StringComparer.Ordinal.Compare((string)a,(string)b));
        data["firstClears"]=claims;data["unlockedFittings"]=new List<object>{"launcher","repair","scattergun"};
        var r=LastStandResearchState.Create(Epoch);long wallet=1000;
        Action<LastStandResearchAction,int,LastStandResearchTrackId,int> apply=(action,slot,track,rank)=>{
            var s=r.Snapshot();LastStandResearchTransition next;
            Check(r.TryApply(new LastStandResearchIntent{Action=action,Slot=slot,Track=track,Rank=rank,ExpectedRevision=r.Revision,
                ExpectedActiveIdentity=s.slots[slot].active?.identity??0,ExpectedQueuedIdentity=s.slots[slot].queued?.identity??0},wallet,500,out next),"Research fixture");
            wallet+=next.WalletDelta;r=next.State;};
        apply(LastStandResearchAction.Start,0,LastStandResearchTrackId.SalvageRecovery,1);
        LastStandResearchTransition completed;Check(r.TryAdvance(LastStandResearchCatalog.Get(LastStandResearchTrackId.SalvageRecovery).BaseDurationMilliseconds(1),Epoch+600000,false,out completed),"Research completed fixture");r=completed.State;
        apply(LastStandResearchAction.Start,0,LastStandResearchTrackId.SalvageRecovery,2);
        LastStandResearchTransition advance;Check(r.TryAdvance(12345,Epoch+12345,false,out advance),"Research fixture elapsed");r=advance.State;
        apply(LastStandResearchAction.Switch,0,LastStandResearchTrackId.GameSpeed,1);apply(LastStandResearchAction.Queue,0,LastStandResearchTrackId.GameSpeed,2);
        apply(LastStandResearchAction.Start,1,LastStandResearchTrackId.ResearchSpeed,1);
        data["research"]=LastStandSaveJson.Read(LastStandProgression.RulesResearchJson(r));data["recoveryRemainder"]=37;
        var history=new LastStandRunHistory();history.Begin(1,1,"launcher",LastStandUpgradeCatalog.RetainedEconomyVersion,"paid legacy context");
        history.AddActiveTime(300123,1);history.AddPausedTime(456);history.AddClosedTime(789);
        history.BankWave(1,3,2,1,"finished context");history.Finish("defeat","finished context");
        history.Begin(2,1,"launcher",LastStandUpgradeCatalog.RetainedEconomyVersion,"active context",false,30);
        history.AddActiveTime(92345,2);history.AddPausedTime(33);history.AddClosedTime(44);
        data["history"]=LastStandProgression.RulesHistoryJson(history);data["lastFinalizedRunId"]=1;data["nextRunId"]=3;
        Obj(data["checkpoint"])["runId"]=2;Obj(Obj(data["checkpoint"])["shop"])["runId"]=2;
        return LastStandSaveJson.Write(data);
    }
    static void Migration(string path,bool arms=true,bool tiers=true)
    {
        string original=RichV5(path);
        foreach(string fault in new[]{"before","after","readback","wrong-readback","null-readback",null}){
            var store=new Store{Raw=original,Fault=fault};var p=Load(store);
            if(fault!=null){Check(!Ready(p)&&!p.TryDeploy()&&!p.TryPurchase(),"Migration not optimistic");if(fault=="before")Check(store.Raw==original,"Original bytes survive failed write");
                store.Fault=null;Check(p.Retry(),"Migration retry");}
            V6(store);Check(Ready(p)&&p.Wallet==LastStandSaveJson.Integer(LastStandSaveJson.Read(original)["credits"]),"No retroactive currency");
            foreach(string key in new[]{"research","history","recoveryRemainder","firstClears","selectedTier","selectedFitting"})
                Check(Part(original,key)==Part(store.Raw,key),"Preserved "+key);
            Check(p.IsFittingUnlocked("mortar")==arms&&p.IsFittingUnlocked("railgun")==arms&&p.IsTierUnlocked(3)==tiers,"Only available authored content earns backfill");
            Check(!p.TrySelectFitting("mortar")&&!p.TrySelectTier(3),"No active-run fitting or tier replacement");
            var levels=Obj(LastStandSaveJson.Read(store.Raw)["permanentLevels"]);Check(levels.Count==10&&LastStandSaveJson.Integer(levels["mortarAttack"])==0&&LastStandSaveJson.Integer(levels["railgunAttack"])==0,"New tracks neutral");
            int writes=store.Writes;string stable=store.Raw;Check(Ready(Load(store))&&store.Raw==stable&&store.Writes==writes,"Migration exactly once");
        }
        var denied=new Store{Raw=original,Owner=false};Check(!Ready(Load(denied))&&denied.Raw==original&&denied.Writes==0,"No ownership no migration");
        var conflict=new Store{Raw=original,Fault="before"};var waiting=Load(conflict);conflict.Fault=null;conflict.Raw=original+" ";
        Check(!waiting.Retry()&&conflict.Raw==original+" ","Stale migration cannot overwrite winner");
        foreach(string fault in new[]{"read","lose-owner"}){
            var unavailable=new Store{Raw=original,Fault=fault};var blocked=Load(unavailable);
            Check(!Ready(blocked)&&unavailable.Raw==original&&unavailable.Writes==0,"Read/owner loss cannot migrate");
            unavailable.Fault=null;unavailable.Owner=true;Check(blocked.Retry(),"Ownership/read recovery");V6(unavailable);
        }
        var uncertain=new Store{Raw=original,Fault="after"};var oldOwner=Load(uncertain);
        uncertain.Fault=null;uncertain.Raw+=" ";string winner=uncertain.Raw;int committedWrites=uncertain.Writes;
        Check(!oldOwner.Retry()&&uncertain.Raw==winner&&uncertain.Writes==committedWrites,"Unconfirmed writer cannot overwrite a new owner");
        var capped=LastStandSaveJson.Read(original);capped["revision"]=9007199254740990L;
        var full=new Store{Raw=LastStandSaveJson.Write(capped)};string capBytes=full.Raw;
        Check(!Ready(Load(full))&&full.Raw==capBytes&&full.Writes==0,"Migration revision cap preserves bytes");
        BackfillBoundaries(path,arms,tiers);
    }
    static void BackfillBoundaries(string path,bool arms,bool tiersAvailable)
    {
        foreach(int tier1 in new[]{499,500,501})foreach(int tier2 in new[]{99,100,101,299,300,301}){
            var root=LastStandSaveJson.Read(RichV5(path));var tiers=Obj(root["tierRecords"]);
            Obj(tiers["tier-1"])["bestWave"]=tier1;Obj(tiers["tier-2"])["bestWave"]=tier2;
            var claims=new List<object>();foreach(int tier in new[]{1,2})foreach(int wave in new[]{10,25,50,100,200,300,500})
                if(wave<=(tier==1?tier1:tier2))claims.Add("tier-"+tier+":wave-"+wave);
            claims.Sort((a,b)=>StringComparer.Ordinal.Compare((string)a,(string)b));root["firstClears"]=claims;
            root["checkpoint"]=null;Obj(root["history"])["current"]=null;root["nextRunId"]=2;
            var store=new Store{Raw=LastStandSaveJson.Write(root)};string original=store.Raw;var p=Load(store);
            Check(Ready(p)&&p.IsFittingUnlocked("mortar")== (arms&&tier1>=500)&&p.IsFittingUnlocked("railgun")== (arms&&tier2>=100)&&p.IsTierUnlocked(3)==(tiersAvailable&&tier2>=300),"Best-wave exact unlock boundaries and authored availability");
            foreach(string key in new[]{"credits","research","history","firstClears","recoveryRemainder","selectedTier","selectedFitting"})Check(Part(original,key)==Part(store.Raw,key),"Backfill changes flags only "+key);
            int writes=store.Writes;Check(Ready(Load(store))&&Ready(Load(store))&&store.Writes==writes,"Backfill does not repeat");
        }
    }
    static void Future(string path)
    {
        var store=new Store{Raw=File.ReadAllText(path)};Check(Ready(Load(store)),"Known input");V6(store);
        foreach(string field in new[]{"version","rulesVersion","contentVersion","economyVersion"}){
            var root=LastStandSaveJson.Read(store.Raw);if(field=="version")root[field]=7;
            else {var cp=Obj(root["checkpoint"]);if(field=="contentVersion")cp[field]="future-content";
                else Obj(cp[field=="rulesVersion"?"encounter":"shop"])[field]="future-rules";}
            var bad=new Store{Raw=LastStandSaveJson.Write(root)};string bytes=bad.Raw;
            Check(!Ready(Load(bad))&&bad.Raw==bytes&&bad.Writes==0,"Unknown version preserves bytes "+field);
        }
        foreach(string rules in new[]{LastStandRunEdition.LegacyRulesVersion,LastStandRunEdition.CurrentRulesVersion})
        foreach(string content in new[]{LastStandRunEdition.LegacyContentVersion,LastStandRunEdition.CurrentContentVersion})
        foreach(string economy in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.RetainedEconomyVersion,LastStandUpgradeCatalog.EconomyVersion}){
            bool valid=rules==LastStandRunEdition.LegacyRulesVersion&&content==LastStandRunEdition.LegacyContentVersion&&economy!=LastStandUpgradeCatalog.EconomyVersion ||
                rules==LastStandRunEdition.CurrentRulesVersion&&content==LastStandRunEdition.CurrentContentVersion&&economy==LastStandUpgradeCatalog.EconomyVersion;
            if(valid)continue;
            var root=LastStandSaveJson.Read(store.Raw);var cp=Obj(root["checkpoint"]);cp["contentVersion"]=content;
            Obj(cp["encounter"])["rulesVersion"]=rules;Obj(cp["shop"])["economyVersion"]=economy;Refused(root,"Mixed edition");
        }
        foreach(string mutation in new[]{"omit","null","new-tier","new-fitting","new-track"}){
            var root=LastStandSaveJson.Read(store.Raw);var cp=Obj(root["checkpoint"]);
            if(mutation=="omit")cp.Remove("contentVersion");else if(mutation=="null")cp["contentVersion"]=null;
            else if(mutation=="new-tier")Obj(cp["encounter"])["tier"]=3;
            else if(mutation=="new-fitting"){Obj(cp["encounter"])["fitting"]=3;Obj(cp["shop"])["fitting"]=3;}
            else Obj(Obj(cp["shop"])["runPurchases"])["mortarAttack"]=1;
            Refused(root,mutation);
        }
    }
    static void Refused(Dictionary<string,object> root,string label)
    {var bad=new Store{Raw=LastStandSaveJson.Write(root)};string bytes=bad.Raw;Check(!Ready(Load(bad))&&bad.Raw==bytes&&bad.Writes==0,"Invalid bytes preserved: "+label);}
    static void Paid(string path)
    {
        var sameRulesModel=EncounterModel.CreatePlayable(LastStandFitting.Repair,1,new LastStandShopState(1,LastStandFitting.Repair,new int[8],LastStandUpgradeCatalog.PreviousEconomyVersion));
        bool refused=false;try{sameRulesModel.ApplyShopProjection(new LastStandShopState(1,LastStandFitting.Repair,new int[8],LastStandUpgradeCatalog.RetainedEconomyVersion));}catch(ArgumentException){refused=true;}
        Check(refused,"A valid but different legacy economy cannot project onto the model");
        foreach(string economy in new[]{LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.RetainedEconomyVersion}){
            var edition=LastStandRunEdition.Legacy(economy);var levels=new int[8];levels[0]=1000;levels[2]=500;levels[3]=100;levels[5]=10;levels[7]=1;
            var start=LastStandRunCheckpoint.Start(1,1,"launcher",levels,edition);var model=start.RestoreModel();var shop=start.RestoreShop();
            int expected=economy==LastStandUpgradeCatalog.PreviousEconomyVersion?158:227;
            for(int wave=1;wave<=300;wave++){
                int limit=20000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&limit-->0){model.Step();shop.ObserveAuthoritativeKills(model.Kills,model.Wave,1);}
                Check(model.AwaitingWaveCommit,"Paid legacy cohort survived");
                if(shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases<30){
                    shop.TryPurchase(new LastStandShopPurchaseIntent(1,shop.Version,LastStandUpgradeTrackId.CannonAttack));model.ApplyShopProjection(shop);}
                if(shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases==30&&shop.Scrap>=expected)break;
                model.ContinueAfterCheckpoint();
            }
            Check(shop.IncomeRemainder>0&&shop.SpentScrap>0,"Fractional paid legacy fixture");
            var cp=new LastStandRunCheckpoint(1,model.CaptureCheckpoint(),shop.CaptureCheckpoint());
            var root=LastStandSaveJson.Read(File.ReadAllText(path));var savedCp=Obj(LastStandProgression.RulesCheckpointJson(cp));savedCp.Remove("contentVersion");root["checkpoint"]=savedCp;
            Obj(Obj(root["tierRecords"])["tier-1"])["bestWave"]=model.CompletedWave;
            var claims=new List<object>();foreach(int wave in new[]{10,25,50,100,200,300,500})if(wave<=model.CompletedWave)claims.Add("tier-1:wave-"+wave);
            root["firstClears"]=claims;root["unlockedFittings"]=model.CompletedWave>=100?new List<object>{"launcher","repair","scattergun"}:new List<object>{"launcher","repair"};
            var permanent=Obj(root["permanentLevels"]);foreach(var track in shop.Definitions)permanent[track.Key]=levels[(int)track.Id];
            Obj(Obj(root["history"])["current"])["economyVersion"]=economy;
            Obj(Obj(root["history"])["current"])["highestClearedWave"]=model.CompletedWave;
            var store=new Store{Raw=LastStandSaveJson.Write(root)};var profile=Load(store);Check(Ready(profile),"Paid legacy migration");
            var restored=profile.Checkpoint.RestoreShop();var retained=restored.CaptureCheckpoint();
            Check(profile.Checkpoint.RestoreModel().Snapshot()==model.Snapshot()&&retained.EconomyVersion==economy&&retained.RunPurchases.Count==8&&
                retained.IncomeRemainder==shop.IncomeRemainder&&retained.EarnedScrap==shop.EarnedScrap&&retained.SpentScrap==shop.SpentScrap&&retained.Scrap==shop.Scrap,"Paid and fractional ledger retained");
            int oldSpent=restored.SpentScrap,oldWallet=restored.Scrap;var next=restored.TryPurchase(new LastStandShopPurchaseIntent(1,restored.Version,LastStandUpgradeTrackId.CannonAttack));
            Check(next.Accepted&&next.ChargedScrap==expected&&restored.SpentScrap==oldSpent+expected&&restored.Scrap==oldWallet-expected&&restored.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases==31,"Retained next paid index and exact conservation");
        }
    }
    static void Reserved()
    {
        var p=Load(new Store());Check(p.TryDeploy(),"Current deploy");var shop=p.Checkpoint.RestoreShop();
        foreach(var id in new[]{LastStandUpgradeTrackId.MortarAttack,LastStandUpgradeTrackId.RailgunAttack}){
            var projection=shop.GetTrack(id);Check(!projection.CanPurchase&&!projection.NextPrice.HasValue&&projection.CurrentLevel==0,"Reserved neutral projection");
            Check(!shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,id)).Accepted,"Unavailable purchase rejected");
        }
        foreach(var view in new[]{LastStandShopPresentation.ProjectRun(shop),LastStandShopPresentation.ProjectPermanent(p,LastStandFitting.Repair)}){
            Check(view.Cards.Count==8,"Unimplemented tracks are not exposed");
            foreach(var card in view.Cards)Check((int)card.TrackId<8,"Only implemented card identities");
        }
        Check(LastStandTierCatalog.Visible(LastStandTierCatalog.All,_=>true).Count==2,"Unavailable tiers cannot appear");
        Check(p.TryFinalizeRun(null,"abandon")&&!p.TrySelectFitting("mortar")&&!p.TrySelectTier(3),"Unavailable garage admission");
    }
    static void FailedMigrationProjection(string v5,string v4)
    {
        foreach(string input in new[]{File.ReadAllText(v4),File.ReadAllText(v5)})foreach(bool owner in new[]{true,false}){
            var store=new Store{Raw=input,Fault="before",Owner=owner};var p=Load(store);
            Check(!Ready(p)&&store.Raw==input&&store.Writes==0,"Failed migration preserves old record");
            foreach(var definition in LastStandUpgradeCatalog.Tracks)
                Check(p.GetPermanentLevel(definition.Id)>=0,"Unavailable neutral read projection");
            var view=LastStandShopPresentation.ProjectPermanent(p,LastStandFitting.Repair);
            Check(view.Cards.Count==10,"Failed migration shop exposes available definitions with neutral absent old slots");
            foreach(var card in view.Cards)if((int)card.TrackId>=8)Check(card.PermanentLevel==0,"Failed migration cannot grant new ranks");
            foreach(var card in view.Cards)Check(!card.CanPurchase,"Failed migration has no purchase admission");
            Check(store.Raw==input&&store.Writes==0,"Read projection cannot migrate");
            store.Fault=null;store.Owner=true;Check(p.Retry(),"Original migration retries");V6(store);
        }
    }
    static void CommitEdition(string path)
    {
        var store=new Store{Raw=File.ReadAllText(path)};var p=Load(store);var cp=p.Checkpoint;
        var model=EncounterModel.RestoreCheckpoint(EncounterProfile.ForTier(cp.Tier,LastStandRunEdition.Legacy(LastStandUpgradeCatalog.PreviousEconomyVersion)),
            LastStandFittingCatalog.Parse(cp.FittingId),cp.Encounter);
        var shop=cp.RestoreShop();model.ContinueAfterCheckpoint();
        int limit=30000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&limit-->0){model.Step();shop.ObserveAuthoritativeKills(model.Kills,model.Wave,0);}
        Check(model.AwaitingWaveCommit,"Valid mismatched model reached real boundary");
        string original=store.Raw;int writes=store.Writes,wallet=p.Wallet;
        Check(!p.TryCommitWave(model,shop)&&store.Raw==original&&store.Writes==writes&&p.Wallet==wallet,"Commit refuses different valid model economy without changes");
        var correct=cp.RestoreModel();correct.ContinueAfterCheckpoint();limit=30000;
        while(!correct.AwaitingWaveCommit&&correct.Status==EncounterStatus.Running&&limit-->0)correct.Step();
        Check(correct.AwaitingWaveCommit&&p.TryCommitWave(correct,shop)&&store.Writes==writes+1,"Matching retained edition commits exactly once");
    }
    static int Main(string[] args){try{switch(args[0]){case "legacy":Legacy(args[1],args[2],args[3]);break;
        case "migration":Migration(args[1]);break;case "migration-enabled":Migration(args[1],true,true);break;case "migration-disabled":Migration(args[1],false,false);break;case "future":Future(args[1]);break;case "reserved":Reserved();break;case "paid":Paid(args[1]);break;case "blocked-view":FailedMigrationProjection(args[1],args[2]);break;case "commit-edition":CommitEdition(args[1]);break;default:throw new Exception("Unknown case");}
        Console.WriteLine("PASS "+args[0]);return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
