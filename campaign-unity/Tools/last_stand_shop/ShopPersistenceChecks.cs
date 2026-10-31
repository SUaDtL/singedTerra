using System;
using System.Collections.Generic;
using System.Reflection;
using SingedTerra.Encounter;
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

    // Historical six-track tier-goal bytes remain a migration fixture.
    static string V3(string levels, int wallet = 17, int next = 9, int finalized = 6,
        string pending = "null", int admittedTicks = 0, int admittedKills = 0)
    {
        bool admitted = admittedTicks != 0 || admittedKills != 0;
        if (pending != "null") pending = pending.Substring(0,pending.Length-1) +
            ",\"tier\":" + (admitted ? 1 : 0) + ",\"profileVersion\":\"" +
            (admitted ? LastStandTierCatalog.ProfileVersion : "") + "\",\"isLimit\":false," +
            "\"newBestTime\":" + (admittedTicks > 0 ? "true" : "false") +
            ",\"newBestKills\":" + (admittedKills > 0 ? "true" : "false") + ",\"unlockedTierTwo\":false}";
        return "{\"version\":3,\"credits\":" + wallet + ",\"permanentLevels\":{" + levels +
            "},\"nextRunId\":" + next + ",\"lastFinalizedRunId\":" + finalized +
            ",\"selectedTier\":1,\"tierRecords\":{\"" + LastStandTierCatalog.ProfileVersion + "\":{" +
            "\"bestTicks1\":" + admittedTicks + ",\"bestKills1\":" + admittedKills +
            ",\"bestTicks2\":0,\"bestKills2\":0,\"tierTwoUnlocked\":false}},\"pendingDefeat\":" + pending + "}";
    }

    const string Levels = "\"cannonAttack\":3,\"launcherAttack\":2,\"hullCapacity\":1,\"armor\":0,\"cannonCycle\":3,\"fieldRepair\":2";
    const string Pending = "{\"runId\":8,\"elapsedTicks\":3600,\"kills\":2147483647,\"reward\":1}";

    static string V4(string levels, int wallet = 17, int next = 9, int finalized = 6, string pending = "null")
    {
        if (!levels.Contains("\"scattergunAttack\"")) levels += ",\"scattergunAttack\":0";
        if (pending != "null") pending = pending.Substring(0, pending.Length-1) +
            ",\"tier\":0,\"profileVersion\":\"\",\"isLimit\":false,\"newBestTime\":false,\"newBestKills\":false,\"unlockedTierTwo\":false}";
        return "{\"version\":4,\"credits\":" + wallet + ",\"permanentLevels\":{" + levels +
            "},\"nextRunId\":" + next + ",\"lastFinalizedRunId\":" + finalized +
            ",\"selectedTier\":1,\"selectedFitting\":\"repair\",\"tierRecords\":{\"tier-1\":{\"bestWave\":0,\"legacyTicks\":0,\"legacyKills\":0,\"unlocked\":true}," +
            "\"tier-2\":{\"bestWave\":0,\"legacyTicks\":0,\"legacyKills\":0,\"unlocked\":false}},\"firstClears\":[],\"unlockedFittings\":[\"launcher\",\"repair\"]," +
            "\"pendingDefeat\":" + pending + ",\"checkpoint\":null}";
    }

    // Every independent execution shares a deterministic UTC observation so
    // fault/control byte comparisons include the real research save fields.
    static LastStandProgression Load(ILastStandStorage storage)=>LastStandProgression.Load(storage,()=>1000000L);

    static string Current(string levels,int wallet=17,int next=9,int finalized=6,string pending="null")
    {
        var supplied=LastStandSaveJson.Read("{"+levels+"}");
        object yield=0;
        var extra=new Dictionary<string,object>();
        foreach(string key in new[]{"mortarAttack","railgunAttack"})
            if(supplied.TryGetValue(key,out var rank)){extra[key]=rank;supplied.Remove(key);}
        if(supplied.TryGetValue("scrapYield",out var value)){yield=value;supplied.Remove("scrapYield");}
        string legacy=LastStandSaveJson.Write(supplied);
        var migrated=new PersistenceStorage {Value=V4(legacy.Substring(1,legacy.Length-2),wallet,next,finalized,pending)};
        Require(Load(migrated).SaveState=="ready","Current fixture uses production legacy migration.");
        var current=LastStandSaveJson.Read(migrated.Value);
        LastStandSaveJson.Object(current["permanentLevels"])["scrapYield"]=yield;
        foreach(var pair in extra)LastStandSaveJson.Object(current["permanentLevels"])[pair.Key]=pair.Value;
        return LastStandSaveJson.Write(current);
    }

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

    static void CheckCurrentSave(string value)
    {
        Require(value.StartsWith("{\"version\":6,"), "Supported migration must write version 6 under the same key.");
        Require(value.Contains("\"permanentLevels\":{") && !value.Contains("\"permanentLevel\":"),
            "Version 6 must preserve keyed permanent tracks.");
        Require(value.Contains("\"scrapYield\":") && value.Contains("\"research\":") && value.Contains("\"checkpoint\":"),
            "Version 6 includes economy, research and an explicit resumable checkpoint.");
    }

    static void MigrationExact()
    {
        Require(LastStandProgression.StorageKey == "singedTerra.lastStand.prototype.v1", "Migration must retain the storage key.");
        for (int p = 0; p <= 3; p++)
        {
            var store = new PersistenceStorage { Value = " \r\n" + V1(17, p, 9, 6) + "\t" };
            var model = Load(store);
            Require(model.SaveState == "ready", "Ordinary v1 migration must be ready after verified saving.");
            CheckEntitlements(model, 17, p, 9, 6, false);
            CheckCurrentSave(store.Value);
            Require(store.Writes == 1, "Migration must commit exactly once.");
            foreach (var track in LastStandUpgradeCatalog.Tracks)
                Require(Level(model, track.Id) == (track.Id == LastStandUpgradeTrackId.CannonAttack ? p : 0),
                    "Only Cannon Attack inherits v1 permanentLevel.");
            var restored = Load(store);
            CheckEntitlements(restored, 17, p, 9, 6, false);
            Require(store.Writes == 1 && restored.ActiveRunId == 0, "Reload must not rewrite or resume the old run.");
        }
        var pendingStore = new PersistenceStorage { Value = V1(17, 2, 9, 6, Pending) };
        var pendingModel = Load(pendingStore);
        CheckEntitlements(pendingModel, 17, 2, 9, 6, true);
        CheckCurrentSave(pendingStore.Value);
        Require(!pendingModel.TryDeploy() && !pendingModel.TryPurchase(), "Pending defeat must block destructive actions.");
        Require(pendingModel.TryClaim() && !pendingModel.TryClaim(), "Migrated pending reward must claim exactly once.");
        CheckEntitlements(Load(pendingStore), 18, 2, 9, 8, false);
        var claimedStore = new PersistenceStorage { Value = V1(19, 3, 9, 8) };
        var claimed = Load(claimedStore);
        CheckCurrentSave(claimedStore.Value);
        CheckEntitlements(claimed, 19, 3, 9, 8, false);
        Require(!claimed.TryClaim(), "Claimed old reward must remain claimed.");
        var maximumStore = new PersistenceStorage { Value = V1(int.MaxValue, 3, int.MaxValue, int.MaxValue - 1) };
        var maximum = Load(maximumStore);
        CheckEntitlements(maximum, int.MaxValue, 3, int.MaxValue, int.MaxValue - 1, false);
        Require(!maximum.TryDeploy(), "The existing run-ID integer exhaustion guard must remain.");

        string original = "\r\n " + V1(17, 2, 9, 6, Pending) + " \t";
        var denied = new PersistenceStorage { Value = original, FailWrite = true };
        var retry = Load(denied);
        Require(retry.SaveState == "retry" && denied.Value == original && denied.Writes == 0,
            "Denied migration must retain original whitespace-v1 bytes and retry state.");
        CheckEntitlements(retry, 17, 2, 9, 6, true);
        Require(!retry.TryDeploy() && !retry.TryPurchase() && !retry.TryClaim(), "Unconfirmed migration must disable actions.");
        denied.FailWrite = false;
        Require(retry.Retry(), "Retry must accept the exact retained whitespace-v1 conflict basis.");
        CheckCurrentSave(denied.Value);
        CheckEntitlements(retry, 17, 2, 9, 6, true);
        Require(retry.Retry() && denied.Writes == 1, "Successful migration retry must not write twice.");

        var changed = new PersistenceStorage { Value = original, FailWrite = true };
        var blocked = Load(changed);
        changed.FailWrite = false;
        string foreign = V1(18, 2, 9, 6, Pending);
        changed.Value = foreign;
        Require(!blocked.Retry() && blocked.SaveState == "blocked" && changed.Value == foreign && changed.Writes == 0,
            "Changed migration basis must block without overwriting foreign entitlements.");
        changed.Value = original;
        Require(blocked.Retry() && changed.Writes == 1, "The original candidate must remain recoverable.");
        CheckEntitlements(blocked, 17, 2, 9, 6, true);

        var uncertain = new PersistenceStorage { Value = original, WriteThenFailRead = true };
        var reconciled = Load(uncertain);
        Require(reconciled.SaveState == "retry" && uncertain.Writes == 1, "Migration read-back failure must remain retryable.");
        CheckEntitlements(reconciled, 17, 2, 9, 6, true);
        Require(reconciled.Retry() && reconciled.Retry() && uncertain.Writes == 1, "Exact staged v2 must reconcile once.");
        CheckEntitlements(reconciled, 17, 2, 9, 6, true);
    }

    static void Invalid(string value, string label)
    {
        var store = new PersistenceStorage { Value = value };
        var model = Load(store);
        Require(model.SaveState == "blocked" && !String.IsNullOrEmpty(model.SaveError), label + ": must block with a save error.");
        Require(!model.TryDeploy() && !model.TryClaim() && !model.TryPurchase() && !model.Retry(), label + ": no usable defaults.");
        Require(store.Value == value && store.Writes == 0, label + ": preserve original bytes without writing.");
    }

    static void StrictV2()
    {
        var freshStore = new PersistenceStorage();
        var fresh = Load(freshStore);
        Require(fresh.SaveState == "ready", "Fresh record must be ready after confirmation.");
        CheckCurrentSave(freshStore.Value);
        var valid = V2(Levels, pending: Pending);
        var store = new PersistenceStorage { Value = " \t" + valid + "\r\n" };
        var model = Load(store);
        Require(model.SaveState == "ready" && store.Writes == 1, "Valid v2 migrates once to v3 after verified saving.");
        CheckEntitlements(model, 17, 3, 9, 6, true);
        int[] expected = { 3, 2, 1, 0, 3, 2, 0, 0, 0, 0 };
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            Require(Level(model, track.Id) == expected[(int)track.Id], "V2 must preserve every independent track level.");
        Require(model.TryClaim() && !model.TryClaim(), "V2 pending reward must retain exactly-once Claim.");
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            Require(Level(Load(store), track.Id) == expected[(int)track.Id], "Claim must preserve all permanent tracks.");
        var reversed = new PersistenceStorage { Value = V2("\"fieldRepair\":2,\"cannonCycle\":3,\"armor\":0,\"hullCapacity\":1,\"launcherAttack\":2,\"cannonAttack\":3") };
        Require(Load(reversed).SaveState == "ready", "Six unique keys may be reordered.");
        string boundary = V2(Levels);
        var boundaryStore = new PersistenceStorage { Value = boundary.PadRight(2048, ' ') };
        Require(Load(boundaryStore).SaveState == "ready", "Exactly 2048 characters remains valid.");
        string oldBoundary = V1(1, 3, 1, 0);
        Require(Load(new PersistenceStorage { Value = oldBoundary.PadRight(2048, ' ') }).SaveState == "ready",
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
            if ((int)track.Id < values.Length) fields.Add("\"" + track.Key + "\":" + values[(int)track.Id]);
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

    // These eight pre-armament tracks retain dormant-fitting purchases. The two new
    // tracks intentionally require an unlocked, selected fitting; ArmamentTransactionChecks
    // covers their positive purchases and every storage fault/replay boundary separately.
    static IEnumerable<LastStandUpgradeDefinition> EstablishedTracks
    { get { foreach(var track in LastStandUpgradeCatalog.Tracks) if((int)track.Id<8) yield return track; } }

    static void PermanentAllTracks()
    {
        var expected = new int[LastStandUpgradeCatalog.Tracks.Count];
        int initialWallet=0;
        foreach(var definition in EstablishedTracks)
            for(int rank=1;rank<=3;rank++)initialWallet+=definition.PermanentPrice(rank);
        var store = new PersistenceStorage { Value = Current(SavedLevels(expected), wallet: initialWallet) };
        var model = Load(store);
        int wallet = initialWallet;
        foreach (var track in EstablishedTracks)
        {
            for(int rank=1;rank<=3;rank++)
            {
                int price=track.PermanentPrice(rank);
                int writes = store.Writes;
                Require(Purchase(model, track.Id), "Available track accepts its authored early level.");
                wallet -= price; expected[(int)track.Id]++;
                Require(model.Wallet == wallet && store.Writes == writes+1 && model.SaveState == "ready",
                    "The current catalog price debits and commits exactly once.");
                CheckLevels(model, expected); CheckCurrentSave(store.Value);
                model = Load(store);
                Require(model.Wallet == wallet && store.Writes == writes+1 && model.ActiveRunId == 0 &&
                    model.PendingDefeat == null && model.NextRunId == 9 && model.FinalizedRunId == 6,
                    "Reload retains levels and entitlements without rewriting.");
                CheckLevels(model, expected);
            }
            var capLevels = new int[LastStandUpgradeCatalog.Tracks.Count];
            capLevels[(int)track.Id] = track.PermanentCap-1;
            int finalPrice = track.PermanentPrice(track.PermanentCap);
            var capStore = new PersistenceStorage { Value=Current(SavedLevels(capLevels), wallet:finalPrice+1) };
            var capped = Load(capStore);
            Require(Purchase(capped, track.Id) && capped.Wallet == 1 &&
                Level(capped,track.Id)==track.PermanentCap, "Each track accepts and charges its actual final level.");
            string before=capStore.Value; int capWrites=capStore.Writes;
            Require(!Purchase(capped,track.Id) && capStore.Value==before && capStore.Writes==capWrites && capped.Wallet==1,
                "A capped track refuses without changing wallet, levels or bytes.");
        }
        Require(wallet==0 && model.CannonAttackLevel==3 && model.CannonDamage==50 &&
            model.NextCost==LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack).PermanentPrice(4),
            "All early investments consume exactly their catalog costs; depth beyond level3 remains available.");
        foreach(var track in EstablishedTracks)
        for(int level=0;level<3;level++)
        {
            var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[(int)track.Id]=level;
            int insufficient=track.PermanentPrice(level+1)-1;
            var poorStore=new PersistenceStorage {Value=Current(SavedLevels(levels),wallet:insufficient)};
            var poor=Load(poorStore);string before=poorStore.Value;
            Require(!Purchase(poor,track.Id) && poorStore.Value==before && poorStore.Writes==0 && poor.Wallet==insufficient,
                "Insufficient Salvage refuses without charge, level or write.");CheckLevels(poor,levels);
        }
        foreach(int unknown in new[]{-1,LastStandUpgradeCatalog.Tracks.Count,int.MaxValue})
        {
            string before=store.Value;int writes=store.Writes;
            Require(!Purchase(model,(LastStandUpgradeTrackId)unknown) && store.Value==before && store.Writes==writes,
                "Unknown track refuses without mutation or exception.");CheckLevels(model,expected);
        }
        var maximum=Load(new PersistenceStorage {Value=Current(SavedLevels(new int[7]),wallet:int.MaxValue)});
        Require(Purchase(maximum,LastStandUpgradeTrackId.Armor) && maximum.Wallet==int.MaxValue-LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor).PermanentPrice(1),
            "A bounded debit preserves maximum integer wallets.");
        var compatibility=Load(new PersistenceStorage {Value=Current(SavedLevels(new int[7]),wallet:6)});
        for(int level=1;level<=3;level++)Require(compatibility.TryPurchase() && compatibility.CannonAttackLevel==level &&
            compatibility.CannonDamage==20+10*level,"Parameterless Cannon Attack purchase remains compatible.");
        Require(!compatibility.TryPurchase() && compatibility.Wallet==0,"Insufficient funds still refuse the compatibility entry.");
    }

    static void PermanentBoundaries()
    {
        foreach(var track in EstablishedTracks)
        {
            int first=track.PermanentPrice(1),second=track.PermanentPrice(2),budget=first+second+10;
            var store=new PersistenceStorage {Value=Current(SavedLevels(new int[7]),wallet:budget)};
            var model=Load(store);
            Require(model.TryDeploy() && model.CannonDamage==20,"Deployment freezes Cannon Attack.");
            int active=model.ActiveRunId;
            Require(Purchase(model,track.Id) && model.Wallet==budget-first && Level(model,track.Id)==1 &&
                model.ActiveRunId==active && model.Checkpoint.Shop.PermanentLevels[(int)track.Id]==0 && model.CannonDamage==20,
                "Active permanent purchase invests for the future without changing frozen run stats.");
            var restored=Load(store);
            Require(restored.HasCheckpoint && restored.Checkpoint.Shop.PermanentLevels[(int)track.Id]==0 &&
                Level(restored,track.Id)==1 && restored.CannonDamage==20,"Reload preserves distinct live and future levels.");
            string before=store.Value;int writes=store.Writes;store.FailWrite=true;
            Require(!Purchase(model,track.Id) && model.SaveState=="retry" && store.Value==before &&
                store.Writes==writes && model.Wallet==budget-first && Level(model,track.Id)==1,
                "Unconfirmed permanent purchase publishes neither its debit nor level.");
            Require(!Purchase(model,track.Id),"Unconfirmed candidate blocks another purchase.");store.FailWrite=false;
            Require(model.Retry() && model.Retry() && store.Writes==writes+1 && model.Wallet==10 && Level(model,track.Id)==2 &&
                model.Checkpoint.Shop.PermanentLevels[(int)track.Id]==0,"Retry confirms one purchase while retaining the frozen run.");
            Require(model.TryFinalizeRun() && model.TryDeploy() && model.Checkpoint.Shop.PermanentLevels[(int)track.Id]==2,
                "The next deployment uses the committed future investment.");
            var pendingStore=new PersistenceStorage {Value=V3(SavedLevels(new int[6]),wallet:36,pending:Pending)};
            var pending=Load(pendingStore);before=pendingStore.Value;writes=pendingStore.Writes;
            Require(!Purchase(pending,track.Id) && pendingStore.Value==before && pendingStore.Writes==writes && pending.Wallet==36,
                "Migrated pending reward blocks permanent purchases.");
            Require(pending.TryClaim() && !pending.TryClaim() && Purchase(pending,track.Id) && pending.Wallet==37-first,
                "Exactly-once legacy Claim allows the subsequent purchase.");
        }
        foreach(var fitting in new[]{LastStandFitting.Launcher,LastStandFitting.Repair,LastStandFitting.Scattergun})
        {
            int total=0;foreach(var track in EstablishedTracks)total+=track.PermanentPrice(1);
            var store=new PersistenceStorage {Value=Current(SavedLevels(new int[7]),wallet:total+10)};
            var model=Load(store);
            var frozen=new LastStandShopState(1,fitting,PermanentLevels(model));
            foreach(var track in EstablishedTracks)Require(Purchase(model,track.Id),"Fitting-independent future investment is retained.");
            var future=new LastStandShopState(2,fitting,PermanentLevels(Load(store)));
            foreach(var track in EstablishedTracks)
                Require(frozen.GetTrack(track.Id).PermanentLevel==0 && future.GetTrack(track.Id).PermanentLevel==1 &&
                    future.GetTrack(track.Id).RunPurchases==0 && future.GetTrack(track.Id).IsEligible==track.IsEligible(fitting),
                    "Frozen baselines and explicit fitting eligibility survive every permanent investment.");
            Require(frozen.Scrap==0 && future.Scrap==0 && model.Wallet==10,"Permanent investment never creates Scrap.");
        }
        var blockedStore=new PersistenceStorage {Value="invalid"};var blocked=Load(blockedStore);
        foreach(var track in LastStandUpgradeCatalog.Tracks)
            Require(!Purchase(blocked,track.Id) && blockedStore.Value=="invalid" && blockedStore.Writes==0,
                "Invalid saved data cannot permit permanent purchases.");
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
            "," + pending.Kills + "," + pending.Reward) + ";" + model.ActiveRunId + ";" + model.CannonDamage + ";" + (model.Checkpoint==null?"none":model.Checkpoint.RestoreModel().Snapshot()+","+model.Checkpoint.Shop.Scrap);
    }

    static bool Perform(LastStandProgression model,string kind,LastStandUpgradeTrackId track)
    {
        if(kind=="purchase")return Purchase(model,track);
        if(kind=="reservation")return model.TryDeploy();
        if(kind=="defeat")return model.TryStageDefeat(42,3);
        if(kind=="claim")return model.TryClaim();
        if(kind=="wave")
        {
            var combat=model.Checkpoint.RestoreModel();var shop=model.Checkpoint.RestoreShop();
            while(combat.Status==EncounterStatus.Running && !combat.AwaitingWaveCommit)combat.Step();
            Require(combat.AwaitingWaveCommit,"Actual first cohort must be defeated.");
            shop.ObserveAuthoritativeKills(combat.Kills);
            return model.TryCommitWave(combat,shop);
        }
        throw new InvalidOperationException("Unknown transaction.");
    }
    static StorageTransaction BeginTransaction(string kind,string fault,LastStandUpgradeTrackId track=LastStandUpgradeTrackId.Armor)
    {
        int[] levels={1,2,0,1,0,2,0};
        var transaction=new StorageTransaction {Kind=kind,Track=track,Store=new StorageFaultFixture()};
        var store=transaction.Store;
        if(kind.StartsWith("migration",StringComparison.Ordinal))
        {
            transaction.Original=" \r\n"+(kind=="migration-v2"?V2(Levels,pending:Pending):kind=="migration-v3"?V3(Levels,pending:Pending):
                kind=="migration-v4"?V4(Levels,pending:Pending):V1(17,2,9,6,Pending))+"\t ";
            var reference=new PersistenceStorage {Value=transaction.Original};
            Require(Load(reference).SaveState=="ready","Clean migration control succeeds.");
            transaction.Desired=reference.Value;store.Value=transaction.Original;store.Fault=fault;
            transaction.Model=Load(store);transaction.Before=Observation(transaction.Model);return transaction;
        }
        store.Value=" \r\n"+Current(SavedLevels(levels),wallet:kind=="purchase"?100:17,pending:kind=="claim"?Pending:"null")+"\t ";
        var model=Load(store);transaction.Model=model;
        Require(model.SaveState=="ready" && store.Writes==0,"Current fixture loads without rewriting.");
        if(kind=="defeat" || kind=="wave")Require(model.TryDeploy(),"Run transaction reserves its actual run.");
        transaction.Original=store.Value;transaction.WritesBefore=store.Writes;transaction.Before=Observation(model);
        // A clean independent execution binds exact candidate bytes, including all
        // checkpoint scalars, before injecting write/read-back failure.
        var controlStore=new PersistenceStorage {Value=store.Value};var control=Load(controlStore);
        Require(Perform(control,kind,track),kind+" "+track+": clean transaction control succeeds.");transaction.Desired=controlStore.Value;
        store.Fault=fault;Require(!Perform(model,kind,track),kind+": unconfirmed write reports refusal.");return transaction;
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
        var restored = Load(store);
        Require(restored.SaveState == "ready" && restored.ActiveRunId == ((transaction.Kind == "reservation" || transaction.Kind == "wave") ? 9 : 0),
            transaction.Kind + ": reload retains an explicit resumable checkpoint only for active runs.");
        Require(model.Wallet == restored.Wallet && model.NextRunId == restored.NextRunId &&
            model.FinalizedRunId == restored.FinalizedRunId && SavedLevels(PermanentLevels(model)) == SavedLevels(PermanentLevels(restored)),
            transaction.Kind + ": committed entitlements must equal the exact saved record after recovery.");
        Require((model.PendingDefeat == null) == (restored.PendingDefeat == null),
            transaction.Kind + ": recovery must publish pending presence only after confirmation.");
        if (model.PendingDefeat != null)
            Require(model.PendingDefeat.RunId == restored.PendingDefeat.RunId &&
                model.PendingDefeat.ElapsedTicks == restored.PendingDefeat.ElapsedTicks && model.PendingDefeat.Kills == restored.PendingDefeat.Kills,
                transaction.Kind + ": recovery must preserve every staged pending field.");
        Require(model.ActiveRunId == ((transaction.Kind == "reservation" || transaction.Kind == "wave") ? 9 : 0),
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
        foreach (string kind in new[] { "migration-v1", "migration-v2", "migration-v3", "migration-v4", "reservation", "wave", "defeat", "claim" })
            yield return BeginTransaction(kind, fault);
        foreach (var track in EstablishedTracks)
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
                string foreign = fault == "corrupt" ? store.Value : transaction.Kind.StartsWith("migration",StringComparison.Ordinal)
                    ? transaction.Original + " " : ChangedWallet(transaction.Original);
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

    static string ChangedWallet(string original)
    {
        var record=LastStandSaveJson.Read(original);
        record["credits"]=LastStandSaveJson.Integer(record["credits"])+1;
        return LastStandSaveJson.Write(record);
    }

    static void StorageRewards()
    {
        foreach(string fault in new[]{"denied","uncertain","mismatch"})
        {
            var store=new StorageFaultFixture {Value=Current(SavedLevels(new int[7]),wallet:0,next:1,finalized:0)};
            var model=Load(store);Require(model.TryDeploy(),"Reserve a wave run.");
            var ledger=model.Checkpoint.RestoreShop();ledger.ObserveAuthoritativeKills(2);
            Require(ledger.Scrap==6 && model.Wallet==0,"Temporary income grants no Salvage.");
            Require(ledger.TryPurchase(new LastStandShopPurchaseIntent(ledger.RunId,ledger.Version,LastStandUpgradeTrackId.CannonAttack)).Accepted &&
                ledger.Scrap==1 && model.Wallet==0,"Temporary purchase spends no Salvage.");
            store.Fault=fault;
            Require(!model.TryStageDefeat(42,2) && model.SaveState=="retry" && model.ActiveRunId==1 && model.Wallet==0 &&
                model.PendingDefeat==null,"Unconfirmed finalization retains the checkpoint and creates no death reward.");
            Require(!model.TryStageDefeat(42,2) && !model.TryClaim(),"Repeated terminal callback cannot create another transaction.");
            var reloaded=Load(store);
            Require(reloaded.Wallet==0 && reloaded.HasCheckpoint==(fault=="denied") && reloaded.PendingDefeat==null,
                "Reload sees actual stored active or finalized state without a new pending payout.");
            store.Fault=null;
            Require(model.Retry() && model.Retry() && !model.HasCheckpoint && model.FinalizedRunId==1 && model.Wallet==0 &&
                model.PendingDefeat==null && !model.TryClaim(),"Confirmed finalization consumes the run once without a payout.");
            Require(store.Writes==2,"Reservation and finalization each perform one successful write.");

            store=new StorageFaultFixture {Value=Current(SavedLevels(new int[7]),wallet:0,pending:Pending)};
            model=Load(store);store.Fault=fault;
            Require(!model.TryClaim() && model.Wallet==0 && model.PendingDefeat!=null && model.FinalizedRunId==6,
                "Unconfirmed legacy Claim retains the original reward and publishes no award.");
            Require(!model.TryClaim() && !model.TryDeploy(),"Unconfirmed Claim cannot queue another award or deploy.");
            reloaded=Load(store);
            Require(reloaded.Wallet==(fault=="denied"?0:1) && (reloaded.PendingDefeat!=null)==(fault=="denied") &&
                reloaded.FinalizedRunId==(fault=="denied"?6:8),"Reload sees the actual pending or consumed legacy reward.");
            store.Fault=null;
            Require(model.Retry() && model.Retry() && model.Wallet==1 && model.PendingDefeat==null && model.FinalizedRunId==8 &&
                !model.TryClaim(),"Legacy Claim recovery consumes exactly one reward.");
            int writes=store.Writes;reloaded=Load(store);
            Require(reloaded.Wallet==1 && !reloaded.TryClaim() && reloaded.Retry() && store.Writes==writes && writes==1,
                "Reload and repeated Claim cannot repeat a confirmed award.");
        }
        var nonDefeatStore=new StorageFaultFixture {Value=Current(SavedLevels(new int[7]),wallet:0,next:1,finalized:0)};
        var nonDefeat=Load(nonDefeatStore);
        Require(nonDefeat.TryDeploy() && nonDefeat.TryStageNonDefeat() && !nonDefeat.HasCheckpoint &&
            nonDefeat.Wallet==0 && nonDefeat.PendingDefeat==null && !nonDefeat.TryClaim() && nonDefeatStore.Writes==2,
            "Non-defeat exit durably clears the checkpoint without manufacturing an award.");
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
