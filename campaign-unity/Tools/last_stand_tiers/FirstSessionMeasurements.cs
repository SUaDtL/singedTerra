using System;
using System.Globalization;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Actual first-run progression transactions. This benchmark buys the cheapest
// eligible temporary track after each kill; it is not an in-game auto-buyer.
internal static class FirstSessionMeasurements
{
    sealed class MemoryStorage:ILastStandStorage
    { string value;public string Read()=>value;public void Write(string next){value=next;} }
    static void Require(bool condition,string message){if(!condition)throw new InvalidOperationException(message);}
    static readonly LastStandUpgradeTrackId[] Priority={LastStandUpgradeTrackId.CannonAttack,LastStandUpgradeTrackId.HullCapacity,
        LastStandUpgradeTrackId.CannonCycle,LastStandUpgradeTrackId.Armor,LastStandUpgradeTrackId.LauncherAttack,LastStandUpgradeTrackId.FieldRepair};
    static void BuyRun(LastStandShopState shop,EncounterModel model)
    {
        for(int count=0;count<100;count++)
        {
            LastStandUpgradeTrackId? choice=null;int cheapest=int.MaxValue;
            foreach(var id in Priority)
            {
                var row=shop.GetTrack(id);
                if(row.CanPurchase && row.NextPrice.Value<=shop.Scrap && row.NextPrice.Value<cheapest)
                {choice=id;cheapest=row.NextPrice.Value;}
            }
            if(!choice.HasValue)return;
            Require(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,choice.Value)).Accepted,"Measured run purchase must charge normally.");
            model.ApplyShopProjection(shop);
        }
        throw new Exception("Purchase policy exceeded its bounded budget.");
    }
    static EncounterModel Measure(LastStandProgression progression,string scenario)
    {
        Require(progression.TryDeploy(),"Reserve the actual selected run before simulating.");
        var model=progression.Checkpoint.RestoreModel();var shop=progression.Checkpoint.RestoreShop();
        int firstKill=0,firstHit=0,oldKills=0,openingWallet=progression.Wallet;
        while(model.Status==EncounterStatus.Running && model.CompletedWave<5001)
        {
            model.Step();
            if(firstKill==0 && model.Kills>0)firstKill=model.Tick;
            if(firstHit==0 && model.CloseHits+model.RangedHits>0)firstHit=model.Tick;
            if(model.Kills!=oldKills)
            {shop.ObserveAuthoritativeKills(model.Kills);oldKills=model.Kills;if(model.Status==EncounterStatus.Running)BuyRun(shop,model);}
            if(model.AwaitingWaveCommit)
            {
                Require(progression.TryCommitWave(model,shop),"Actual clear banks one reward and exact boundary checkpoint.");
                if(model.Status==EncounterStatus.Running && model.CompletedWave<5001)
                    Require(model.ContinueAfterCheckpoint(),"Continue only after the durable wave commit.");
            }
            if(model.Tick>10000000)throw new Exception("Measurement exceeded its finite tick budget.");
        }
        if(progression.HasCheckpoint)Require(progression.TryFinalizeRun(),"Finalize without a new death payout.");
        Require(progression.PendingDefeat==null && !progression.TryClaim(),"New runs never manufacture legacy pending rewards.");
        Console.WriteLine(string.Join(",",new object[]{"measurement",model.Profile.Tier,model.Fitting.ToString().ToLowerInvariant(),scenario,
            model.Tick,model.Kills,model.Hull,model.Status,firstKill,firstHit,model.CompletedWave,progression.Wallet-openingWallet,
            model.CannonShots,model.LauncherShots,model.Restored,model.CloseHits,model.RangedHits,model.CurrentCannonDamage,
            model.CurrentMaximumHull,model.CurrentCannonPeriod,model.CurrentLauncherDamage,model.CurrentRepairAmount}));
        return model;
    }
    static int Main()
    {
        CultureInfo.CurrentCulture=CultureInfo.InvariantCulture;
        try
        {
            foreach(string fitting in new[]{"repair","launcher"})
            {
                var storage=new MemoryStorage();var progression=LastStandProgression.Load(storage);
                Require(progression.TrySelectFitting(fitting),"Select a real starting fitting.");
                var first=Measure(progression,"starter");int banked=progression.Wallet;
                Require(banked>=1 && progression.TryPurchase(LastStandUpgradeTrackId.CannonAttack),"Cleared-wave income funds the first permanent upgrade.");
                progression=LastStandProgression.Load(storage);
                Require(progression.CannonAttackLevel==1 && progression.Wallet==banked-1 && !progression.HasCheckpoint,
                    "Reload confirms the permanent debit and completed run.");
                foreach(var definition in LastStandUpgradeCatalog.Tracks)
                    Require(progression.GetPermanentLevel(definition.Id)==(definition.Id==LastStandUpgradeTrackId.CannonAttack?1:0),
                        "Exactly one permanent level was purchased; no other track was gifted.");
                Console.WriteLine("earned,{0},{1},{2},{3},{4},{5}",fitting,first.Tick,first.Kills,progression.CannonAttackLevel,progression.Wallet,progression.TierTwoUnlocked);
                Measure(progression,"first_earned_cannon");
            }
            return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
