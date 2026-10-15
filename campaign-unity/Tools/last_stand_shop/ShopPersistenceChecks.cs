using System;
using System.Collections.Generic;
using System.Reflection;
using SingedTerra.LastStand;

internal sealed class PersistenceStorage : ILastStandStorage
{
    public string Value;
    public bool FailWrite;
    public bool WriteThenFailRead;
    bool failNextRead;
    public int Writes;
    public string Read()
    {
        if (failNextRead) { failNextRead = false; throw new Exception("read failed"); }
        return Value;
    }
    public void Write(string value)
    {
        if (FailWrite) throw new Exception("write denied");
        Value = value;
        Writes++;
        if (WriteThenFailRead) { WriteThenFailRead = false; failNextRead = true; }
    }
}

// Controlled storage failures only: the economy and transaction owner are the
// compiled production LastStandProgression, never a replacement test model.
internal sealed class StorageFaultFixture : ILastStandStorage
{
    public string Value;
    public string Fault;
    public int Writes;
    public int Attempts;
    public string Intended;
    bool failRead, mismatchRead;
    public string Read()
    {
        if (failRead) { failRead = false; throw new Exception("verification read denied"); }
        if (mismatchRead) { mismatchRead = false; return "mismatching verification observation"; }
        return Value;
    }
    public void Write(string value)
    {
        Attempts++;
        Intended = value;
        if (Fault == "denied") throw new Exception("write denied");
        Writes++;
        Value = Fault == "corrupt" ? "external bytes after mismatching write" : value;
        if (Fault == "uncertain") failRead = true;
        if (Fault == "mismatch") mismatchRead = true;
        Fault = null;
    }
}

internal static class ShopPersistenceChecks
{
    static void Require(bool condition, string message)
    { if (!condition) throw new InvalidOperationException(message); }

    static string V1(int wallet, int level, int next, int finalized, string pending = "null")
    { return "{\"version\":1,\"credits\":" + wallet + ",\"permanentLevel\":" + level +
        ",\"nextRunId\":" + next + ",\"lastFinalizedRunId\":" + finalized + ",\"pendingDefeat\":" + pending + "}"; }

    static string V2(string levels, int wallet = 17, int next = 9, int finalized = 6, string pending = "null")
    { return "{\"version\":2,\"credits\":" + wallet + ",\"permanentLevels\":{" + levels +
        "},\"nextRunId\":" + next + ",\"lastFinalizedRunId\":" + finalized + ",\"pendingDefeat\":" + pending + "}"; }

    const string Levels = "\"cannonAttack\":3,\"launcherAttack\":2,\"hullCapacity\":1,\"armor\":0,\"cannonCycle\":3,\"fieldRepair\":2";
    const string Pending = "{\"runId\":8,\"elapsedTicks\":3600,\"kills\":2147483647,\"reward\":1}";

    static int Level(LastStandProgression model, LastStandUpgradeTrackId id)
    {
        // Missing new API is a behavioral assertion on the compiled baseline.
        var method = typeof(LastStandProgression).GetMethod("GetPermanentLevel", new[] { typeof(LastStandUpgradeTrackId) });
        Require(method != null, "Every saved catalog track must expose its actual permanent level.");
        return (int)method.Invoke(model, new object[] { id });
    }

    static void CheckEntitlements(LastStandProgression model, int wallet, int level, int next, int finalized, bool pending)
    {
        Require(model.Wallet == wallet && model.CannonAttackLevel == level && model.NextRunId == next &&
            model.FinalizedRunId == finalized, "Migration must preserve wallet, Cannon Attack and run IDs exactly.");
        Require((model.PendingDefeat != null) == pending, "Migration must preserve pending presence.");
        if (pending)
            Require(model.PendingDefeat.RunId == 8 && model.PendingDefeat.ElapsedTicks == 3600 &&
                model.PendingDefeat.Kills == int.MaxValue && model.PendingDefeat.Reward == 1,
                "Migration must preserve every pending defeat field.");
    }

    static void CheckV2(string value)
    {
        Require(value.StartsWith("{\"version\":2,"), "Valid v1 migration must write version 2 under the same key.");
        Require(value.Contains("\"permanentLevels\":{") && !value.Contains("\"permanentLevel\":"),
            "Version 2 must contain the six-track schema.");
        Require(!value.Contains("Scrap") && !value.Contains("runPurchases"), "Temporary state must never be persisted.");
    }

