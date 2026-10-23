using System;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Independent corruption/recovery regression: quote epochs are not paid state.
static class WavesSaveReviewChecks
{
    sealed class Store : ILastStandStorage
    {
        public string Raw;
        public string Read() => Raw;
        public void Write(string value) { Raw = value; }
    }
    static void Check(bool condition, string message)
    { if (!condition) throw new Exception(message); }
    static void Clear(EncounterModel model, LastStandShopState shop)
    {
        int budget = 20000;
        while (!model.AwaitingWaveCommit && model.Status == EncounterStatus.Running && budget-- > 0)
        { model.Step(); shop.ObserveAuthoritativeKills(model.Kills); }
        Check(model.AwaitingWaveCommit, "Fixture must clear the actual cohort.");
    }
    static string PaidCheckpoint()
    {
        var store = new Store(); LastStandProgression.Load(store);
        var record = LastStandSaveJson.Read(store.Raw);
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            LastStandSaveJson.Object(record["permanentLevels"])[track.Key] = track.PermanentCap;
        record["selectedFitting"] = "launcher";
        store.Raw = LastStandSaveJson.Write(record);
        var progression = LastStandProgression.Load(store);
        Check(progression.TryDeploy(), "Fixture starting checkpoint.");
        var model = progression.Checkpoint.RestoreModel();
        var shop = progression.Checkpoint.RestoreShop();
        Clear(model, shop); Check(progression.TryCommitWave(model, shop), "Fixture first clear.");
        model.ContinueAfterCheckpoint(); shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
        Check(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId, shop.Version,
            LastStandUpgradeTrackId.CannonAttack)).Accepted, "Fixture purchase must be paid.");
        model.ApplyShopProjection(shop);
        Clear(model, shop); Check(progression.TryCommitWave(model, shop), "Fixture paid boundary.");
        return store.Raw;
    }
    static Store WithSequence(string raw, int sequence)
    {
        var record = LastStandSaveJson.Read(raw);
        LastStandSaveJson.Object(LastStandSaveJson.Object(record["checkpoint"])["shop"])["purchaseSequence"] = sequence;
        return new Store { Raw = LastStandSaveJson.Write(record) };
    }
    static LastStandRunCheckpoint Load(Store store)
    {
        var loaded = LastStandProgression.Load(store);
        Check(loaded.SaveState == "ready" && loaded.HasCheckpoint, "Validated paid checkpoint should restore.");
        return loaded.Checkpoint;
    }
    static void SamePaidState(LastStandShopCheckpoint before, LastStandShopCheckpoint after)
    {
        Check(before.RunId == after.RunId && before.Fitting == after.Fitting &&
            before.UniqueKills == after.UniqueKills && before.EarnedScrap == after.EarnedScrap &&
            before.SpentScrap == after.SpentScrap && before.Scrap == after.Scrap, "Restore changed accounting.");
        for (int index = 0; index < before.PermanentLevels.Count; index++)
            Check(before.PermanentLevels[index] == after.PermanentLevels[index] &&
                before.RunPurchases[index] == after.RunPurchases[index], "Restore changed paid levels.");
    }
    static void ExhaustedEpochs(string operation)
    {
        string raw = PaidCheckpoint();
        foreach (int sequence in new[] { int.MaxValue, int.MaxValue - 1, int.MaxValue - 3 })
        {
            var checkpoint = Load(WithSequence(raw, sequence));
            var shop = checkpoint.RestoreShop();
            SamePaidState(checkpoint.Shop, shop.CaptureCheckpoint());
            // Repeated restore must retain purchases without reintroducing the exhausted epoch.
            shop = LastStandShopState.RestoreCheckpoint(shop.CaptureCheckpoint());
            if (operation == "lifecycle")
            {
                for (int n = 0; n < 20; n++)
                    Check(shop.UpdatePurchaseLifecycle(n % 2 == 0 ? LastStandShopPurchaseLifecycle.Running :
                        LastStandShopPurchaseLifecycle.Paused), "Pause/resume should remain usable.");
            }
            else if (operation == "income")
            {
                int before = shop.Scrap;
                for (int n = 0; n < 20; n++) Check(shop.ObserveAuthoritativeKills(shop.UniqueKills + 1), "Income should advance.");
                Check(shop.Scrap == before + 20 * LastStandShopState.ScrapPerKill, "Income changed after restore.");
            }
            else if (operation == "purchase")
            {
                int before = shop.Scrap;
                var quote = new LastStandShopPurchaseIntent(shop.RunId, shop.Version, LastStandUpgradeTrackId.CannonAttack);
                var result = shop.TryPurchase(quote);
                Check(result.Accepted && shop.Scrap == before - result.ChargedScrap &&
                    shop.GetTrack(quote.TrackId).RunPurchases == 2, "Restored purchase must debit once.");
                Check(shop.TryPurchase(quote).Refusal == LastStandShopPurchaseRefusal.StaleVersion, "Replayed quote should be stale.");
            }
            else if (operation == "finalize")
            {
                var result = shop.FinalizeAccounting(LastStandShopPurchaseLifecycle.Defeated);
                Check(result.FinalScrap == checkpoint.Shop.Scrap && shop.Scrap == 0 &&
                    ReferenceEquals(result, shop.FinalizeAccounting(LastStandShopPurchaseLifecycle.Defeated)),
                    "Finalization should be once with original accounting.");
            }
            else throw new Exception("Unknown operation.");
        }
    }
    static void Controls()
    {
        string raw = PaidCheckpoint();
        var invalid = WithSequence(raw, 0); string original = invalid.Raw;
        Check(LastStandProgression.Load(invalid).SaveState == "blocked" && invalid.Raw == original,
            "A sequence below the existing paid purchase count must still be rejected without a rewrite.");
        var checkpoint = Load(new Store { Raw = raw });
        var model = checkpoint.RestoreModel(); string snapshot = model.Snapshot();
        var shop = checkpoint.RestoreShop(); model.ApplyShopProjection(shop);
        Check(model.Snapshot() == snapshot, "Restoring the shop must not change hull, cooldowns or combat stats.");
        SamePaidState(checkpoint.Shop, shop.CaptureCheckpoint());
        var quote = new LastStandShopPurchaseIntent(shop.RunId, shop.Version, LastStandUpgradeTrackId.CannonAttack);
        shop.ObserveAuthoritativeKills(shop.UniqueKills + 1);
        Check(shop.TryPurchase(quote).Refusal == LastStandShopPurchaseRefusal.StaleVersion,
            "A live owner must retain stale-quote protection.");
        Check(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId, shop.Version, quote.TrackId)).Accepted,
            "A fresh quote should remain usable.");
    }
    static int Main(string[] args)
    {
        try
        {
            if (args[0] == "controls") Controls(); else ExhaustedEpochs(args[0]);
            Console.WriteLine("PASS " + args[0]); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
