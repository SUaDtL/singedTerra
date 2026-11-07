using System;
using System.Globalization;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

static class BalanceMeasurements
{
    // Deliberate measurement policy, not an in-game auto-buyer: after each kill,
    // buy the cheapest applicable track; ties prefer cannon, hull, cadence,
    // armor, then the fitted auxiliary. All charges/effects use production owners.
    static readonly LastStandUpgradeTrackId[] Priority={LastStandUpgradeTrackId.CannonAttack,LastStandUpgradeTrackId.HullCapacity,
        LastStandUpgradeTrackId.CannonCycle,LastStandUpgradeTrackId.Armor,LastStandUpgradeTrackId.LauncherAttack,
        LastStandUpgradeTrackId.FieldRepair,LastStandUpgradeTrackId.ScattergunAttack};
    static void BuyRun(LastStandShopState shop,EncounterModel model)
    {
        for(int budget=0;budget<100;budget++) {
            LastStandUpgradeTrackId? choice=null;int cheapest=int.MaxValue;
            foreach(var id in Priority) {
                var row=shop.GetTrack(id);
                if(row.CanPurchase && row.NextPrice.Value<=shop.Scrap && row.NextPrice.Value<cheapest){choice=id;cheapest=row.NextPrice.Value;}
            }
            if(!choice.HasValue)return;
            if(!shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,choice.Value)).Accepted)throw new Exception("Measurement purchase refused.");
            model.ApplyShopProjection(shop);
        }
        throw new Exception("Unexpected purchase budget exhaustion.");
    }
    sealed class Result
    {
        public int Completed,Ticks,Kills,RunLevels,Hull;public long Repeatable,FirstClear,Spend;public string Status;
    }
    static Result Measure(int tier,LastStandFitting fitting,int[] levels,int limit)
    {
        var shop=new LastStandShopState(1,fitting,levels);
        var definition=tier<=2?LastStandTierCatalog.Get(tier):new LastStandTierDefinition(tier,"fixture-tier-"+tier,"fixture-wave-"+tier,"fixture-biome",1,1);
        var model=new EncounterModel(fitting,EncounterProfile.ForDefinition(definition));model.ApplyShopProjection(shop);
        long salvage=0,first=0;int oldKills=0;
        while(model.Status==EncounterStatus.Running && model.CompletedWave<limit) {
            model.Step();
            if(model.Kills!=oldKills){shop.ObserveAuthoritativeKills(model.Kills);oldKills=model.Kills;if(model.Status==EncounterStatus.Running)BuyRun(shop,model);}
            if(model.AwaitingWaveCommit){var reward=LastStandRewardCatalog.At(definition,model.CompletedWave);salvage+=reward.RepeatableSalvage;first+=reward.FirstClearSalvage;
                if(model.CompletedWave<limit)model.ContinueAfterCheckpoint();}
            if(model.Tick>10000000)throw new Exception("Measurement exceeds finite test budget.");
        }
        int purchased=0;foreach(var id in Priority)purchased+=shop.GetTrack(id).RunPurchases;
        return new Result{Completed=model.CompletedWave,Ticks=model.Tick,Kills=model.Kills,RunLevels=purchased,Hull=model.Hull,
            Repeatable=salvage,FirstClear=first,Spend=shop.SpentScrap,Status=model.Status.ToString()};
    }
    static int[] Levels(int level)
    {
        var levels=new int[LastStandUpgradeCatalog.Tracks.Count];
        foreach(var row in LastStandUpgradeCatalog.Tracks)levels[(int)row.Id]=Math.Min(level,row.PermanentCap);
        return levels;
    }
    static long Investment(int[] levels,LastStandFitting fitting)
    {
        long total=0;foreach(var row in LastStandUpgradeCatalog.Tracks)if(row.IsEligible(fitting))for(int n=1;n<=levels[(int)row.Id];n++)total+=row.PermanentPrice(n);return total;
    }
    static void Print(string kind,int tier,LastStandFitting fitting,int level,int iteration,int[] levels,Result r)
    {
        Console.WriteLine(String.Join(",",new[]{kind,tier.ToString(),fitting.ToString(),level.ToString(),iteration.ToString(),r.Completed.ToString(),r.Ticks.ToString(),r.Kills.ToString(),r.Repeatable.ToString(),r.FirstClear.ToString(),r.Spend.ToString(),r.RunLevels.ToString(),Investment(levels,fitting).ToString(),r.Hull.ToString(),r.Status}));
    }
    static int Main(string[] args)
    {
        try {
            Console.WriteLine("kind,tier,fitting,permanentLevel,iteration,completed,ticks,kills,repeatableSalvage,firstClearSalvage,spentScrap,runLevels,permanentInvestment,hull,status");
            foreach(int level in new[]{0,3,20,60,150,500,1000})foreach(int tier in new[]{1,2})foreach(LastStandFitting fitting in Enum.GetValues(typeof(LastStandFitting))) {
                var levels=Levels(level);Print("build",tier,fitting,level,0,levels,Measure(tier,fitting,levels,5001));
            }
            foreach(LastStandFitting fitting in Enum.GetValues(typeof(LastStandFitting))) {
                var levels=Levels(2000);Print("future-fixture",10,fitting,2000,0,levels,Measure(10,fitting,levels,5000));
            }
            if(args.Length>0 && args[0]=="quick")return 0;
            // Earned progression from zero, with first-clear rewards awarded only
            // when a new best crosses a milestone. No gifted permanent levels.
            foreach(var fitting in new[]{LastStandFitting.Repair,LastStandFitting.Launcher}) {
                var levels=Levels(0);long wallet=0;int best=0;
                for(int run=1;run<=12;run++) {
                    var r=Measure(1,fitting,levels,5001);wallet+=r.Repeatable;
                    long granted=0;
                    foreach(var milestone in LastStandRewardCatalog.Milestones(LastStandTierCatalog.Get(1)))if(milestone.Wave>best && milestone.Wave<=r.Completed)granted+=milestone.FirstClearSalvage;
                    wallet+=granted;r.FirstClear=granted;
                    best=Math.Max(best,r.Completed);Print("earned-trajectory",1,fitting,-1,run,levels,r);
                    while(true) {
                        LastStandUpgradeDefinition chosen=null;int price=int.MaxValue;
                        foreach(var id in Priority){var row=LastStandUpgradeCatalog.Get(id);int n=levels[(int)id];
                            if(row.IsEligible(fitting) && n<row.PermanentCap && row.PermanentPrice(n+1)<price){chosen=row;price=row.PermanentPrice(n+1);}}
                        if(chosen==null || price>wallet)break;wallet-=price;levels[(int)chosen.Id]++;
                    }
                }
            }
            return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