    static void MigrationExact()
    {
        Require(LastStandProgression.StorageKey == "singedTerra.lastStand.prototype.v1", "Migration must retain the storage key.");
        for (int p = 0; p <= 3; p++)
        {
            var store = new PersistenceStorage { Value = " \r\n" + V1(17, p, 9, 6) + "\t" };
            var model = LastStandProgression.Load(store);
            Require(model.SaveState == "ready", "Ordinary v1 migration must be ready after verified saving.");
            CheckEntitlements(model, 17, p, 9, 6, false);
            CheckV2(store.Value);
            Require(store.Writes == 1, "Migration must commit exactly once.");
            foreach (var track in LastStandUpgradeCatalog.Tracks)
                Require(Level(model, track.Id) == (track.Id == LastStandUpgradeTrackId.CannonAttack ? p : 0),
                    "Only Cannon Attack inherits v1 permanentLevel.");
            var restored = LastStandProgression.Load(store);
            CheckEntitlements(restored, 17, p, 9, 6, false);
            Require(store.Writes == 1 && restored.ActiveRunId == 0, "Reload must not rewrite or resume the old run.");
        }
        var pendingStore = new PersistenceStorage { Value = V1(17, 2, 9, 6, Pending) };
        var pendingModel = LastStandProgression.Load(pendingStore);
        CheckEntitlements(pendingModel, 17, 2, 9, 6, true);
        CheckV2(pendingStore.Value);
        Require(!pendingModel.TryDeploy() && !pendingModel.TryPurchase(), "Pending defeat must block destructive actions.");
        Require(pendingModel.TryClaim() && !pendingModel.TryClaim(), "Migrated pending reward must claim exactly once.");
        CheckEntitlements(LastStandProgression.Load(pendingStore), 18, 2, 9, 8, false);
        var claimedStore = new PersistenceStorage { Value = V1(19, 3, 9, 8) };
        var claimed = LastStandProgression.Load(claimedStore);
        CheckV2(claimedStore.Value);
        CheckEntitlements(claimed, 19, 3, 9, 8, false);
        Require(!claimed.TryClaim(), "Claimed old reward must remain claimed.");
        var maximumStore = new PersistenceStorage { Value = V1(int.MaxValue, 3, int.MaxValue, int.MaxValue - 1) };
        var maximum = LastStandProgression.Load(maximumStore);
        CheckEntitlements(maximum, int.MaxValue, 3, int.MaxValue, int.MaxValue - 1, false);
        Require(!maximum.TryDeploy(), "The existing run-ID integer exhaustion guard must remain.");

        string original = "\r\n " + V1(17, 2, 9, 6, Pending) + " \t";
        var denied = new PersistenceStorage { Value = original, FailWrite = true };
        var retry = LastStandProgression.Load(denied);
        Require(retry.SaveState == "retry" && denied.Value == original && denied.Writes == 0,
            "Denied migration must retain original whitespace-v1 bytes and retry state.");
        CheckEntitlements(retry, 17, 2, 9, 6, true);
        Require(!retry.TryDeploy() && !retry.TryPurchase() && !retry.TryClaim(), "Unconfirmed migration must disable actions.");
        denied.FailWrite = false;
        Require(retry.Retry(), "Retry must accept the exact retained whitespace-v1 conflict basis.");
        CheckV2(denied.Value);
        CheckEntitlements(retry, 17, 2, 9, 6, true);
        Require(retry.Retry() && denied.Writes == 1, "Successful migration retry must not write twice.");

        var changed = new PersistenceStorage { Value = original, FailWrite = true };
        var blocked = LastStandProgression.Load(changed);
        changed.FailWrite = false;
        string foreign = V1(18, 2, 9, 6, Pending);
        changed.Value = foreign;
        Require(!blocked.Retry() && blocked.SaveState == "blocked" && changed.Value == foreign && changed.Writes == 0,
            "Changed migration basis must block without overwriting foreign entitlements.");
        changed.Value = original;
        Require(blocked.Retry() && changed.Writes == 1, "The original candidate must remain recoverable.");
        CheckEntitlements(blocked, 17, 2, 9, 6, true);

        var uncertain = new PersistenceStorage { Value = original, WriteThenFailRead = true };
        var reconciled = LastStandProgression.Load(uncertain);
        Require(reconciled.SaveState == "retry" && uncertain.Writes == 1, "Migration read-back failure must remain retryable.");
        CheckEntitlements(reconciled, 17, 2, 9, 6, true);
        Require(reconciled.Retry() && reconciled.Retry() && uncertain.Writes == 1, "Exact staged v2 must reconcile once.");
        CheckEntitlements(reconciled, 17, 2, 9, 6, true);
    }

    static void Invalid(string value, string label)
    {
        var store = new PersistenceStorage { Value = value };
        var model = LastStandProgression.Load(store);
        Require(model.SaveState == "blocked" && !String.IsNullOrEmpty(model.SaveError), label + ": must block with a save error.");
        Require(!model.TryDeploy() && !model.TryClaim() && !model.TryPurchase() && !model.Retry(), label + ": no usable defaults.");
        Require(store.Value == value && store.Writes == 0, label + ": preserve original bytes without writing.");
    }

