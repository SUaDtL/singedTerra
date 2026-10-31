using System;
using System.Collections.Generic;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

static class ArmamentTransactionChecks
{
    static readonly string[] WeaponFields={"mortarShots","railgunShots","nextMortarTick","nextRailgunTick","mortarDamage","railgunDamage"};
    static readonly LastStandFitting[] Fittings={LastStandFitting.Mortar,LastStandFitting.Railgun};
    sealed class Store:ILastStandStorage,ILastStandStorageOwnership
    {
        public string Raw,Fault;public int Writes;public bool Owner=true;bool readback;
        public bool CanWrite=>Owner;
        public string Read(){if(readback){readback=false;if(Fault=="readback")throw new Exception("readback denied");if(Fault=="mismatch")return Raw+" ";}return Raw;}
        public void Write(string value){if(Fault=="before")throw new Exception("write denied");Raw=value;Writes++;readback=Fault=="readback"||Fault=="mismatch";if(Fault=="after")throw new Exception("unconfirmed write");}
    }
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static void Reject(Action action,string message){bool refused=false;try{action();}catch(ArgumentException){refused=true;}Check(refused,message);}
    static Dictionary<string,object> Obj(object value)=>LastStandSaveJson.Object(value);
    static LastStandProgression Load(Store s)=>LastStandProgression.Load(s,()=>1790000000000L);
    static LastStandUpgradeTrackId Track(LastStandFitting fitting)=>fitting==LastStandFitting.Mortar?LastStandUpgradeTrackId.MortarAttack:LastStandUpgradeTrackId.RailgunAttack;
    static Store Profile(bool unlocked=true,int wallet=100000)
    {
        var s=new Store();Check(Load(s).SaveState=="ready","Fresh isolated profile");var data=LastStandSaveJson.Read(s.Raw);data["credits"]=wallet;
        var levels=Obj(data["permanentLevels"]);levels["hullCapacity"]=500;levels["armor"]=100;
        if(unlocked){
            var tiers=Obj(data["tierRecords"]);Obj(tiers["tier-1"])["bestWave"]=500;Obj(tiers["tier-2"])["bestWave"]=100;Obj(tiers["tier-2"])["unlocked"]=true;
            var claims=new List<object>();foreach(int tier in new[]{1,2})foreach(int wave in new[]{10,25,50,100,200,300,500})
                if(wave<=(tier==1?500:100))claims.Add("tier-"+tier+":wave-"+wave);
            claims.Sort((a,b)=>StringComparer.Ordinal.Compare((string)a,(string)b));data["firstClears"]=claims;
            data["unlockedFittings"]=new List<object>{"launcher","repair","scattergun"};
        }
        s.Raw=LastStandSaveJson.Write(data);Check(Load(s).SaveState=="ready","Authored progress fixture backfills only earned unlocks");return s;
    }
    static int SumPermanent(LastStandUpgradeDefinition definition,int from,int count)
    {int total=0;for(int n=from+1;n<=from+count;n++)total=checked(total+definition.PermanentPrice(n));return total;}
    static void Locked()
    {
        foreach(var fitting in Fittings){
            var track=Track(fitting);var locked=Profile(false);var p=Load(locked);string raw=locked.Raw;int writes=locked.Writes;
            Check(!p.IsFittingUnlocked(LastStandFittingCatalog.Id(fitting))&&!p.TrySelectFitting(LastStandFittingCatalog.Id(fitting)),"Locked fitting cannot be selected");
            Check(!p.TryPurchasePermanent(track,LastStandBulkQuantity.One,p.Revision)&&locked.Raw==raw&&locked.Writes==writes&&p.GetPermanentLevel(track)==0,
                "Locked new fitting cannot charge a permanent upgrade");
            var unlocked=Profile();p=Load(unlocked);raw=unlocked.Raw;writes=unlocked.Writes;
            Check(p.IsFittingUnlocked(LastStandFittingCatalog.Id(fitting))&&p.SelectedFitting=="repair","Unlocked but inapplicable fixture");
            Check(!p.TryPurchasePermanent(track,LastStandBulkQuantity.One,p.Revision)&&unlocked.Raw==raw&&unlocked.Writes==writes,
                "Inapplicable new permanent track cannot charge");
            Check(p.TrySelectFitting(LastStandFittingCatalog.Id(fitting))&&p.TryPurchasePermanent(track,LastStandBulkQuantity.One,p.Revision),"Matching unlocked fitting can buy");
            Check(p.TryDeploy()&&!p.TrySelectFitting("repair"),"Active fitting cannot be replaced");
        }
        var old=Profile(false);var prior=Load(old);Check(prior.SelectedFitting=="repair"&&prior.TryPurchase(LastStandUpgradeTrackId.LauncherAttack),
            "Existing dormant permanent upgrade behavior stays unchanged");
    }
    static void Permanent()
    {
        foreach(var fitting in Fittings)foreach(string fault in new[]{"before","after","readback","mismatch","ownership"}){
            var store=Profile();var p=Load(store);string id=LastStandFittingCatalog.Id(fitting);var track=Track(fitting);
            Check(p.TrySelectFitting(id),"Earned fitting selected");var definition=LastStandUpgradeCatalog.Get(track);
            var quote=p.QuotePermanent(track,LastStandBulkQuantity.Ten);int cost=SumPermanent(definition,0,10);
            Check(cost==(fitting==LastStandFitting.Mortar?40:50)&&quote.Quantity==10&&quote.Cost==cost&&quote.ResultLevel==10,"Exact independently priced ten-rank permanent quote");
            int wallet=p.Wallet,writes=store.Writes;long revision=p.Revision;string before=store.Raw;
            store.Fault=fault;store.Owner=fault!="ownership";
            Check(!p.TryPurchasePermanent(track,LastStandBulkQuantity.Ten,revision)&&p.GetPermanentLevel(track)==0&&p.Wallet==wallet,
                "Failed purchase cannot optimistically charge or upgrade: "+fault);
            if(fault=="before"||fault=="ownership")Check(store.Raw==before&&store.Writes==writes,"Failure before write preserves original bytes");
            store.Fault=null;store.Owner=true;Check(p.Retry(),"Purchase ownership/readback retry");
            if(fault=="ownership")Check(p.TryPurchasePermanent(track,LastStandBulkQuantity.Ten,revision),"Recovered owner admits still-current intent");
            Check(p.GetPermanentLevel(track)==10&&p.Wallet==wallet-cost&&store.Writes==writes+1,"Exactly one charge and ten actual levels");
            Check(!p.TryPurchasePermanent(track,LastStandBulkQuantity.Ten,revision)&&p.Retry()&&store.Writes==writes+1,"Stale intent and repeated retry cannot double spend");
            p=Load(store);Check(p.GetPermanentLevel(track)==10&&p.Wallet==wallet-cost,"Paid permanent state survives close/reopen");
            Check(p.TryDeploy(),"New paid weapon deploys");var model=p.Checkpoint.RestoreModel();int damage=fitting==LastStandFitting.Mortar?model.CurrentMortarDamage:model.CurrentRailgunDamage;
            Check(damage==definition.EffectAt(10,1),"Matching paid effect is applied to actual new weapon");
        }
        foreach(var fitting in Fittings){
            var store=Profile(true,0);var p=Load(store);p.TrySelectFitting(LastStandFittingCatalog.Id(fitting));string raw=store.Raw;
            Check(!p.TryPurchasePermanent(Track(fitting),LastStandBulkQuantity.One,p.Revision)&&store.Raw==raw,"Insufficient Salvage is a byte-identical refusal");
            var data=LastStandSaveJson.Read(store.Raw);data["credits"]=int.MaxValue;Obj(data["permanentLevels"])[LastStandUpgradeCatalog.Get(Track(fitting)).Key]=LastStandUpgradeCatalog.PermanentCap;
            store.Raw=LastStandSaveJson.Write(data);p=Load(store);raw=store.Raw;
            Check(!p.TryPurchasePermanent(Track(fitting),LastStandBulkQuantity.One,p.Revision)&&store.Raw==raw,"At-cap new permanent track cannot charge");
        }
    }
    static void Clear(EncounterModel model,LastStandShopState shop)
    {
        int budget=30000;
        while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0){model.Step();shop.ObserveAuthoritativeKills(model,1);}
        Check(budget>0&&model.AwaitingWaveCommit&&model.Hull>0,"Actual armament wave clears alive");
    }
    static LastStandShopState NewShop(LastStandFitting fitting,int permanent=0)
    {
        var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[2]=500;levels[3]=100;levels[7]=1;levels[(int)Track(fitting)]=permanent;
        return new LastStandShopState(1,fitting,levels);
    }
    static void Run()
    {
        foreach(var fitting in Fittings){
            var shop=NewShop(fitting);var id=Track(fitting);var other=Track(fitting==LastStandFitting.Mortar?LastStandFitting.Railgun:LastStandFitting.Mortar);
            var empty=shop.TryPurchase(new LastStandShopPurchaseIntent(1,shop.Version,id));Check(empty.Refusal==LastStandShopPurchaseRefusal.InsufficientScrap&&shop.Scrap==0,"No starting Scrap purchase");
            var model=EncounterModel.CreatePlayable(fitting,1,shop);
            while(shop.Scrap<400){Clear(model,shop);model.ContinueAfterCheckpoint();}
            var definition=shop.GetDefinition(id);int oldVersion=shop.Version,oldScrap=shop.Scrap;
            var quote=definition.QuoteRun(0,0,oldScrap,LastStandBulkQuantity.Ten);int cost=0;for(int n=1;n<=10;n++)cost+=definition.RunPrice(n);
            Check(cost==(fitting==LastStandFitting.Mortar?220:330)&&quote.Quantity==10&&quote.Cost==cost,"Exact independently priced new-weapon run quote");
            var intent=new LastStandShopPurchaseIntent(1,oldVersion,id,LastStandBulkQuantity.Ten);var bought=shop.TryPurchase(intent);
            Check(bought.Accepted&&bought.PurchasedQuantity==10&&bought.ChargedScrap==cost&&shop.Scrap==oldScrap-cost&&shop.SpentScrap==cost,
                "Bulk debit and new weapon ranks are one exact transaction");
            Check(shop.TryPurchase(intent).Refusal==LastStandShopPurchaseRefusal.StaleVersion&&shop.Scrap==oldScrap-cost,"Duplicate quote cannot spend twice");
            Check(shop.TryPurchase(new LastStandShopPurchaseIntent(1,shop.Version,other)).Refusal==LastStandShopPurchaseRefusal.WrongFitting,"Other auxiliary track cannot charge");
            Check(shop.TryPurchase(new LastStandShopPurchaseIntent(2,shop.Version,id)).Refusal==LastStandShopPurchaseRefusal.WrongRun,"Other run intent cannot charge");
            model.ApplyShopProjection(shop);int effect=fitting==LastStandFitting.Mortar?model.CurrentMortarDamage:model.CurrentRailgunDamage;
            Check(effect==definition.EffectAt(10,1),"Actual model receives bought armament effect");
            Check(definition.QuoteRun(definition.PermanentCap,definition.TotalCap-definition.PermanentCap,int.MaxValue,LastStandBulkQuantity.Max).Quantity==0,"Total cap quotes no more ranks");
        }
    }
    static Store PaidBoundary(LastStandFitting fitting,out EncounterModel model,out LastStandShopState shop)
    {
        var store=Profile();var p=Load(store);Check(p.TrySelectFitting(LastStandFittingCatalog.Id(fitting)),"Earned armament selection");
        Check(p.TryPurchasePermanent(Track(fitting),LastStandBulkQuantity.Ten,p.Revision)&&p.TryDeploy(),"Paid armament starts through actual owner");
        model=p.Checkpoint.RestoreModel();shop=p.Checkpoint.RestoreShop();Clear(model,shop);
        var bought=shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,Track(fitting)));
        Check(bought.Accepted,"Actual earned Scrap buys new run rank");model.ApplyShopProjection(shop);
        Check((fitting==LastStandFitting.Mortar?model.MortarShots:model.RailgunShots)>0,"Actual new weapon fired before saved boundary");
        Check(p.TryCommitWave(model,shop),"Paid weapon boundary durable");return store;
    }
    static void Checkpoint()
    {
        foreach(var fitting in Fittings){
            EncounterModel model;LastStandShopState shop;var store=PaidBoundary(fitting,out model,out shop);string raw=store.Raw;
            var saved=Obj(Obj(LastStandSaveJson.Read(raw)["checkpoint"])["encounter"]);
            foreach(string field in WeaponFields)Check(saved.ContainsKey(field),"Current weapon checkpoint must persist "+field);
            var p=Load(store);Check(p.SaveState=="ready"&&store.Raw==raw,"Current paid profile reopens byte-identically");
            var restored=p.Checkpoint.RestoreModel();var restoredShop=p.Checkpoint.RestoreShop();
            Check(model.Snapshot()==restored.Snapshot()&&restoredShop.SpentScrap==shop.SpentScrap&&restoredShop.IncomeRemainder==shop.IncomeRemainder&&
                restoredShop.PurchaseLifecycle==LastStandShopPurchaseLifecycle.Paused,"Paid projections, shots, cooldowns, money and paused purchase state restore exactly");
            model.ContinueAfterCheckpoint();restored.ContinueAfterCheckpoint();int ticks=0;
            while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&ticks++<30000){model.Step();restored.Step();Check(model.Snapshot()==restored.Snapshot(),"Reopen cannot duplicate shots or reset cooldowns");}
            Check(model.AwaitingWaveCommit&&ticks<30000,"Restored next wave also completes");
        }
    }
    static void BoundaryFaults()
    {
        foreach(var fitting in Fittings)foreach(string fault in new[]{"before","after","readback"}){
            var store=Profile();var p=Load(store);var id=Track(fitting);p.TrySelectFitting(LastStandFittingCatalog.Id(fitting));
            Check(p.TryPurchasePermanent(id,LastStandBulkQuantity.Ten,p.Revision)&&p.TryDeploy(),"Paid owner deploys before fault");
            var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();Clear(model,shop);
            Check(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,id)).Accepted,"Paid temporary rank before boundary");model.ApplyShopProjection(shop);
            string before=store.Raw,snapshot=model.Snapshot();int wallet=p.Wallet,writes=store.Writes,spent=shop.SpentScrap;
            store.Fault=fault;Check(!p.TryCommitWave(model,shop)&&p.Wallet==wallet&&p.Checkpoint.CompletedWave==0,"Failed weapon boundary has no optimistic receipt");
            if(fault=="before")Check(store.Raw==before,"Old checkpoint bytes survive denied write");
            store.Fault=null;Check(p.Retry()&&p.Checkpoint.CompletedWave==1&&store.Writes==writes+1,"One complete weapon boundary is committed on retry");
            int after=p.Wallet;Check(after==wallet+LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),1).RepeatableSalvage&&
                !p.TryCommitWave(model,shop)&&p.Retry()&&store.Writes==writes+1&&p.Wallet==after,"No duplicate currency after boundary retry");
            string durable=store.Raw;p=Load(store);Check(p.SaveState=="ready"&&store.Raw==durable&&p.Checkpoint.RestoreModel().Snapshot()==snapshot&&
                p.Checkpoint.RestoreShop().SpentScrap==spent&&p.Checkpoint.RestoreShop().GetTrack(id).RunPurchases==1,
                "Confirmed paid armament cooldowns, shots and spend survive reopening after failure");
        }
    }
    static EncounterCheckpoint WrongDamage(EncounterCheckpoint s,bool mortar)=>new EncounterCheckpoint(s.RulesVersion,s.Tier,s.Fitting,s.Wave,s.CompletedWave,s.Tick,s.Hull,s.MaximumHull,
        s.Spawned,s.Kills,s.CannonShots,s.LauncherShots,s.ScattergunShots,s.Restored,s.CloseHits,s.RangedHits,s.NextSpawnTick,s.NextCannonTick,s.NextLauncherTick,s.NextRepairTick,s.NextScattergunTick,
        s.LastCannonShotTick,s.CannonDamage,s.LauncherDamage,s.ScattergunDamage,s.CannonPeriod,s.RepairAmount,s.ArmorLevel,s.CommittedCannonDamage,
        s.MortarShots,s.RailgunShots,s.NextMortarTick,s.NextRailgunTick,s.MortarDamage+(mortar?1:0),s.RailgunDamage+(mortar?0:1));
    static void Projection()
    {
        foreach(var fitting in Fittings){
            var shop=NewShop(fitting,10);var model=EncounterModel.CreatePlayable(fitting,1,shop);var s=model.CaptureCheckpoint();
            Reject(()=>new LastStandRunCheckpoint(1,WrongDamage(s,fitting==LastStandFitting.Mortar),shop.CaptureCheckpoint()),"Unpaid new weapon damage must be refused");
            Check(new LastStandRunCheckpoint(1,s,shop.CaptureCheckpoint()).RestoreModel().Snapshot()==model.Snapshot(),"Matching paid projection control");
        }
    }
    static void Schema()
    {
        foreach(var fitting in Fittings){
            EncounterModel model;LastStandShopState shop;var store=PaidBoundary(fitting,out model,out shop);string good=store.Raw;
            foreach(string field in WeaponFields)foreach(bool omit in new[]{true,false}){
                var root=LastStandSaveJson.Read(good);var encounter=Obj(Obj(root["checkpoint"])["encounter"]);
                Check(encounter.ContainsKey(field),"Strict current field exists: "+field);
                if(omit)encounter.Remove(field);else encounter[field]=field.EndsWith("Damage",StringComparison.Ordinal)?LastStandSaveJson.Integer(encounter[field])+1:
                    field.StartsWith("next",StringComparison.Ordinal)?(object)int.MaxValue:"invalid";
                string bad=LastStandSaveJson.Write(root);var rejected=new Store{Raw=bad};Check(Load(rejected).SaveState=="blocked"&&rejected.Raw==bad&&rejected.Writes==0,"Malformed weapon field preserves bytes: "+field);
            }
        }
        // Historical JSON must remain its original shape even after a later profile write.
        var old=LastStandRunCheckpoint.Start(1,1,"repair",new int[8],LastStandRunEdition.Legacy(LastStandUpgradeCatalog.RetainedEconomyVersion));
        var method=typeof(LastStandProgression).GetMethod("CheckpointJson",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Static);
        var encoded=Obj(method.Invoke(null,new object[]{old}));var oldEncounter=Obj(encoded["encounter"]);
        foreach(string field in WeaponFields)Check(!oldEncounter.ContainsKey(field),"Legacy checkpoint cannot acquire current weapon fields");
        Check(old.RestoreModel().MortarShots==0&&old.RestoreModel().RailgunShots==0,"Historical new-weapon state remains neutral");
    }
    static LastStandShopCard Card(LastStandShopView view,LastStandUpgradeTrackId id)
    {foreach(var card in view.Cards)if(card.TrackId==id)return card;throw new Exception("Missing actual card");}
    static void Presentation()
    {
        foreach(var fitting in Fittings){
            var id=Track(fitting);var locked=Load(Profile(false));
            Check(!Card(LastStandShopPresentation.ProjectPermanent(locked,LastStandFitting.Repair),id).CanPurchase,"Locked new weapon card must match owner admission");
            var p=Load(Profile());Check(!Card(LastStandShopPresentation.ProjectPermanent(p,LastStandFitting.Repair),id).CanPurchase,"Inapplicable unlocked permanent card is not purchasable");
            p.TrySelectFitting(LastStandFittingCatalog.Id(fitting));var card=Card(LastStandShopPresentation.ProjectPermanent(p,fitting),id);
            Check(card.CanPurchase&&card.QuotedCost==p.QuotePermanent(id,LastStandBulkQuantity.One).Cost,"Applicable permanent card quotes actual owner");
            var wrong=Card(LastStandShopPresentation.ProjectRun(NewShop(LastStandFitting.Mortar==fitting?LastStandFitting.Railgun:LastStandFitting.Mortar)),id);
            Check(!wrong.CanPurchase&&wrong.Refusal==LastStandShopCardRefusal.WrongFitting&&wrong.Reason.Contains(fitting.ToString().ToLowerInvariant()),"Actual new auxiliary wrong-fitting reason renders");
        }
    }
    static int Main(string[] args){try{switch(args[0]){case "locked":Locked();break;case "permanent":Permanent();break;case "run":Run();break;case "checkpoint":Checkpoint();break;case "boundary-faults":BoundaryFaults();break;case "projection":Projection();break;case "schema":Schema();break;case "presentation":Presentation();break;default:throw new Exception("Unknown case");}
        Console.WriteLine("PASS "+args[0]);return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
