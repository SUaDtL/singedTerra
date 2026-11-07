using System;
using System.Collections.Generic;
using System.Globalization;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Accelerated development setup only. Every gameplay value comes from ordinary
// production steps, transactions and earned purchases starting with empty storage.
static class EarnedMilestoneFixtures
{
    sealed class Store:ILastStandStorage
    {
        public string Raw { get; private set; }
        public int Writes { get; private set; }
        public Store(string raw=null){Raw=raw;}
        public string Read()=>Raw;
        public void Write(string value){Raw=value;Writes++;}
    }
    static readonly LastStandUpgradeTrackId[] Priority={LastStandUpgradeTrackId.CannonAttack,LastStandUpgradeTrackId.HullCapacity,
        LastStandUpgradeTrackId.CannonCycle,LastStandUpgradeTrackId.Armor,LastStandUpgradeTrackId.LauncherAttack,
        LastStandUpgradeTrackId.FieldRepair,LastStandUpgradeTrackId.ScattergunAttack};
    static void Require(bool value,string message){if(!value)throw new Exception(message);}
    static Dictionary<string,object> Map(params object[] pairs)
    {var value=new Dictionary<string,object>();for(int n=0;n<pairs.Length;n+=2)value.Add((string)pairs[n],pairs[n+1]);return value;}
    static Dictionary<string,object> Levels(LastStandProgression p)
    {var result=new Dictionary<string,object>();foreach(var row in LastStandUpgradeCatalog.Tracks)result.Add(row.Key,p.GetPermanentLevel(row.Id));return result;}
    static Dictionary<string,object> RunLevels(LastStandShopState shop)
    {var result=new Dictionary<string,object>();foreach(var row in LastStandUpgradeCatalog.Tracks)result.Add(row.Key,shop.GetTrack(row.Id).RunPurchases);return result;}
    static int BuyRun(LastStandShopState shop,EncounterModel model)
    {
        int bought=0;
        for(;bought<100;bought++) {
            LastStandUpgradeTrackId? choice=null;int price=int.MaxValue;
            foreach(var id in Priority){var track=shop.GetTrack(id);
                if(track.CanPurchase && track.NextPrice.Value<=shop.Scrap && track.NextPrice.Value<price){choice=id;price=track.NextPrice.Value;}}
            if(!choice.HasValue)return bought;
            Require(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,choice.Value)).Accepted,"Earned run purchase must be accepted.");
            model.ApplyShopProjection(shop);
        }
        throw new Exception("Unexpected run-purchase budget exhaustion.");
    }
    static int BuyPermanent(LastStandProgression p,LastStandFitting fitting,out int spent)
    {
        int bought=0;spent=0;
        for(;bought<10000;bought++) {
            LastStandUpgradeTrackId? choice=null;int price=int.MaxValue;
            foreach(var id in Priority){var definition=LastStandUpgradeCatalog.Get(id);int cost=p.PermanentCost(id);
                if(definition.IsEligible(fitting) && cost>0 && cost<=p.Wallet && cost<price){choice=id;price=cost;}}
            if(!choice.HasValue)return bought;
            Require(p.TryPurchase(choice.Value),"Permanent purchase spends only committed wave Salvage.");spent+=price;
        }
        throw new Exception("Unexpected permanent-purchase budget exhaustion.");
    }
    static Dictionary<string,object> VerifyNext(string raw,string fitting,int target)
    {
        var store=new Store(raw);var p=LastStandProgression.Load(store);
        Require(p.SaveState=="ready" && p.Checkpoint.CompletedWave==target-1,"Fixture loads at the immediately preceding durable boundary.");
        Require(!p.HasFirstClear("tier-1:wave-"+target),"Target milestone must be genuinely unearned.");
        Require(target==100?!p.IsFittingUnlocked("scattergun"):!p.TierTwoUnlocked,"Target unlock must be absent before the browser clear.");
        var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();int tick=model.Tick;
        Require(model.ContinueAfterCheckpoint(),"Resume enters exactly the next wave.");
        shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
        int budget=20000;
        while(!model.AwaitingWaveCommit && model.Status==EncounterStatus.Running && budget-->0){model.Step();shop.ObserveAuthoritativeKills(model.Kills);}
        Require(model.Status==EncounterStatus.Running && model.CompletedWave==target,"The next wave clears alive without test-only purchases or changed stats.");
        Require(p.TryCommitWave(model,shop),"The next clear produces the actual atomic unlock receipt.");
        var receipt=p.LastReceipt;var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),target);
        Require(receipt.Wave==target && receipt.Salvage==reward.RepeatableSalvage+reward.FirstClearSalvage,"Exact next-wave reward.");
        Require(target==100?receipt.UnlockedFitting=="scattergun" && p.IsFittingUnlocked("scattergun"):
            receipt.UnlockedTier==2 && p.TierTwoUnlocked,"Real next-wave unlock transition.");
        return Map("fitting",fitting,"targetWave",target,"runId",p.ActiveRunId,"save",raw,"expectedSave",store.Raw,
            "expectedRepeatable",reward.RepeatableSalvage,"expectedFirstClear",reward.FirstClearSalvage,
            "expectedUnlockTier",receipt.UnlockedTier,"expectedUnlockFitting",receipt.UnlockedFitting,
            "startingTick",tick,"expectedFinalTick",model.Tick,"nextWaveTicks",model.Tick-tick,
            "expectedRemainingHull",model.Hull,"permanentLevels",Levels(p));
    }
    static void Generate(string fitting,List<object> cases,List<object> trajectories)
    {
        var kind=fitting=="launcher"?LastStandFitting.Launcher:LastStandFitting.Repair;
        var store=new Store();var p=LastStandProgression.Load(store);
        Require(p.TrySelectFitting(fitting),"Select an initially available fitting.");
        var targets=new HashSet<int>{100,300};
        int totalTicks=0,totalEarned=0,totalPermanentSpend=0,totalPermanentPurchases=0;
        for(int run=1;run<=12 && targets.Count>0;run++) {
            Require(p.TryDeploy(),"Reserve a real run from the accumulated earned investment.");
            var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
            shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
            int oldKills=0,runPurchases=0,openingWallet=p.Wallet;
            var deployedLevels=Levels(p);
            while(model.Status==EncounterStatus.Running && targets.Count>0) {
                model.Step();totalTicks++;
                if(totalTicks>6000000)throw new Exception("Earned fixture exceeded its finite simulation budget.");
                if(model.Kills!=oldKills){shop.ObserveAuthoritativeKills(model.Kills);oldKills=model.Kills;
                    if(model.Status==EncounterStatus.Running)runPurchases+=BuyRun(shop,model);}
                if(model.AwaitingWaveCommit) {
                    int wallet=p.Wallet;Require(p.TryCommitWave(model,shop),"Every cleared wave is committed through production storage.");
                    totalEarned+=p.Wallet-wallet;
                    int target=model.CompletedWave+1;
                    if(targets.Contains(target) && model.Status==EncounterStatus.Running) {
                        var item=VerifyNext(store.Raw,fitting,target);
                        item.Add("trajectoryRun",run);item.Add("sourceStoreWrites",store.Writes);
                        item.Add("totalSimulatedTicks",totalTicks);item.Add("totalEarnedSalvage",totalEarned);
                        item.Add("totalPermanentSpend",totalPermanentSpend);item.Add("totalPermanentPurchases",totalPermanentPurchases);
                        item.Add("runPurchaseCount",runPurchases);item.Add("runPurchaseSpend",shop.SpentScrap);item.Add("runPurchases",RunLevels(shop));
                        Require(p.Wallet==totalEarned-totalPermanentSpend,"All banked currency is earned minus actual permanent debits.");
                        cases.Add(item);targets.Remove(target);
                    }
                    if(model.Status==EncounterStatus.Running && targets.Count>0)Require(model.ContinueAfterCheckpoint(),"Continue only after durable save.");
                }
            }
            trajectories.Add(Map("fitting",fitting,"run",run,"completedWave",model.CompletedWave,"status",model.Status.ToString(),
                "ticks",model.Tick,"kills",model.Kills,"openingWallet",openingWallet,"closingWallet",p.Wallet,
                "permanentLevels",deployedLevels,"runPurchases",RunLevels(shop),"runPurchaseSpend",shop.SpentScrap,
                "stopAtFixtureBoundary",targets.Count==0));
            if(targets.Count==0)break;
            if(p.HasCheckpoint)Require(p.TryFinalizeRun(),"Naturally defeated run finalizes without a payout.");
            Require(p.PendingDefeat==null,"No synthetic legacy reward.");
            int spent;totalPermanentPurchases+=BuyPermanent(p,kind,out spent);totalPermanentSpend+=spent;
            p=LastStandProgression.Load(store);
            Require(p.SaveState=="ready" && p.Wallet==totalEarned-totalPermanentSpend,"Reload retains exactly the earned permanent investment.");
        }
        Require(targets.Count==0,"The earned trajectory must reach both requested prerequisite boundaries.");
    }
    static int Main()
    {
        try {
            CultureInfo.CurrentCulture=CultureInfo.InvariantCulture;
            var cases=new List<object>();var trajectories=new List<object>();
            Generate("repair",cases,trajectories);Generate("launcher",cases,trajectories);
            Console.WriteLine(LastStandSaveJson.Write(Map("cases",cases,"trajectories",trajectories)));return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