    static void StrictV2()
    {
        var freshStore = new PersistenceStorage();
        var fresh = LastStandProgression.Load(freshStore);
        Require(fresh.SaveState == "ready", "Fresh record must be ready after confirmation.");
        CheckV2(freshStore.Value);
        var valid = V2(Levels, pending: Pending);
        var store = new PersistenceStorage { Value = " \t" + valid + "\r\n" };
        var model = LastStandProgression.Load(store);
        Require(model.SaveState == "ready" && store.Writes == 0, "Valid v2 should read without rewriting.");
        CheckEntitlements(model, 17, 3, 9, 6, true);
        int[] expected = { 3, 2, 1, 0, 3, 2 };
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            Require(Level(model, track.Id) == expected[(int)track.Id], "V2 must preserve every independent track level.");
        Require(model.TryClaim() && !model.TryClaim(), "V2 pending reward must retain exactly-once Claim.");
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            Require(Level(LastStandProgression.Load(store), track.Id) == expected[(int)track.Id], "Claim must preserve all permanent tracks.");
        var reversed = new PersistenceStorage { Value = V2("\"fieldRepair\":2,\"cannonCycle\":3,\"armor\":0,\"hullCapacity\":1,\"launcherAttack\":2,\"cannonAttack\":3") };
        Require(LastStandProgression.Load(reversed).SaveState == "ready", "Six unique keys may be reordered.");
        string boundary = V2(Levels);
        var boundaryStore = new PersistenceStorage { Value = boundary.PadRight(2048, ' ') };
        Require(LastStandProgression.Load(boundaryStore).SaveState == "ready", "Exactly 2048 characters remains valid.");
        string oldBoundary = V1(1, 3, 1, 0);
        Require(LastStandProgression.Load(new PersistenceStorage { Value = oldBoundary.PadRight(2048, ' ') }).SaveState == "ready",
            "Exactly 2048-character v1 must migrate.");
        var invalid = new Dictionary<string, string>
        {
            { "oversized", boundary.PadRight(2049, ' ') }, { "truncated", valid.Substring(0, valid.Length - 1) },
            { "unsupported version", valid.Replace("\"version\":2", "\"version\":3") },
            { "leading zero version", valid.Replace("\"version\":2", "\"version\":02") },
            { "duplicate root field", valid.Replace("\"credits\":17", "\"credits\":17,\"credits\":17") },
            { "unknown root field", valid.Replace("\"credits\":17", "\"credits\":17,\"scrap\":0") },
            { "unknown track", valid.Replace("fieldRepair", "unknown") },
            { "duplicate track", valid.Replace("fieldRepair", "cannonAttack") },
            { "missing track", V2(Levels.Replace(",\"fieldRepair\":2", "")) },
            { "extra track", V2(Levels + ",\"unknown\":0") },
            { "out-of-range P", valid.Replace("\"cannonAttack\":3", "\"cannonAttack\":4") },
            { "negative P", valid.Replace("\"armor\":0", "\"armor\":-1") },
            { "fractional P", valid.Replace("\"armor\":0", "\"armor\":0.5") },
            { "leading zero P", valid.Replace("\"armor\":0", "\"armor\":00") },
            { "string P", valid.Replace("\"armor\":0", "\"armor\":\"0\"") },
            { "overflow wallet", valid.Replace("\"credits\":17", "\"credits\":2147483648") },
            { "negative wallet", valid.Replace("\"credits\":17", "\"credits\":-1") },
            { "fractional wallet", valid.Replace("\"credits\":17", "\"credits\":1.5") },
            { "zero next ID", V2(Levels, next: 0, finalized: 0) },
            { "finalized reaches next ID", V2(Levels, next: 9, finalized: 9) },
            { "stale pending", valid.Replace("\"runId\":8", "\"runId\":7") },
            { "already finalized pending", V2(Levels, finalized: 8, pending: Pending) },
            { "zero pending ID", valid.Replace("\"runId\":8", "\"runId\":0") },
            { "wrong reward", valid.Replace("\"reward\":1", "\"reward\":2") },
            { "negative ticks", valid.Replace("\"elapsedTicks\":3600", "\"elapsedTicks\":-1") },
            { "overflow ticks", valid.Replace("\"elapsedTicks\":3600", "\"elapsedTicks\":2147483648") },
            { "overflow kills", valid.Replace("\"kills\":2147483647", "\"kills\":2147483648") },
            { "unknown pending field", valid.Replace("\"reward\":1", "\"reward\":1,\"extra\":0") },
            { "duplicate pending field", valid.Replace("\"reward\":1", "\"reward\":1,\"reward\":1") },
            { "invalid whitespace", valid + "\v" }, { "v2 old schema", V1(1, 0, 1, 0).Replace("\"version\":1", "\"version\":2") },
            { "v1 new schema", valid.Replace("\"version\":2", "\"version\":1") },
            { "v1 P cap", V1(1, 4, 1, 0) }, { "v1 overflow wallet", V1(1, 0, 1, 0).Replace("\"credits\":1", "\"credits\":2147483648") },
            { "v1 finalized invariant", V1(1, 0, 2, 2) }, { "v1 stale pending", V1(1, 0, 10, 6, Pending) },
            { "v1 duplicate", V1(1, 0, 1, 0).Replace("\"permanentLevel\":0", "\"permanentLevel\":0,\"permanentLevel\":0") },
            { "v1 oversized", oldBoundary.PadRight(2049, ' ') }, { "empty", "" }, { "garbage", "invalid" }
        };
        foreach (var entry in invalid) Invalid(entry.Value, entry.Key);
    }

