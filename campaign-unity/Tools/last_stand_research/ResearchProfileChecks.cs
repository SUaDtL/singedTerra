using System;
using System.IO;
using System.Collections.Generic;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

static class ResearchProfileChecks
{
    const long Epoch = 1790000000000L;
    sealed class Store : ILastStandStorage, ILastStandStorageOwnership
    {
        public string Raw, Fault;
        public int Writes;
        public bool Owner = true;
        public bool CanWrite => Owner;
        bool readbackPending;
        public string Read()
        {
            if (Fault == "read" || readbackPending) { readbackPending = false; throw new Exception("read fault"); }
            return Raw;
        }
        public void Write(string value)
        {
            if (Fault == "before") throw new Exception("write fault");
            Raw = value; Writes++; readbackPending = Fault == "readback";
            if (Fault == "after") throw new Exception("unconfirmed write");
        }
    }
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static LastStandProgression Load(Store store) => LastStandProgression.Load(store, () => Epoch);
    static string Component(Store store, string key) => LastStandSaveJson.Write(LastStandSaveJson.Read(store.Raw)[key]);
    static long Carry(Store store) => LastStandSaveJson.LongInteger(LastStandSaveJson.Read(store.Raw)["recoveryRemainder"]);
    static void SetWallet(Store store, int amount)
    { var raw = LastStandSaveJson.Read(store.Raw); raw["credits"] = amount; store.Raw = LastStandSaveJson.Write(raw); }
    static Store Unlocked(int wave = 25, string economyVersion = null)
    {
        var store = new Store(); Check(Load(store).SaveState == "ready", "Seed profile");
        var raw = LastStandSaveJson.Read(store.Raw); raw["credits"] = 100000; raw["selectedFitting"] = "launcher";
        var levels = LastStandSaveJson.Object(raw["permanentLevels"]);
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            levels[track.Key] = track.Id == LastStandUpgradeTrackId.ScrapYield ? 0 : track.Id == LastStandUpgradeTrackId.CannonAttack ? 1000 : track.PermanentCap;
        store.Raw = LastStandSaveJson.Write(raw);
        var p = Load(store); Check(p.SaveState == "ready" && p.TryDeploy(), "Strong production cohort deploy");
        if(economyVersion!=null) {
            // A just-deployed empty ledger is valid under either eight-track
            // economy. Subsequent waves and purchases use that retained owner.
            store.Raw=store.Raw.Replace(LastStandUpgradeCatalog.EconomyVersion,economyVersion);
            p=Load(store);Check(p.SaveState=="ready","Retained economy seed loads");
        }
        var model = p.Checkpoint.RestoreModel(); var shop = p.Checkpoint.RestoreShop();
        for (int i = 1; i <= wave; i++)
        {
            Clear(model, shop); Check(p.TryCommitWave(model, shop), "Production unlock boundary " + i);
            if (i != wave) model.ContinueAfterCheckpoint();
        }
        Check(p.GetBestWave(1) == wave, "Unlock was earned via real clears"); return store;
    }
    static void Clear(EncounterModel model, LastStandShopState shop, int logistics = 0)
    {
        int budget = 30000;
        while (!model.AwaitingWaveCommit && model.Status == EncounterStatus.Running && budget-- > 0)
        { model.Step(); shop.ObserveAuthoritativeKills(model.Kills, model.Wave, logistics); }
        Check(model.AwaitingWaveCommit && model.Hull > 0, "Test cohort must clear alive");
    }
    static LastStandResearchIntent Intent(LastStandProgression p, LastStandResearchAction action, int slot = 0,
        LastStandResearchTrackId track = LastStandResearchTrackId.GameSpeed, int rank = 1)
    {
        var s = p.ResearchSnapshot;
        return new LastStandResearchIntent { Action = action, Slot = slot, Track = track, Rank = rank,
            ExpectedRevision = s.revision, ExpectedActiveIdentity = s.slots[slot].active?.identity ?? 0,
            ExpectedQueuedIdentity = s.slots[slot].queued?.identity ?? 0 };
    }
    static LastStandResearchTime Time(LastStandProgression p, long elapsed = 0)
    {
        var c = new LastStandResearchClock(p.ResearchSnapshot.lastObservedUtcMilliseconds); LastStandResearchTime time;
        Check(c.TrySample(p.ResearchSnapshot.lastObservedUtcMilliseconds + elapsed, 0, out time), "Clock sample"); return time;
    }
    static void Action(LastStandProgression p, LastStandResearchAction action, int slot = 0,
        LastStandResearchTrackId track = LastStandResearchTrackId.GameSpeed, int rank = 1)
    { Check(p.TryResearchAction(Intent(p, action, slot, track, rank), Time(p)), "Research action " + action + " " + track); }
    static void Fresh()
    {
        var store = new Store(); var p = Load(store); string raw = store.Raw;
        Check(p.SaveState == "ready" && LastStandSaveJson.Integer(LastStandSaveJson.Read(raw)["version"]) == 5, "Fresh v5 envelope");
        Check(p.Wallet == 0 && p.ResearchSnapshot.lastObservedUtcMilliseconds == Epoch && p.ResearchSnapshot.completionSequence == 0,
            "No invented funds or research on creation");
        Check(p.HistorySnapshot.Lifetime.Runs == 0 && !p.HasCheckpoint, "Fresh empty history");
        Check(Load(store).SaveState == "ready" && store.Raw == raw, "Reload does not mutate valid profile");
        Check(!p.TryResearchAction(Intent(p, LastStandResearchAction.Start), Time(p)) && raw == store.Raw, "Locked research is byte-identical noop");
        Check(p.TryDeploy() && p.HistorySnapshot.Current.RunId == p.ActiveRunId && p.Checkpoint.Shop.PermanentLevels.Count == 8,
            "New run gets eight-track economy and matching history");
        Check(Load(store).HasCheckpoint, "New checkpoint survives full readback");
    }
    static void RetainedEconomy()
    {
        var store=Unlocked(30,LastStandUpgradeCatalog.PreviousEconomyVersion);var p=Load(store);
        var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
        model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
        Check(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,LastStandUpgradeTrackId.CannonAttack,LastStandBulkQuantity.Ten)).Accepted,"Retained paid upgrade");
        model.ApplyShopProjection(shop);Clear(model,shop);Check(p.TryCommitWave(model,shop),"Retained paid boundary saved");
        string saved=store.Raw,snapshot=model.Snapshot();int writes=store.Writes;
        var reload=Load(store);var restored=reload.Checkpoint.RestoreShop();
        Check(reload.SaveState=="ready" && store.Raw==saved && store.Writes==writes,"Valid retained profile reload is byte-identical");
        Check(reload.Checkpoint.RestoreModel().Snapshot()==snapshot && restored.SpentScrap==shop.SpentScrap &&
            restored.EarnedScrap==shop.EarnedScrap && restored.Scrap==shop.Scrap &&
            restored.EconomyVersion==LastStandUpgradeCatalog.PreviousEconomyVersion,"Full reload preserves paid run and combat");
        Check(reload.HistorySnapshot.Current.EconomyVersion==restored.EconomyVersion,"History keeps retained economy");
        int before=restored.Scrap;restored.ObserveAuthoritativeKills(restored.UniqueKills+1,32,0);
        Check(restored.Scrap==before+3,"Retained future kill uses old income");
        Check(reload.TryFinalizeRun(null,"abandon") && reload.TryDeploy() &&
            reload.Checkpoint.Shop.EconomyVersion==LastStandUpgradeCatalog.EconomyVersion,"Only next deployment adopts new economy");
    }
    static void Legacy()
    {
        const string six = "\"cannonAttack\":3,\"launcherAttack\":2,\"hullCapacity\":1,\"armor\":2,\"cannonCycle\":3,\"fieldRepair\":1";
        string v1 = "{\"version\":1,\"credits\":7,\"permanentLevel\":2,\"nextRunId\":2,\"lastFinalizedRunId\":0,\"pendingDefeat\":{\"runId\":1,\"elapsedTicks\":80,\"kills\":2,\"reward\":1}}";
        string v2 = "{\"version\":2,\"credits\":12,\"permanentLevels\":{" + six + "},\"nextRunId\":2,\"lastFinalizedRunId\":0,\"pendingDefeat\":{\"runId\":1,\"elapsedTicks\":99,\"kills\":3,\"reward\":1}}";
        string v3 = "{\"version\":3,\"credits\":12,\"permanentLevels\":{" + six + "},\"nextRunId\":3,\"lastFinalizedRunId\":1,\"selectedTier\":2,\"tierRecords\":{\"tier-goals-v1\":{\"bestTicks1\":1500,\"bestKills1\":30,\"bestTicks2\":300,\"bestKills2\":4,\"tierTwoUnlocked\":true}},\"pendingDefeat\":{\"runId\":2,\"elapsedTicks\":300,\"kills\":4,\"reward\":1,\"tier\":2,\"profileVersion\":\"tier-goals-v1\",\"isLimit\":false,\"newBestTime\":true,\"newBestKills\":true,\"unlockedTierTwo\":false}}";
        foreach (string original in new[] { v1, v2, v3 })
        {
            var store = new Store { Raw = original, Fault = "before" }; var p = Load(store);
            Check(p.SaveState == "retry" && store.Raw == original, "Failed migration preserves exact legacy bytes");
            store.Fault = null; Check(p.Retry(), "Legacy migration retry");
            int originalWallet = original == v1 ? 7 : 12;
            Check(p.Wallet == originalWallet && p.PendingDefeat != null && p.GetPermanentLevel(LastStandUpgradeTrackId.ScrapYield) == 0, "Migration retains wallet and pending claim");
            Check(p.MaximumGameSpeed == 1 && p.ResearchSnapshot.completionSequence == 0 && p.GetBestWave(1) == 0 && p.HistorySnapshot.Lifetime.Runs == 0,
                "Legacy migration invents no waves, research, or farming samples");
            Check(p.TryClaim() && !p.TryClaim() && p.Wallet == originalWallet + 1, "Legacy claim once");
            Check(Load(store).SaveState == "ready" && Load(store).Wallet == originalWallet + 1, "Migrated v5 reload");
            if (original == v3) Check(p.SelectedTier == 2 && p.TierTwoUnlocked && p.GetBestTicks(1) == 1500, "Legacy tier and record retained");
        }
    }
    static void V4(string path, string snapshotPath)
    {
        string original = File.ReadAllText(path); var old = LastStandSaveJson.Read(original);
        var oldShop = LastStandSaveJson.Object(LastStandSaveJson.Object(old["checkpoint"])["shop"]);
        int spent = LastStandSaveJson.Integer(oldShop["spentScrap"]);
        foreach (string fault in new[] { "before", "after", "readback" })
        {
            var store = new Store { Raw = original, Fault = fault }; var p = Load(store);
            Check(p.SaveState == "retry", "v4 migration awaits confirmed write");
            if (fault == "before") Check(store.Raw == original, "v4 write failure preserves bytes");
            store.Fault = null; Check(p.Retry() && p.SaveState == "ready", "v4 migration retry");
            Check(p.Checkpoint.CompletedWave == 100 && p.Checkpoint.Shop.EconomyVersion == LastStandUpgradeCatalog.LegacyEconomyVersion &&
                p.Checkpoint.Shop.PermanentLevels.Count == 7 && p.Checkpoint.Shop.RunPurchases[0] == 13 && p.Checkpoint.Shop.SpentScrap == spent,
                "Old active run retains seven tracks and exact paid legacy prices");
            Check(p.Checkpoint.RestoreModel().Snapshot() == File.ReadAllText(snapshotPath), "Old combat state/projections unchanged");
            Check(p.HistorySnapshot.Current.SinceUpdate && p.HistorySnapshot.Current.HighestClearedWave == 100 && p.HistorySnapshot.Current.ActiveMilliseconds == 0,
                "Migrated run starts honest since-update history");
            Check(p.GetPermanentLevel(LastStandUpgradeTrackId.ScrapYield) == 0 && LastStandResearchCatalog.UnlockedSlots(p.GetBestWave(1)) == 2,
                "Profile adds eighth zero track and earned labs");
            Action(p, LastStandResearchAction.Start);
            var reload = Load(store); Check(reload.SaveState == "ready" && reload.Checkpoint.Shop.SpentScrap == spent && reload.Checkpoint.Shop.PermanentLevels.Count == 7,
                "Midrun research save retains legacy economy on v5 reload");
            Check(reload.TryFinalizeRun(null, "abandon") && reload.TryDeploy() && reload.Checkpoint.Shop.PermanentLevels.Count == 8 &&
                reload.Checkpoint.Shop.EconomyVersion == LastStandUpgradeCatalog.EconomyVersion, "Only new run adopts new economy");
        }
    }
    static void Faults()
    {
        string fixture = Unlocked().Raw;
        foreach (string operation in new[] { "start", "suspend", "complete" })
        foreach (string fault in new[] { "before", "after", "readback" })
        {
            var store = new Store { Raw = fixture }; var p = Load(store);
            if (operation != "start") Action(p, LastStandResearchAction.Start);
            int wallet = p.Wallet, callbacks = 0; long researchRevision = p.ResearchSnapshot.revision;
            string original = store.Raw;
            var c = new LastStandResearchClock(p.ResearchSnapshot.lastObservedUtcMilliseconds); LastStandResearchTime time;
            Check(c.TrySample(p.ResearchSnapshot.lastObservedUtcMilliseconds + (operation == "complete" ? 600000 : 0), 20, out time), "Fault clock sample");
            Action confirmed = () => { Check(c.Commit(time), "Only confirmed interval commits clock"); callbacks++; };
            store.Fault = fault;
            bool result = operation == "complete" ? p.TryReconcileResearch(time, confirmed) :
                p.TryResearchAction(Intent(p, operation == "start" ? LastStandResearchAction.Start : LastStandResearchAction.Suspend), time, confirmed);
            Check(!result && p.SaveState == "retry" && callbacks == 0, "Unconfirmed research operation awaits retry: " + operation + "/" + fault);
            Check(p.Wallet == wallet && p.ResearchSnapshot.revision == researchRevision && p.MaximumGameSpeed == 1, "No optimistic charge/refund/benefit");
            if (fault == "before") Check(store.Raw == original, "Before-write bytes preserved");
            store.Fault = null; Check(p.Retry() && callbacks == 1, "Retry commits operation exactly once");
            int expectedWallet = wallet + (operation == "start" ? -20 : operation == "suspend" ? 20 : 0);
            Check(p.Wallet == expectedWallet && p.MaximumGameSpeed == (operation == "complete" ? 1.5 : 1), "Confirmed wallet and benefits coherent");
            Check(p.Retry() && callbacks == 1 && p.Wallet == expectedWallet, "Repeated retry is idempotent");
            var reload = Load(store); Check(reload.SaveState == "ready" && reload.Wallet == expectedWallet && reload.MaximumGameSpeed == p.MaximumGameSpeed,
                "Fault result reloads as one envelope");
        }
    }
    static void Stale()
    {
        var store = Unlocked(); var p = Load(store); Action(p, LastStandResearchAction.Start);
        var stale = Intent(p, LastStandResearchAction.Suspend); int wallet = p.Wallet, callbacks = 0;
        Check(!p.TryResearchAction(stale, Time(p, 600000), () => callbacks++), "Due completion refuses stale cancel");
        Check(p.MaximumGameSpeed == 1.5 && p.Wallet == wallet && p.ResearchSnapshot.slots[0].active == null && callbacks == 1,
            "Completion commits before stale cancel without refund");
        string completed = store.Raw;
        Check(!p.TryResearchAction(stale, Time(p)) && store.Raw == completed, "Stale identity/revision cannot buy, refund, or write");
        Check(p.TryReconcileResearch(Time(p)) && p.ResearchSnapshot.completionSequence == 1 && p.Wallet == wallet, "Zero elapsed reconcile cannot repeat completion");
        var reload = Load(store); Check(reload.ResearchSnapshot.completionSequence == 1 && reload.MaximumGameSpeed == 1.5, "Completion durable");
    }
    static void Wallet()
    {
        string fixture = Unlocked().Raw;
        foreach (bool researchFirst in new[] { false, true })
        {
            var store = new Store { Raw = fixture }; var first = Load(store); var stale = Load(store);
            int wallet = first.Wallet; int cost = first.PermanentCost(LastStandUpgradeTrackId.ScrapYield);
            if (researchFirst) Action(first, LastStandResearchAction.Start);
            else Check(first.TryPurchase(LastStandUpgradeTrackId.ScrapYield), "First-tab workshop purchase");
            string accepted = store.Raw;
            bool result = researchFirst ? stale.TryPurchase(LastStandUpgradeTrackId.ScrapYield) :
                stale.TryResearchAction(Intent(stale, LastStandResearchAction.Start), Time(stale));
            Check(!result && stale.SaveState == "blocked" && store.Raw == accepted && stale.Wallet == wallet,
                "Second tab cannot overwrite shared wallet winner");
            Check(Load(store).Wallet == wallet - (researchFirst ? 20 : cost), "Exactly one wallet debit survives");
        }
        var local = new Store { Raw = fixture }; var owner = Load(local);
        int price = owner.PermanentCost(LastStandUpgradeTrackId.ScrapYield); SetWallet(local, price + 19); owner = Load(local);
        var intent = Intent(owner, LastStandResearchAction.Start); Check(owner.TryPurchase(LastStandUpgradeTrackId.ScrapYield), "Same-tab workshop debit");
        string after = local.Raw;
        Check(owner.Wallet == 19 && !owner.TryResearchAction(intent, Time(owner)) && local.Raw == after && owner.ResearchSnapshot.slots[0].active == null,
            "Research checks current shared funds after workshop purchase");
    }
    static void Ownership(string legacyPath)
    {
        foreach (string initial in new[] { (string)null, File.ReadAllText(legacyPath), Unlocked().Raw })
        {
            var store = new Store { Raw = initial, Owner = false }; var p = Load(store);
            Check(p.SaveState == "blocked" && store.Raw == initial && store.Writes == 0,
                "Nonowner cannot create, migrate, or mutate existing profile");
            store.Owner = true;
            Check(p.Retry() && p.SaveState == "ready", "Explicit ownership recovery admits original profile");
            Check(LastStandSaveJson.Integer(LastStandSaveJson.Read(store.Raw)["version"]) == 5,
                "Recovered owner uses current envelope without lost data");
        }
        var faultStore = Unlocked(); var owner = Load(faultStore); Action(owner, LastStandResearchAction.Start);
        var time = Time(owner, 600000); int callbacks = 0;
        faultStore.Fault = "after";
        Check(!owner.TryReconcileResearch(time, () => callbacks++) && owner.MaximumGameSpeed == 1,
            "Written but unconfirmed completion has no live benefit");
        string desired = faultStore.Raw; int writes = faultStore.Writes;
        faultStore.Owner = false; faultStore.Fault = null;
        Check(!owner.Retry() && owner.MaximumGameSpeed == 1 && callbacks == 0 && faultStore.Writes == writes && faultStore.Raw == desired,
            "Lost ownership cannot confirm pending benefits or rewrite another owner's profile");
        faultStore.Owner = true;
        Check(owner.Retry() && callbacks == 1 && owner.MaximumGameSpeed == 1.5 && faultStore.Writes == writes,
            "Recovered ownership confirms identical stored transaction once without extra write");
    }
    static void Checkpoint()
    {
        var store = Unlocked(); var p = Load(store); var model = p.Checkpoint.RestoreModel(); var shop = p.Checkpoint.RestoreShop();
        string boundary = Component(store, "checkpoint"), history = Component(store, "history");
        model.ContinueAfterCheckpoint(); shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
        var buy = shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId, shop.Version, LastStandUpgradeTrackId.CannonAttack));
        Check(buy.Accepted, "Unfinished wave has a temporary purchase"); model.ApplyShopProjection(shop);
        for (int n = 0; n < 10 && !model.AwaitingWaveCommit; n++) { model.Step(); shop.ObserveAuthoritativeKills(model.Kills, model.Wave, 0); }
        Check(model.Tick > p.Checkpoint.Encounter.Tick && shop.SpentScrap > p.Checkpoint.Shop.SpentScrap, "Live model diverges from last boundary");
        int wallet = p.Wallet; Action(p, LastStandResearchAction.Start);
        Check(Component(store, "checkpoint") == boundary && Component(store, "history") == history, "Research charge retains exact checkpoint and historical boundary");
        Check(p.TryReconcileResearch(Time(p, 600000)), "Midwave completion saves profile");
        var reload = Load(store);
        Check(reload.MaximumGameSpeed == 1.5 && reload.Wallet == wallet - 20 && Component(store, "checkpoint") == boundary && Component(store, "history") == history,
            "Midwave research completion survives while combat rolls back only unfinished wave");
        Check(reload.Checkpoint.Shop.SpentScrap == 0 && reload.Checkpoint.CompletedWave == 25, "Temporary purchase and Scrap rollback together");
    }
    static void CarryAndHistory()
    {
        var store = Unlocked(); var p = Load(store);
        Action(p, LastStandResearchAction.Start, 0, LastStandResearchTrackId.SalvageRecovery);
        Check(p.TryReconcileResearch(Time(p, LastStandResearchCatalog.Get(LastStandResearchTrackId.SalvageRecovery).BaseDurationMilliseconds(1))), "Recovery completes");
        Check(p.TryFinalizeRun(null, "abandon") && p.TryDeploy(), "Fresh repeated run for carry");
        var model = p.Checkpoint.RestoreModel(); var shop = p.Checkpoint.RestoreShop(); long expected = p.Wallet, bonuses = 0;
        for (int wave = 1; wave <= 50; wave++)
        {
            var live = new LastStandRunHistory(p.HistorySnapshot); live.AddActiveTime(60000, 1);
            Clear(model, shop); var reward = LastStandRewardCatalog.At(LastStandTierCatalog.Get(1), wave);
            int first = reward.Milestone != null && !p.HasFirstClear(reward.Milestone.Id) ? reward.FirstClearSalvage : 0;
            int bonus = wave == 50 ? 1 : 0; expected += reward.RepeatableSalvage + first + bonus; bonuses += bonus;
            if (wave == 50)
            {
                int before = p.Wallet; store.Fault = "after";
                Check(!p.TryCommitWave(model, shop, live) && p.Wallet == before && p.Checkpoint.CompletedWave == 49,
                    "Bonus boundary failure is not optimistic");
                store.Fault = null; Check(p.Retry(), "Bonus boundary retry");
            }
            else Check(p.TryCommitWave(model, shop, live), "Carry boundary " + wave);
            Check(p.Wallet == expected && Carry(store) == (wave * 2) % 100, "Fractional recovery persisted exactly at wave " + wave);
            Check(!p.TryCommitWave(model, shop, live) && p.Wallet == expected, "Duplicate wave has no extra payout");
            if (wave == 17) { p = Load(store); Check(p.SaveState == "ready" && Carry(store) == 34, "Fractional remainder reload"); }
            if (wave != 50) model.ContinueAfterCheckpoint();
        }
        Check(bonuses == 1 && p.HistorySnapshot.Current.ResearchBonusSalvage == 1 && p.HistorySnapshot.Current.RepeatableSalvage == 50,
            "History separates repeatable and fractional research bonus");
        Check(p.HistorySnapshot.Current.ActiveMilliseconds == 3000000 && p.TryFinalizeRun(null, "abandon"), "Terminal commits observed run duration");
        long total = p.HistorySnapshot.Lifetime.RepeatableSalvage; string terminal = store.Raw;
        Check(!p.TryFinalizeRun(null, "abandon") && store.Raw == terminal && p.HistorySnapshot.Lifetime.Runs == 2,
            "Duplicate finalization cannot add history twice");
        var loaded = Load(store); Check(loaded.SaveState == "ready" && !loaded.HasCheckpoint && loaded.HistorySnapshot.Lifetime.RepeatableSalvage == total &&
            loaded.HistorySnapshot.Lifetime.ResearchBonusSalvage == 1, "Terminal history and carry reload coherently");
    }
    static void UpgradeContexts()
    {
        var store = Unlocked(); var p = Load(store);
        string start = p.HistorySnapshot.Current.StartContext, prior = p.HistorySnapshot.Current.EndContext;
        Check(p.TryPurchase(LastStandUpgradeTrackId.ScrapYield), "Buy a future-deployment permanent upgrade");
        Check(p.ResearchContext() == prior, "Future permanent purchase cannot rewrite the active run's deployment context");
        var model = p.Checkpoint.RestoreModel(); var shop = p.Checkpoint.RestoreShop();
        model.ContinueAfterCheckpoint(); shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
        Check(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId, shop.Version, LastStandUpgradeTrackId.CannonAttack)).Accepted,
            "Temporary upgrade affects the current farming sample");
        model.ApplyShopProjection(shop); Clear(model, shop);
        var live = new LastStandRunHistory(p.HistorySnapshot); live.AddActiveTime(300000, 1);
        Check(p.TryCommitWave(model, shop, live), "Upgrade context and measurement commit with wave");
        string upgraded = p.HistorySnapshot.Current.EndContext;
        Check(upgraded != prior && p.HistorySnapshot.Current.StartContext == start,
            "History distinguishes actual temporary upgrades without changing starting context");
        Check(upgraded == p.ResearchContext() && upgraded.Length <= 256, "Bounded context describes the confirmed shop");
        Check(p.TryFinalizeRun(null, "abandon") && p.TryDeploy(), "Finish sample and deploy permanent upgrade");
        Check(p.HistorySnapshot.Current.StartContext != start, "New deployment records newly purchased permanent levels");
        live = new LastStandRunHistory(p.HistorySnapshot); live.AddActiveTime(300000, 1);
        Check(p.TryFinalizeRun(live, "abandon"), "Finish second observed sample");
        var history = new LastStandRunHistory(p.HistorySnapshot);
        Check(history.Compare(1).MixedContexts, "Farming comparison warns about different upgrade contexts");
        Check(Load(store).HistorySnapshot.Recent[0].EndContext == upgraded, "Upgrade summary survives production save roundtrip");

        store = Unlocked(); p = Load(store); shop = p.Checkpoint.RestoreShop();
        prior = p.HistorySnapshot.Current.EndContext;
        Check(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId, shop.Version, LastStandUpgradeTrackId.CannonAttack)).Accepted,
            "Unfinished wave has an observed temporary upgrade");
        string raw = store.Raw;
        var unrelated = new LastStandShopState(shop.RunId + 1, shop.Fitting, p.Checkpoint.Shop.PermanentLevels);
        Check(!p.TryFinalizeRun(null, "abandon", unrelated) && store.Raw == raw, "Unrelated shop cannot relabel or finalize run");
        int wallet = p.Wallet; store.Fault = "after";
        Check(!p.TryFinalizeRun(null, "abandon", shop) && p.HasCheckpoint, "Terminal context remains unconfirmed after write fault");
        store.Fault = null; Check(p.Retry(), "Confirm exact terminal context on retry");
        Check(p.HistorySnapshot.Recent[0].EndContext != prior && p.Wallet == wallet && !p.HasCheckpoint,
            "Terminal sample includes observed partial-wave upgrades without awarding uncleared wave rewards");
        Check(Load(store).HistorySnapshot.Recent[0].EndContext == p.HistorySnapshot.Recent[0].EndContext,
            "Partial-wave terminal context survives reload");
    }
    static int Main(string[] args)
    {
        try
        {
            switch (args[0])
            {
                case "fresh": Fresh(); break; case "retained-economy": RetainedEconomy(); break; case "legacy": Legacy(); break; case "v4": V4(args[1], args[2]); break;
                case "faults": Faults(); break; case "stale": Stale(); break; case "wallet": Wallet(); break;
                case "checkpoint": Checkpoint(); break; case "carry": CarryAndHistory(); break;
                case "contexts": UpgradeContexts(); break;
                case "ownership": Ownership(args[1]); break;
                default: throw new Exception("Unknown case");
            }
            Console.WriteLine("PASS " + args[0]); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
