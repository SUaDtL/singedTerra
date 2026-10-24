using System;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

static class PeriodicBulkMeasurements
{
    static void Measure(LastStandFitting fitting,int realSeconds,LastStandBulkQuantity quantity)
    {
        var levels=new int[LastStandUpgradeCatalog.Tracks.Count];
        foreach(var row in LastStandUpgradeCatalog.Tracks)levels[(int)row.Id]=Math.Min(500,row.PermanentCap);
        var shop=new LastStandShopState(1,fitting,levels);
        var model=EncounterModel.CreatePlayable(fitting,1,shop);
        var auxiliary=fitting==LastStandFitting.Launcher?LastStandUpgradeTrackId.LauncherAttack:
            fitting==LastStandFitting.Repair?LastStandUpgradeTrackId.FieldRepair:LastStandUpgradeTrackId.ScattergunAttack;
        var order=new[]{LastStandUpgradeTrackId.CannonAttack,LastStandUpgradeTrackId.HullCapacity,LastStandUpgradeTrackId.ScrapYield,
            LastStandUpgradeTrackId.CannonAttack,LastStandUpgradeTrackId.CannonCycle,auxiliary,LastStandUpgradeTrackId.Armor};
        int interval=realSeconds==0?int.MaxValue:realSeconds*5*20,next=interval,cursor=0,attempts=0,purchases=0,ranks=0;
        long rewards=0;int carry=0;
        while(model.Status==EncounterStatus.Running && model.CompletedWave<5000) {
            model.Step();shop.ObserveAuthoritativeKills(model.Kills,model.Wave,25);
            if(model.Status==EncounterStatus.Running && model.Tick>=next) {
                next+=interval;attempts++;
                int skipped=0;
                while(skipped<order.Length && !shop.GetTrack(order[cursor%order.Length]).CanPurchase){cursor++;skipped++;}
                if(skipped<order.Length) {
                    var result=shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,order[cursor%order.Length],quantity));
                    if(result.Accepted){purchases++;ranks+=result.PurchasedQuantity;cursor++;model.ApplyShopProjection(shop);}
                    else if(result.Refusal!=LastStandShopPurchaseRefusal.InsufficientScrap)throw new Exception("Unexpected periodic purchase refusal.");
                }
            }
            if(model.AwaitingWaveCommit) {
                var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),model.CompletedWave);long payout;int nextCarry;
                if(!LastStandResearchCatalog.TryMultiplyReward(reward.RepeatableSalvage,25,carry,out payout,out nextCarry))throw new Exception("Reward projection failed.");
                rewards+=payout;carry=nextCarry;
                if(model.Status==EncounterStatus.Running && model.CompletedWave<5000)model.ContinueAfterCheckpoint();
            }
            if(model.Tick>12000000)throw new Exception("Periodic observation exceeds finite tick bound.");
        }
        Console.WriteLine(String.Join(",",new object[]{fitting,realSeconds,quantity,model.CompletedWave,model.Tick,attempts,purchases,ranks,shop.EarnedScrap,shop.SpentScrap,shop.Scrap,rewards,model.Status}));
    }
    static int Main()
    {
        try {
            Console.WriteLine("fitting,purchaseIntervalRealSeconds,quantity,completed,ticks,purchaseAttempts,acceptedPurchaseIntents,purchasedRanks,earnedScrap,spentScrap,remainingScrap,repeatableSalvage,status");
            foreach(var fitting in new[]{LastStandFitting.Launcher,LastStandFitting.Repair,LastStandFitting.Scattergun}) {
                Measure(fitting,0,LastStandBulkQuantity.Max);
                Measure(fitting,60,LastStandBulkQuantity.Ten);
                foreach(int seconds in new[]{60,300,900})Measure(fitting,seconds,LastStandBulkQuantity.Max);
            }
            return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