    static bool Purchase(LastStandProgression model, LastStandUpgradeTrackId id)
    {
        var method = typeof(LastStandProgression).GetMethod("TryPurchase", new[] { typeof(LastStandUpgradeTrackId) });
        Require(method != null, "Every catalog track must support the typed permanent purchase entry.");
        return (bool)method.Invoke(model, new object[] { id });
    }

    static string SavedLevels(int[] values)
    {
        var fields = new List<string>();
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            fields.Add("\"" + track.Key + "\":" + values[(int)track.Id]);
        return String.Join(",", fields);
    }

    static int[] PermanentLevels(LastStandProgression model)
    {
        var values = new int[LastStandUpgradeCatalog.Tracks.Count];
        foreach (var track in LastStandUpgradeCatalog.Tracks) values[(int)track.Id] = Level(model, track.Id);
        return values;
    }

    static void CheckLevels(LastStandProgression model, int[] expected)
    {
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            Require(Level(model, track.Id) == expected[(int)track.Id],
                "Purchase must increment only the selected permanent track.");
    }

    static void PermanentAllTracks()
    {
        var expected = new int[6];
        var store = new PersistenceStorage { Value = V2(SavedLevels(expected), wallet: 36) };
        var model = LastStandProgression.Load(store);
        int wallet = 36;
        int[] prices = { 1, 2, 3 };
        foreach (var track in LastStandUpgradeCatalog.Tracks)
        {
            foreach (int price in prices)
            {
                int writes = store.Writes;
                Require(Purchase(model, track.Id), "Available track must accept its next permanent level.");
                wallet -= price;
                expected[(int)track.Id]++;
                Require(model.Wallet == wallet && store.Writes == writes + 1 && model.SaveState == "ready",
                    "Each permanent purchase must charge its exact 1/2/3 Salvage price and commit once.");
                CheckLevels(model, expected);
                CheckV2(store.Value);
                model = LastStandProgression.Load(store);
                Require(model.Wallet == wallet && store.Writes == writes + 1 && model.ActiveRunId == 0 &&
                    model.PendingDefeat == null && model.NextRunId == 9 && model.FinalizedRunId == 6,
                    "Reload must retain purchases and run entitlements without another write.");
                CheckLevels(model, expected);
            }
            string before = store.Value;
            int beforeWrites = store.Writes;
            Require(!Purchase(model, track.Id) && store.Value == before && store.Writes == beforeWrites && model.Wallet == wallet,
                "Capped track must refuse without charge, level or save mutation.");
            CheckLevels(model, expected);
        }
        Require(wallet == 0 && model.CannonAttackLevel == 3 && model.CannonDamage == 50 && model.NextCost == 0,
            "All six independent investments total 36 Salvage and preserve Cannon Attack compatibility.");
        foreach (var track in LastStandUpgradeCatalog.Tracks)
        {
            for (int p = 0; p <= 2; p++)
            {
                var levels = new int[6];
                levels[(int)track.Id] = p;
                var poorStore = new PersistenceStorage { Value = V2(SavedLevels(levels), wallet: p) };
                var poor = LastStandProgression.Load(poorStore);
                string before = poorStore.Value;
                Require(!Purchase(poor, track.Id) && poorStore.Value == before && poorStore.Writes == 0 && poor.Wallet == p,
                    "Insufficient Salvage must refuse without charge, level or save mutation.");
                CheckLevels(poor, levels);
            }
        }
        foreach (int unknown in new[] { -1, 6, int.MaxValue })
        {
            string before = store.Value;
            int writes = store.Writes;
            Require(!Purchase(model, (LastStandUpgradeTrackId)unknown) && store.Value == before &&
                store.Writes == writes && model.Wallet == 0, "Unknown track must refuse without mutation or exception.");
            CheckLevels(model, expected);
        }
        var maximumStore = new PersistenceStorage { Value = V2(SavedLevels(new int[6]), wallet: int.MaxValue) };
        var maximum = LastStandProgression.Load(maximumStore);
        Require(Purchase(maximum, LastStandUpgradeTrackId.Armor) && maximum.Wallet == int.MaxValue - 1,
            "A bounded permanent debit must preserve maximum-integer wallets.");
        var compatibilityStore = new PersistenceStorage { Value = V2(SavedLevels(new int[6]), wallet: 6) };
        var compatibility = LastStandProgression.Load(compatibilityStore);
        for (int p = 1; p <= 3; p++)
            Require(compatibility.TryPurchase() && compatibility.CannonAttackLevel == p &&
                compatibility.CannonDamage == 20 + 10 * p, "The parameterless Cannon Attack entry must remain compatible.");
        Require(!compatibility.TryPurchase() && compatibility.Wallet == 0, "Compatibility purchase must retain the cap.");
    }

