using System;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

static class UpgradeEconomyMeasurements
{
    // The saved calibration report describes v3; keep this benchmark explicit.
    static LastStandEconomyDefinition Rules=>LastStandUpgradeCatalog.ForEconomy(LastStandUpgradeCatalog.RetainedEconomyVersion);
    sealed class Result { public int Waves,Ticks,Kills,Hull,Purchases;public long Repeatable,FirstClear;public int Earned,Spent;
        public int CannonLevel,CannonDamage,CannonPeriod,MaximumHull,Repair,Armor,Yield; }
    static LastStandUpgradeTrackId Auxiliary(LastStandFitting fitting)=>fitting==LastStandFitting.Repair?LastStandUpgradeTrackId.FieldRepair:
        fitting==LastStandFitting.Launcher?LastStandUpgradeTrackId.LauncherAttack:LastStandUpgradeTrackId.ScattergunAttack;
    static LastStandUpgradeTrackId[] Order(string policy,LastStandFitting fitting)
    {
        var cannon=LastStandUpgradeTrackId.CannonAttack;var hull=LastStandUpgradeTrackId.HullCapacity;
        var armor=LastStandUpgradeTrackId.Armor;var cycle=LastStandUpgradeTrackId.CannonCycle;
        var income=LastStandUpgradeTrackId.ScrapYield;var auxiliary=Auxiliary(fitting);
        if(policy=="income")return new[]{income,income,cannon,hull,cycle,auxiliary,armor};
        if(policy=="mixed")return new[]{cannon,hull,income,cannon,cycle,auxiliary,armor};
        return new[]{cannon,hull,cannon,cycle,auxiliary,armor};
    }
    static void Buy(LastStandShopState shop,EncounterModel model,LastStandUpgradeTrackId[] order,ref int cursor,ref int purchases)
    {
        for(int count=0;count<1000;count++) {
            int skipped=0;
            while(skipped<order.Length && !shop.GetTrack(order[cursor%order.Length]).CanPurchase){cursor++;skipped++;}
            if(skipped==order.Length)return;
            var id=order[cursor%order.Length];var row=shop.GetTrack(id);
            // Save for the next declared investment, rather than starve every
            // expensive track by endlessly buying the cheapest alternative.
            if(row.NextPrice.Value>shop.Scrap)return;
            if(!shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,id)).Accepted)throw new Exception("Measurement purchase refused.");
            purchases++;cursor++;model.ApplyShopProjection(shop);
        }
        throw new Exception("Finite purchase budget exhausted.");
    }
    static Result Run(int tier,LastStandFitting fitting,int[] levels,int limit,string policy,int logistics,int recovery)
    {
        var shop=new LastStandShopState(1,fitting,levels,Rules.Version);var model=EncounterModel.CreatePlayable(fitting,tier,shop);
        var order=Order(policy,fitting);int cursor=0,oldKills=0,purchases=0,remainder=0;long repeat=0,first=0;
        while(model.Status==EncounterStatus.Running && model.CompletedWave<limit) {
            model.Step();
            if(model.Kills!=oldKills) {
                shop.ObserveAuthoritativeKills(model.Kills,model.Wave,logistics);oldKills=model.Kills;
                if(model.Status==EncounterStatus.Running)Buy(shop,model,order,ref cursor,ref purchases);
            }
            if(model.AwaitingWaveCommit) {
                var reward=LastStandRewardCatalog.At(shop.Edition.Tier(tier),model.CompletedWave,shop.Edition);
                long payout;int carry;
                if(!LastStandResearchCatalog.TryMultiplyReward(reward.RepeatableSalvage,recovery,remainder,out payout,out carry))
                    throw new Exception("Measurement reward projection refused.");
                repeat+=payout;remainder=carry;first+=reward.FirstClearSalvage;
                if(model.Status==EncounterStatus.Running && model.CompletedWave<limit)model.ContinueAfterCheckpoint();
            }
            if(model.Tick>12000000)throw new Exception("Measurement tick budget exceeded.");
        }
        return new Result{Waves=model.CompletedWave,Ticks=model.Tick,Kills=model.Kills,Hull=model.Hull,Purchases=purchases,
            Repeatable=repeat,FirstClear=first,Earned=shop.EarnedScrap,Spent=shop.SpentScrap,
            CannonLevel=shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).CurrentLevel,CannonDamage=model.CurrentCannonDamage,
            CannonPeriod=model.CurrentCannonPeriod,MaximumHull=model.CurrentMaximumHull,Repair=model.CurrentRepairAmount,
            Armor=model.CurrentArmorLevel,Yield=shop.GetTrack(LastStandUpgradeTrackId.ScrapYield).CurrentLevel};
    }
    static int[] Levels(int level)
    {var result=new int[Rules.Tracks.Count];foreach(var row in Rules.Tracks)result[(int)row.Id]=Math.Min(level,row.PermanentCap);return result;}
    static long Investment(int[] levels,LastStandFitting fitting)
    {long cost=0;foreach(var row in Rules.Tracks)if(row.IsEligible(fitting))for(int n=1;n<=levels[(int)row.Id];n++)cost+=row.PermanentPrice(n);return cost;}
    static void Print(string kind,int tier,LastStandFitting fitting,string policy,int level,int run,int[] levels,Result result,int logistics,int recovery)
    {Console.WriteLine(String.Join(",",new object[]{kind,tier,fitting,policy,level,run,result.Waves,result.Ticks,result.Kills,result.Hull,result.Purchases,result.Earned,result.Spent,result.Repeatable,result.FirstClear,Investment(levels,fitting),logistics,recovery,
        levels[0],levels[2],levels[4],levels[7],result.CannonLevel,result.CannonDamage,result.CannonPeriod,result.MaximumHull,result.Repair,result.Armor,result.Yield}));}
    static void BuyPermanent(int[] levels,LastStandFitting fitting,string policy,ref long wallet,ref int cursor)
    {
        var order=Order(policy,fitting);
        for(int steps=0;steps<100000;steps++) {
            int skipped=0;
            while(skipped<order.Length && levels[(int)order[cursor%order.Length]]==Rules.Get(order[cursor%order.Length]).PermanentCap){cursor++;skipped++;}
            if(skipped==order.Length)return;
            var row=Rules.Get(order[cursor%order.Length]);int n=levels[(int)row.Id];int cost=row.PermanentPrice(n+1);
            if(cost>wallet)return;wallet-=cost;levels[(int)row.Id]++;cursor++;
        }
        throw new Exception("Finite permanent purchase budget exhausted.");
    }
    static int Main(string[] args)
    {
        try {
            Console.WriteLine("kind,tier,fitting,policy,permanentLevel,run,completed,ticks,kills,hull,purchaseIntents,earnedScrap,spentScrap,repeatableSalvage,firstClearSalvage,permanentInvestment,logisticsRank,recoveryRank,initialCannon,initialHull,initialCycle,initialYield,finalCannon,finalCannonDamage,finalCannonPeriod,maximumHull,repairAmount,armor,yieldLevel");
            if(args.Length==0 || args[0]!="trajectory") {
            foreach(var fitting in new[]{LastStandFitting.Launcher,LastStandFitting.Repair,LastStandFitting.Scattergun})
                foreach(string policy in new[]{"combat","income","mixed"})foreach(int level in new[]{0,20,150}) {
                    var levels=Levels(level);var result=Run(1,fitting,levels,5000,policy,0,0);
                    Print("matched-build",1,fitting,policy,level,0,levels,result,0,0);
                }
            foreach(var fitting in new[]{LastStandFitting.Launcher,LastStandFitting.Repair,LastStandFitting.Scattergun})foreach(int tier in new[]{1,2}) {
                var levels=Levels(500);Print("mature-build",tier,fitting,"mixed",500,0,levels,Run(tier,fitting,levels,5000,"mixed",25,25),25,25);
            }
            }
            if(args.Length>0 && args[0]=="quick")return 0;
            foreach(var fitting in new[]{LastStandFitting.Launcher,LastStandFitting.Repair})foreach(string policy in new[]{"combat","income","mixed"}) {
                var levels=Levels(0);int best=0,cursor=0;long wallet=0;
                for(int run=1;run<=16;run++) {
                    var result=Run(1,fitting,levels,5000,policy,0,0);long bonus=0;
                    foreach(var milestone in LastStandRewardCatalog.Milestones(LastStandTierCatalog.Get(1)))if(milestone.Wave>best && milestone.Wave<=result.Waves)bonus+=milestone.FirstClearSalvage;
                    result.FirstClear=bonus;wallet+=result.Repeatable+bonus;best=Math.Max(best,result.Waves);
                    Print("earned-trajectory",1,fitting,policy,-1,run,levels,result,0,0);
                    BuyPermanent(levels,fitting,policy,ref wallet,ref cursor);
                }
            }
            return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
