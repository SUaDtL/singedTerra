using System;
using System.Reflection;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

static class CheckpointStoreChecks
{
    sealed class Store : ILastStandStorage
    {
        public string Raw;
        public bool FailBeforeWrite, FailAfterWrite, FailRead, FailReadback;
        bool readbackPending;
        public string Read() { if (FailRead || readbackPending) { readbackPending=false; throw new Exception("read denied"); } return Raw; }
        public void Write(string value)
        {
            if (FailBeforeWrite) throw new Exception("quota");
            Raw = value;
            readbackPending=FailReadback;
            if (FailAfterWrite) throw new Exception("unconfirmed");
        }
    }
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static void Starting()
    {
        var store = new Store { FailBeforeWrite = false, FailAfterWrite = false, FailRead = false };
        var p = LastStandProgression.Load(store);
        Check(p.TryDeploy(), "initial deploy");
        int id = p.ActiveRunId;
        var restored = LastStandProgression.Load(store);
        Check(restored.ActiveRunId == id && id > 0, "starting checkpoint must survive reload");
        Check(!restored.TryDeploy(), "Deploy must not silently replace a resumable run");
    }
    static void Migration()
    {
        var store = new Store { Raw = "{\"version\":1,\"credits\":7,\"permanentLevel\":2,\"nextRunId\":2,\"lastFinalizedRunId\":0,\"pendingDefeat\":{\"runId\":1,\"elapsedTicks\":80,\"kills\":2,\"reward\":1}}" };
        var p = LastStandProgression.Load(store);
        Check(p.Wallet == 7 && p.CannonAttackLevel == 2 && p.PendingDefeat != null, "legacy investment and claim preserved");
        Check(store.Raw.Contains("\"version\":6"), "legacy migrates to atomic version 6 envelope");
        Check(p.TryClaim() && p.Wallet == 8 && !p.TryClaim(), "legacy claim exactly once");
        Check(LastStandProgression.Load(store).Wallet == 8, "claim reload unchanged");
        const string six="\"cannonAttack\":3,\"launcherAttack\":2,\"hullCapacity\":1,\"armor\":2,\"cannonCycle\":3,\"fieldRepair\":1";
        string v2="{\"version\":2,\"credits\":12,\"permanentLevels\":{"+six+"},\"nextRunId\":2,\"lastFinalizedRunId\":0,\"pendingDefeat\":{\"runId\":1,\"elapsedTicks\":99,\"kills\":3,\"reward\":1}}";
        string v3="{\"version\":3,\"credits\":12,\"permanentLevels\":{"+six+"},\"nextRunId\":3,\"lastFinalizedRunId\":1,\"selectedTier\":2,\"tierRecords\":{\"tier-goals-v1\":{\"bestTicks1\":1500,\"bestKills1\":30,\"bestTicks2\":300,\"bestKills2\":4,\"tierTwoUnlocked\":true}},\"pendingDefeat\":{\"runId\":2,\"elapsedTicks\":300,\"kills\":4,\"reward\":1,\"tier\":2,\"profileVersion\":\"tier-goals-v1\",\"isLimit\":false,\"newBestTime\":true,\"newBestKills\":true,\"unlockedTierTwo\":false}}";
        foreach(string legacy in new[]{v2,v3})
        {
            var old=new Store {Raw=legacy,FailBeforeWrite=true};var migrated=LastStandProgression.Load(old);
            Check(migrated.SaveState=="retry" && old.Raw==legacy,"migration failure preserves exact source bytes");
            old.FailBeforeWrite=false;Check(migrated.Retry() && old.Raw.Contains("\"version\":6"),"migration retry commits envelope");
            Check(migrated.Wallet==12 && migrated.GetPermanentLevel(LastStandUpgradeTrackId.LauncherAttack)==2 &&
                migrated.GetPermanentLevel(LastStandUpgradeTrackId.CannonCycle)==3 && migrated.GetPermanentLevel(LastStandUpgradeTrackId.FieldRepair)==1,
                "all legacy tracks retain investment");
            Check(migrated.GetPermanentLevel(LastStandUpgradeTrackId.ScattergunAttack)==0 && migrated.GetBestWave(1)==0 &&
                !migrated.IsFittingUnlocked("scattergun"),"migration invents no wave clears or unlocks");
            if(legacy==v3)Check(migrated.SelectedTier==2 && migrated.TierTwoUnlocked && migrated.GetBestTicks(1)==1500,"legacy unlocked tier and history preserved");
            Check(migrated.TryClaim() && !migrated.TryClaim() && LastStandProgression.Load(old).Wallet==13,"migrated pending claim remains exactly once");
        }
    }
    static Store Strong()
    {
        var store=new Store();LastStandProgression.Load(store);
        var fixture=LastStandSaveJson.Read(store.Raw);
        var levels=LastStandSaveJson.Object(fixture["permanentLevels"]);
        foreach(var track in LastStandUpgradeCatalog.Tracks)levels[track.Key]=track.Available?track.PermanentCap:0;
        fixture["credits"]=100000;fixture["selectedFitting"]="launcher";
        store.Raw=LastStandSaveJson.Write(fixture);return store;
    }
    static void Step(EncounterModel model,LastStandShopState shop)
    { model.Step();shop.ObserveAuthoritativeKills(model.Kills); }
    static void Clear(EncounterModel model,LastStandShopState shop)
    {
        int budget=20000;
        while(!model.AwaitingWaveCommit && model.Status==EncounterStatus.Running && budget-->0)Step(model,shop);
        Check(model.AwaitingWaveCommit,"test cohort must clear");
    }
    static void Faults()
    {
        foreach(string fault in new[]{"before","after","readback"})
        {
            var store=Strong();var p=LastStandProgression.Load(store);Check(p.TryDeploy(),"deploy");
            var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();Clear(model,shop);
            string original=store.Raw;int wallet=p.Wallet;
            store.FailBeforeWrite=fault=="before";store.FailAfterWrite=fault=="after";store.FailReadback=fault=="readback";
            Check(!p.TryCommitWave(model,shop) && p.SaveState=="retry","unconfirmed clear remains retryable");
            Check(p.Checkpoint.CompletedWave==0 && p.Wallet==wallet,"no optimistic bank or checkpoint");
            if(fault=="before")Check(store.Raw==original,"failed write preserves bytes");
            store.FailBeforeWrite=store.FailAfterWrite=store.FailReadback=false;
            Check(p.Retry() && p.Checkpoint.CompletedWave==1,"retry commits complete boundary");
            int paid=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),1).RepeatableSalvage;
            Check(p.Wallet==wallet+paid && !p.TryCommitWave(model,shop),"replayed clear cannot award twice");
            Check(p.Retry() && p.Wallet==wallet+paid,"repeated Retry cannot award twice");
            var reload=LastStandProgression.Load(store);
            Check(reload.Checkpoint.CompletedWave==1 && reload.Wallet==p.Wallet,"reload one complete banked boundary");
        }
        var conflictStore=Strong();var conflict=LastStandProgression.Load(conflictStore);conflict.TryDeploy();
        var m=conflict.Checkpoint.RestoreModel();var s=conflict.Checkpoint.RestoreShop();Clear(m,s);
        conflictStore.FailBeforeWrite=true;conflict.TryCommitWave(m,s);conflictStore.FailBeforeWrite=false;
        string external=conflictStore.Raw+" ";conflictStore.Raw=external;
        Check(!conflict.Retry() && conflict.SaveState=="blocked" && conflictStore.Raw==external,"changed preimage is preserved");
    }
    static void Rollback()
    {
        var store=Strong();var p=LastStandProgression.Load(store);p.TryDeploy();
        var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
        Clear(model,shop);Check(p.TryCommitWave(model,shop),"clear committed");
        var boundary=p.Checkpoint;int before=shop.Scrap;
        model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
        var purchase=shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,LastStandUpgradeTrackId.CannonAttack));
        Check(purchase.Accepted && shop.Scrap<before,"midwave purchase paid");model.ApplyShopProjection(shop);
        for(int i=0;i<30;i++)Step(model,shop);
        var restored=LastStandProgression.Load(store).Checkpoint;
        Check(restored.CompletedWave==1 && restored.Shop.Scrap==before && restored.Shop.RunPurchases[0]==0,"unfinished purchase and debit roll back together");
        var a=boundary.RestoreModel();var b=restored.RestoreModel();a.ContinueAfterCheckpoint();b.ContinueAfterCheckpoint();
        for(int i=0;i<1000 && !a.AwaitingWaveCommit;i++){a.Step();b.Step();}
        Check(a.Snapshot()==b.Snapshot(),"committed continuation is deterministic after reload");
        int baseline=restored.Encounter.CommittedCannonDamage;
        Check(p.TryPurchase(LastStandUpgradeTrackId.CannonCycle)==false,"at-cap utility cannot purchase");
        Check(p.Checkpoint.Encounter.CommittedCannonDamage==baseline,"checkpoint deployment stats remain frozen");
    }
    static void Milestones()
    {
        var store=Strong();var p=LastStandProgression.Load(store);p.TryDeploy();
        var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
        int wallet=p.Wallet,total=0;
        for(int wave=1;wave<=301;wave++)
        {
            Clear(model,shop);var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),wave);
            total+=reward.RepeatableSalvage+reward.FirstClearSalvage;
            Check(p.TryCommitWave(model,shop),"each sequential boundary commits");
            if(wave==100)Check(p.IsFittingUnlocked("scattergun") && p.SelectedFitting=="launcher","unlock does not auto-swap active fitting");
            if(wave==300)Check(p.TierTwoUnlocked && p.SelectedTier==1 && p.HasCheckpoint,"unlock is not promotion or ending");
            model.ContinueAfterCheckpoint();
        }
        Check(p.Wallet==wallet+total && p.GetBestWave(1)==301,"all clears bank exactly");
        int beforeEnd=p.Wallet;Check(p.TryFinalizeRun() && !p.HasCheckpoint && p.Wallet==beforeEnd,"finalize adds no death payout");
        p=LastStandProgression.Load(store);Check(!p.HasCheckpoint && p.TryDeploy(),"no zombie resume");
        model=p.Checkpoint.RestoreModel();shop=p.Checkpoint.RestoreShop();int repeated=0;
        for(int wave=1;wave<=100;wave++)
        { Clear(model,shop);repeated+=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),wave).RepeatableSalvage;Check(p.TryCommitWave(model,shop),"replay boundary");model.ContinueAfterCheckpoint(); }
        Check(p.Wallet==beforeEnd+repeated,"first-clear rewards stay once across runs");
        Check(LastStandProgression.Load(store).Checkpoint.CompletedWave==100,"milestone reload");
    }
    static void Invalid()
    {
        var store=Strong();var p=LastStandProgression.Load(store);p.TryDeploy();string good=store.Raw;
        foreach(string bad in new[]{good.Replace("\"version\":6","\"version\":99"),
            good.Replace(LastStandRunEdition.CurrentRulesVersion,"future-rules"),
            good.Replace("\"credits\":100000","\"credits\":2147483648"),
            good.Replace("\"credits\":100000","\"credits\":100000,\"credits\":2"),
            good.Replace("\"hull\":", "\"unknownHull\":"),
            good.Replace("\"scrap\":0","\"scrap\":1"),
            good.Replace("\"fitting\":0","\"fitting\":99")})
        {
            Check(bad!=good,"Invalid-save discriminator must alter its current fixture");
            store.Raw=bad;var invalid=LastStandProgression.Load(store);
            Check(invalid.SaveState=="blocked" && store.Raw==bad,"invalid/future data preserved");
        }
        store.Raw=good;Check(LastStandProgression.Load(store).SaveState=="ready","valid negative control");
    }
    static void Frozen()
    {
        var store=new Store();LastStandProgression.Load(store);
        var fixture=LastStandSaveJson.Read(store.Raw);fixture["credits"]=100;store.Raw=LastStandSaveJson.Write(fixture);
        var p=LastStandProgression.Load(store);Check(p.TryDeploy(),"initial checkpoint");
        Check(p.TryPurchase(LastStandUpgradeTrackId.CannonAttack) && p.CannonAttackLevel==1,"permanent purchase saved outside run baseline");
        Check(p.Checkpoint.Shop.PermanentLevels[0]==0 && p.Checkpoint.RestoreModel().CurrentCannonDamage==20,"existing run baseline frozen");
        p=LastStandProgression.Load(store);Check(p.CannonAttackLevel==1 && p.Checkpoint.RestoreModel().CurrentCannonDamage==20,"frozen baseline survives reload");
        Check(p.TryFinalizeRun() && p.TryDeploy() && p.Checkpoint.RestoreModel().CurrentCannonDamage==30,"new run receives new permanent level");
    }
    static void Late()
    {
        var store=Strong();var p=LastStandProgression.Load(store);p.TryDeploy();
        var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
        int largest=0;
        for(int wave=1;wave<=5001;wave++)
        {
            Clear(model,shop);Check(p.TryCommitWave(model,shop),"late boundary commit");largest=Math.Max(largest,store.Raw.Length);
            if(wave==300 || wave==1000 || wave==2000 || wave==5001)
            {
                var loaded=LastStandProgression.Load(store);
                Check(loaded.SaveState=="ready" && loaded.Checkpoint.CompletedWave==wave,"late checkpoint reload");
                Check(model.Snapshot()==loaded.Checkpoint.RestoreModel().Snapshot(),"late cooldown/counter parity");
            }
            model.ContinueAfterCheckpoint();
        }
        Check(largest<12000,"retained envelope has no per-wave or per-enemy history growth");
    }
    static void Mutual()
    {
        var store=Strong();var p=LastStandProgression.Load(store);p.TryDeploy();
        var m=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
        while(m.Kills<LastStandWaveCatalog.ForWave(1,1).EnemyCount-1)Step(m,shop);
        while(m.ActiveCount==0)Step(m,shop);
        foreach(var foe in m.Foes)if(foe.Alive){foe.Distance=0;foe.Hull=1;foe.Damage=int.MaxValue;}
        typeof(EncounterModel).GetField("<Hull>k__BackingField",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(m,1);
        typeof(EncounterModel).GetField("nextCannon",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(m,m.Tick);
        Step(m,shop);Check(m.AwaitingWaveCommit && m.Hull==0,"mutual terminal clear");int wallet=p.Wallet;
        Check(p.TryCommitWave(m,shop) && !p.HasCheckpoint && p.Wallet> wallet,"clear+death banks and finalizes atomically");
        Check(!LastStandProgression.Load(store).HasCheckpoint && !p.TryFinalizeRun(),"terminal cannot resurrect or refinalize");
    }
    static int Main(string[] args)
    {
        try { if (args[0] == "starting") Starting(); else if (args[0] == "migration") Migration();
            else if(args[0]=="faults")Faults();else if(args[0]=="rollback")Rollback();else if(args[0]=="milestones")Milestones();
            else if(args[0]=="invalid")Invalid();else if(args[0]=="mutual")Mutual();
            else if(args[0]=="frozen")Frozen();else if(args[0]=="late")Late();
            else throw new Exception("unknown case"); Console.WriteLine("PASS " + args[0]); return 0; }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