    static void PermanentBoundaries()
    {
        foreach (var track in LastStandUpgradeCatalog.Tracks)
        {
            var store = new PersistenceStorage { Value = V2(SavedLevels(new int[6]), wallet: 36) };
            var model = LastStandProgression.Load(store);
            Require(model.TryDeploy() && model.CannonDamage == 20, "Existing deployment must retain frozen Cannon Attack damage.");
            string before = store.Value;
            int writes = store.Writes;
            int active = model.ActiveRunId;
            Require(!Purchase(model, track.Id) && store.Value == before && store.Writes == writes &&
                model.Wallet == 36 && model.ActiveRunId == active && model.CannonDamage == 20 && Level(model, track.Id) == 0,
                "Active run must refuse every permanent purchase without mutation.");
            model.AbandonRun();
            store.FailWrite = true;
            Require(!Purchase(model, track.Id) && model.SaveState == "retry" && store.Value == before &&
                store.Writes == writes && model.Wallet == 36 && Level(model, track.Id) == 0,
                "Unconfirmed permanent write must publish neither debit nor level.");
            Require(!Purchase(model, track.Id), "A staged unconfirmed purchase must disable new purchases.");
            store.FailWrite = false;
            Require(model.Retry() && model.Retry() && store.Writes == writes + 1 && model.Wallet == 35 && Level(model, track.Id) == 1,
                "Existing verified retry must commit the exact selected purchase once.");

            var pendingStore = new PersistenceStorage { Value = V2(SavedLevels(new int[6]), wallet: 36, pending: Pending) };
            var pending = LastStandProgression.Load(pendingStore);
            before = pendingStore.Value;
            Require(!Purchase(pending, track.Id) && pendingStore.Value == before && pendingStore.Writes == 0 &&
                pending.Wallet == 36 && Level(pending, track.Id) == 0 && pending.PendingDefeat.RunId == 8,
                "Pending reward must refuse every permanent purchase without mutation.");
            Require(pending.TryClaim() && !pending.TryClaim() && Purchase(pending, track.Id) && pending.Wallet == 36,
                "Only after exactly-once Claim may the selected permanent purchase commit.");
            CheckEntitlements(LastStandProgression.Load(pendingStore), 36,
                track.Id == LastStandUpgradeTrackId.CannonAttack ? 1 : 0, 9, 8, false);
        }
        foreach (var fitting in new[] { LastStandFitting.Launcher, LastStandFitting.Repair })
        {
            var store = new PersistenceStorage { Value = V2(SavedLevels(new int[6]), wallet: 36) };
            var model = LastStandProgression.Load(store);
            var frozen = new LastStandShopState(1, fitting, PermanentLevels(model));
            foreach (var track in LastStandUpgradeCatalog.Tracks)
                Require(Purchase(model, track.Id), "Both fitting roles retain investment even when currently incompatible.");
            var restored = LastStandProgression.Load(store);
            var future = new LastStandShopState(2, fitting, PermanentLevels(restored));
            var changedFitting = new LastStandShopState(3,
                fitting == LastStandFitting.Launcher ? LastStandFitting.Repair : LastStandFitting.Launcher, PermanentLevels(restored));
            foreach (var track in LastStandUpgradeCatalog.Tracks)
            {
                Require(frozen.GetTrack(track.Id).PermanentLevel == 0 && frozen.GetTrack(track.Id).RunPurchases == 0 &&
                    future.GetTrack(track.Id).PermanentLevel == 1 && future.GetTrack(track.Id).RunPurchases == 0 &&
                    changedFitting.GetTrack(track.Id).PermanentLevel == 1,
                    "Saved investment must affect only a future frozen baseline and survive fitting changes.");
                Require(future.GetTrack(track.Id).IsEligible == track.IsEligible(fitting),
                    "Permanent investment must preserve each fitting's existing effect eligibility.");
            }
            Require(frozen.Scrap == 0 && future.Scrap == 0 && changedFitting.Scrap == 0 && model.Wallet == 30,
                "Permanent Salvage purchases must never create temporary Scrap.");
            Require(model.TryDeploy() && model.CannonDamage == 30, "The next existing deployment must use committed Cannon Attack.");
        }
        var blockedStore = new PersistenceStorage { Value = "invalid" };
        var blocked = LastStandProgression.Load(blockedStore);
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            Require(!Purchase(blocked, track.Id) && blockedStore.Value == "invalid" && blockedStore.Writes == 0,
                "Invalid saved data must not permit typed permanent purchases.");
    }

    sealed class StorageTransaction
    {
        public string Kind, Original, Desired, Before;
        public StorageFaultFixture Store;
        public LastStandProgression Model;
        public LastStandUpgradeTrackId Track;
        public int WritesBefore;
    }

    static string Observation(LastStandProgression model)
    {
        var pending = model.PendingDefeat;
        return model.Wallet + ";" + SavedLevels(PermanentLevels(model)) + ";" + model.NextRunId + ";" +
            model.FinalizedRunId + ";" + (pending == null ? "none" : pending.RunId + "," + pending.ElapsedTicks +
            "," + pending.Kills + "," + pending.Reward) + ";" + model.ActiveRunId + ";" + model.CannonDamage;
    }

    static StorageTransaction BeginTransaction(string kind, string fault, LastStandUpgradeTrackId track = LastStandUpgradeTrackId.Armor)
    {
        int[] levels = { 1, 2, 0, 1, 0, 2 };
        var transaction = new StorageTransaction { Kind = kind, Track = track, Store = new StorageFaultFixture() };
        var store = transaction.Store;
        if (kind == "migration")
        {
            transaction.Original = " \r\n" + V1(17, 2, 9, 6, Pending) + "\t ";
            transaction.Desired = V2(SavedLevels(new[] { 2, 0, 0, 0, 0, 0 }), pending: Pending);
            store.Value = transaction.Original;
            store.Fault = fault;
            transaction.Model = LastStandProgression.Load(store);
            transaction.Before = Observation(transaction.Model);
            return transaction;
        }
        store.Value = " \r\n" + V2(SavedLevels(levels), pending: kind == "claim" ? Pending : "null") + "\t ";
        var model = LastStandProgression.Load(store);
        transaction.Model = model;
        Require(model.SaveState == "ready" && store.Writes == 0, "Transaction fixture must load confirmed v2 without a write.");
        if (kind == "defeat") Require(model.TryDeploy(), "Defeat fixture must reserve its actual run first.");
        transaction.Original = store.Value;
        transaction.WritesBefore = store.Writes;
        transaction.Before = Observation(model);
        store.Fault = fault;
        bool accepted;
        if (kind == "purchase")
        {
            int cost = levels[(int)track] + 1;
            levels[(int)track]++;
            transaction.Desired = V2(SavedLevels(levels), wallet: 17 - cost);
            accepted = Purchase(model, track);
        }
        else if (kind == "reservation")
        {
            transaction.Desired = V2(SavedLevels(levels), next: 10);
            accepted = model.TryDeploy();
        }
        else if (kind == "defeat")
        {
            transaction.Desired = V2(SavedLevels(levels), next: 10,
                pending: "{\"runId\":9,\"elapsedTicks\":42,\"kills\":3,\"reward\":1}");
            accepted = model.TryStageDefeat(42, 3);
        }
        else if (kind == "claim")
        {
            transaction.Desired = V2(SavedLevels(levels), wallet: 18, finalized: 8);
            accepted = model.TryClaim();
        }
        else throw new InvalidOperationException("Unknown storage transaction fixture.");
        Require(!accepted, kind + ": injected unconfirmed write must report refusal.");
        return transaction;
    }

    static void CheckUnconfirmed(StorageTransaction transaction)
    {
        var model = transaction.Model;
        Require(model.SaveState == "retry" && !String.IsNullOrEmpty(model.SaveError),
            transaction.Kind + ": unconfirmed write must show an honest retry/save error.");
        Require(Observation(model) == transaction.Before,
            transaction.Kind + ": unconfirmed write must preserve published entitlements and after-commit lifecycle.");
        Require(!model.TryDeploy() && !model.TryStageDefeat(42, 3) && !model.TryClaim(),
            transaction.Kind + ": unconfirmed candidate must disable new destructive actions.");
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            Require(!Purchase(model, track.Id), transaction.Kind + ": unconfirmed candidate must disable every permanent purchase.");
        Require(Observation(model) == transaction.Before,
            transaction.Kind + ": repeated refused actions must not mutate the retained candidate or committed state.");
    }

    static void CheckRecovered(StorageTransaction transaction, int successfulWrites)
    {
        var model = transaction.Model;
        var store = transaction.Store;
        Require(model.Retry() && model.SaveState == "ready" && model.SaveError == null,
            transaction.Kind + ": legitimate recovery must confirm the exact staged transaction.");
        Require(store.Value == transaction.Desired && store.Writes == transaction.WritesBefore + successfulWrites,
            transaction.Kind + ": recovery must preserve exact candidate bytes and perform only one successful write.");
        var restored = LastStandProgression.Load(store);
        Require(restored.SaveState == "ready" && restored.ActiveRunId == 0,
            transaction.Kind + ": confirmed reload must not resume a run.");
        Require(model.Wallet == restored.Wallet && model.NextRunId == restored.NextRunId &&
            model.FinalizedRunId == restored.FinalizedRunId && SavedLevels(PermanentLevels(model)) == SavedLevels(PermanentLevels(restored)),
            transaction.Kind + ": committed entitlements must equal the exact saved record after recovery.");
        Require((model.PendingDefeat == null) == (restored.PendingDefeat == null),
            transaction.Kind + ": recovery must publish pending presence only after confirmation.");
        if (model.PendingDefeat != null)
            Require(model.PendingDefeat.RunId == restored.PendingDefeat.RunId &&
                model.PendingDefeat.ElapsedTicks == restored.PendingDefeat.ElapsedTicks && model.PendingDefeat.Kills == restored.PendingDefeat.Kills,
                transaction.Kind + ": recovery must preserve every staged pending field.");
        Require(model.ActiveRunId == (transaction.Kind == "reservation" ? 9 : 0),
            transaction.Kind + ": after-commit lifecycle must execute at confirmation exactly once.");
        string confirmed = Observation(model);
        int writes = store.Writes;
        Require(model.Retry() && model.Retry() && Observation(model) == confirmed && store.Writes == writes,
            transaction.Kind + ": repeated recovery must not debit, award, reserve or write again.");
        if (transaction.Kind == "claim")
            Require(!model.TryClaim() && !restored.TryClaim() && model.Wallet == 18 && model.FinalizedRunId == 8 && store.Writes == writes,
                "Recovered Claim must consume the one pending Salvage exactly once across reload.");
    }

    static IEnumerable<StorageTransaction> FaultTransactions(string fault)
    {
        foreach (string kind in new[] { "migration", "reservation", "defeat", "claim" })
            yield return BeginTransaction(kind, fault);
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            yield return BeginTransaction("purchase", fault, track.Id);
    }

    static void StorageRetry()
    {
        foreach (string fault in new[] { "denied", "uncertain", "mismatch" })
        {
            foreach (var transaction in FaultTransactions(fault))
            {
                CheckUnconfirmed(transaction);
                Require(transaction.Store.Intended == transaction.Desired,
                    transaction.Kind + ": failure must retain the exact intended candidate rather than calculate another debit.");
                Require(transaction.Store.Value == (fault == "denied" ? transaction.Original : transaction.Desired),
                    transaction.Kind + ": failed confirmation must retain original or uncertain written bytes.");
                if (fault == "denied")
                {
                    Require(!transaction.Model.Retry() && transaction.Store.Writes == transaction.WritesBefore &&
                        transaction.Store.Value == transaction.Original,
                        transaction.Kind + ": repeated denied retry must preserve original bytes without publishing.");
                    CheckUnconfirmed(transaction);
                    transaction.Store.Fault = null;
                }
                CheckRecovered(transaction, 1);
            }
        }
    }

    static void StorageConflicts()
    {
        foreach (string fault in new[] { "denied", "uncertain", "corrupt" })
        {
            foreach (var transaction in FaultTransactions(fault))
            {
                CheckUnconfirmed(transaction);
                var store = transaction.Store;
                string foreign = fault == "corrupt" ? store.Value : transaction.Kind == "migration"
                    ? transaction.Original + " " : transaction.Original.Replace("\"credits\":17", "\"credits\":18");
                store.Value = foreign;
                store.Fault = null;
                int writes = store.Writes;
                for (int attempt = 0; attempt < 2; attempt++)
                {
                    Require(!transaction.Model.Retry() && transaction.Model.SaveState == "blocked" &&
                        !String.IsNullOrEmpty(transaction.Model.SaveError) && store.Value == foreign && store.Writes == writes,
                        transaction.Kind + ": external conflict must retain exact foreign bytes and never overwrite them.");
                    Require(Observation(transaction.Model) == transaction.Before && !transaction.Model.TryDeploy() &&
                        !transaction.Model.TryClaim() && !Purchase(transaction.Model, transaction.Track),
                        transaction.Kind + ": conflict must retain old published state and disable new destructive actions.");
                }
                // Legitimate repair restores the exact original bytes after denial,
                // or the exact already-written candidate after uncertain/corrupt write.
                store.Value = fault == "denied" ? transaction.Original : transaction.Desired;
                CheckRecovered(transaction, 1);
            }
        }
    }

    static void StorageRewards()
    {
        foreach (var fitting in new[] { LastStandFitting.Launcher, LastStandFitting.Repair })
        {
            foreach (string fault in new[] { "denied", "uncertain", "mismatch" })
            {
                var store = new StorageFaultFixture { Value = V2(SavedLevels(new int[6]), wallet: 0, next: 1, finalized: 0) };
                var model = LastStandProgression.Load(store);
                Require(model.TryDeploy(), "Reward fixture must reserve a confirmed run.");
                var ledger = new LastStandShopState(model.ActiveRunId, fitting, PermanentLevels(model));
                ledger.ObserveAuthoritativeKills(2);
                Require(ledger.Scrap == 6 && model.Wallet == 0, "Actual Scrap income must not grant Salvage.");
                var intent = new LastStandShopPurchaseIntent(ledger.RunId, ledger.Version, LastStandUpgradeTrackId.CannonAttack);
                Require(ledger.TryPurchase(intent).Accepted && ledger.Scrap == 1 && model.Wallet == 0,
                    "Temporary spending must not become Salvage or a permanent debit.");
                store.Fault = fault;
                Require(!model.TryStageDefeat(42, 2) && model.SaveState == "retry" && model.PendingDefeat == null &&
                    model.ActiveRunId == 1 && model.Wallet == 0,
                    "Unconfirmed defeat must not publish a reward or its after-commit lifecycle.");
                Require(!model.TryStageDefeat(42, 2) && !model.TryClaim(), "Repeated terminal callbacks cannot replace the staged defeat or auto-Claim.");
                var defeatReload = LastStandProgression.Load(store);
                Require(defeatReload.Wallet == 0 && defeatReload.ActiveRunId == 0 &&
                    (defeatReload.PendingDefeat != null) == (fault != "denied"),
                    "Reload after unconfirmed defeat must read actual persisted bytes without resuming or auto-Claiming.");
                store.Fault = null;
                Require(model.Retry() && model.Retry() && model.ActiveRunId == 0 && model.Wallet == 0 &&
                    model.PendingDefeat.RunId == 1 && model.PendingDefeat.ElapsedTicks == 42 && model.PendingDefeat.Kills == 2,
                    "Confirmed ordinary defeat must stage one pending reward without auto-Claim.");
                Require(!model.TryStageDefeat(42, 2), "Duplicate confirmed defeat must not stage another reward.");
                model = LastStandProgression.Load(store);
                Require(model.Wallet == 0 && model.PendingDefeat.Reward == 1 && !model.TryDeploy(),
                    "Reload must preserve one unclaimed ordinary-defeat reward.");
                store.Fault = fault;
                Require(!model.TryClaim() && model.Wallet == 0 && model.PendingDefeat != null &&
                    model.FinalizedRunId == 0 && model.SaveState == "retry",
                    "Unconfirmed manual Claim must retain the reward and publish no award.");
                Require(!model.TryClaim() && !model.TryDeploy(), "Repeated Claim cannot queue a second award or automatic deployment.");
                var claimReload = LastStandProgression.Load(store);
                Require(claimReload.Wallet == (fault == "denied" ? 0 : 1) &&
                    (claimReload.PendingDefeat != null) == (fault == "denied") &&
                    claimReload.FinalizedRunId == (fault == "denied" ? 0 : 1),
                    "Reload after unconfirmed Claim must preserve the actual written award or still-pending original.");
                if (fault != "denied")
                    Require(!claimReload.TryClaim(), "An uncertain but written Claim must already be consumed on reload.");
                store.Fault = null;
                Require(model.Retry() && model.Retry() && model.Wallet == 1 && model.PendingDefeat == null &&
                    model.FinalizedRunId == 1 && !model.TryClaim(), "Manual Claim recovery must consume one reward exactly once.");
                int writes = store.Writes;
                var restored = LastStandProgression.Load(store);
                Require(restored.Wallet == 1 && restored.PendingDefeat == null && restored.FinalizedRunId == 1 &&
                    !restored.TryClaim() && restored.Retry() && store.Writes == writes,
                    "Reload and result refresh must never award the consumed reward again.");
                Require(store.Writes == 3, "Reservation, defeat and Claim must each have exactly one successful write.");
            }
            {
                var store = new StorageFaultFixture { Value = V2(SavedLevels(new int[6]), wallet: 0, next: 1, finalized: 0) };
                var model = LastStandProgression.Load(store);
                Require(model.TryDeploy(), "Non-defeat fixture must reserve a confirmed run.");
                Require(!model.TryStageNonDefeat() && model.ActiveRunId == 0 && model.PendingDefeat == null &&
                    model.Wallet == 0 && !model.TryClaim() && store.Writes == 1,
                    "The existing non-defeat persistence entry must remain non-awarding.");
                var restored = LastStandProgression.Load(store);
                Require(restored.Wallet == 0 && restored.PendingDefeat == null && !restored.TryClaim(),
                    "Non-defeat reload cannot manufacture a pending reward.");
            }
        }
    }

    static int Main(string[] args)
    {
        try
        {
            if (args[0] == "migration_exact_v1_wallet_run_and_pending") MigrationExact();
            else if (args[0] == "migration_strict_v2_and_invalid_records") StrictV2();
            else if (args[0] == "permanent_all_tracks_prices_caps_and_reload") PermanentAllTracks();
            else if (args[0] == "permanent_run_pending_and_fitting_boundaries") PermanentBoundaries();
            else if (args[0] == "storage_denied_and_uncertain_write_retry") StorageRetry();
            else if (args[0] == "storage_external_conflict_preserves_original") StorageConflicts();
            else if (args[0] == "storage_reward_claim_idempotence") StorageRewards();
            else throw new InvalidOperationException("Unknown check.");
            Console.WriteLine("PASS " + args[0]);
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine("FAIL " + args[0] + ": " + error.Message); return 1; }
    }
}
