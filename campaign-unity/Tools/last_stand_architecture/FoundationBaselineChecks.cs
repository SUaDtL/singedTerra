using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Independent observations captured from the pinned pre-foundation production
// owner. This is a synthetic cohort, not earned progression or endurance proof.
static class FoundationBaselineChecks
{
    const long Epoch = 1790000000000L;
    sealed class Store : ILastStandStorage, ILastStandStorageOwnership
    {
        public string Raw;
        public bool CanWrite => true;
        public string Read() => Raw;
        public void Write(string value) { Raw = value; }
    }
    static void Require(bool condition, string message)
    { if (!condition) throw new Exception(message); }
    static void Row(params object[] values)
    {
        var parts = new string[values.Length];
        for (int i = 0; i < parts.Length; i++)
            parts[i] = Convert.ToString(values[i], CultureInfo.InvariantCulture);
        Console.WriteLine(String.Join("|", parts));
    }
    static LastStandProgression Load(Store store)
    {
        var profile = LastStandProgression.Load(store, () => Epoch);
        Require(profile.SaveState == "ready", "Profile could not load");
        return profile;
    }
    static void ObserveProfile(string label, LastStandProgression profile)
    {
        var model = profile.Checkpoint.RestoreModel();
        var shop = profile.Checkpoint.RestoreShop();
        Row(label, profile.Wallet, profile.ActiveRunId, profile.GetBestWave(1),
            model.Wave, model.CompletedWave, model.Tick, model.Hull, model.Kills,
            model.CannonShots, model.LauncherShots, shop.EarnedScrap, shop.SpentScrap,
            shop.Scrap, shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases,
            shop.EconomyVersion, profile.ResearchSnapshot.completionSequence);
    }
    static void EconomicObservations()
    {
        foreach (string edition in new[] { LastStandUpgradeCatalog.LegacyEconomyVersion,
            LastStandUpgradeCatalog.PreviousEconomyVersion, LastStandUpgradeCatalog.EconomyVersion })
        {
            var economy = LastStandEconomyCatalog.Get(edition);
            foreach (int wave in new[] { 1, 10, 30, 200, 300, 2000, 5000 })
                Row("bounty", edition, wave, economy.BaseScrapPerKill(wave));
            var damage = economy.Get(LastStandUpgradeTrackId.CannonAttack);
            foreach (int level in new[] { 1, 2, 8, 30, 200, 1000 })
                Row("upgrade", edition, level, damage.RunPrice(level),
                    damage.PermanentPrice(level), damage.EffectAt(level, 1));
        }
        var shop = new LastStandShopState(31, LastStandFitting.Launcher,
            new int[LastStandUpgradeCatalog.Tracks.Count]);
        shop.ObserveAuthoritativeKills(100);
        var buy = shop.TryPurchase(new LastStandShopPurchaseIntent(31, shop.Version,
            LastStandUpgradeTrackId.CannonAttack, LastStandBulkQuantity.Ten));
        Require(buy.Accepted, "Golden bulk purchase refused");
        var restored = LastStandShopState.RestoreCheckpoint(shop.CaptureCheckpoint());
        Require(!restored.ObserveAuthoritativeKills(100), "Reload duplicated kill income");
        Row("bulk", buy.PurchasedQuantity, buy.ChargedScrap, restored.EarnedScrap,
            restored.SpentScrap, restored.Scrap,
            restored.GetTrack(LastStandUpgradeTrackId.CannonAttack).CurrentLevel);
        foreach (var track in LastStandResearchCatalog.Tracks)
            Row("research", track.Key, track.MaximumRank, track.Cost(1),
                track.BaseDurationMilliseconds(1));
    }
    static void ClockObservations()
    {
        var clock = new LastStandRunClock(0, int.MaxValue, 5, 5);
        int steps = 0, largestBatch = 0;
        for (int callback = 1; callback <= 600; callback++)
        {
            Require(clock.Observe(callback / 60.0), "5x observation failed");
            int batch = 0;
            while (clock.TryTakeStep()) { steps++; batch++; }
            largestBatch = Math.Max(largestBatch, batch);
        }
        Require(clock.Pause(10), "Pause refused");
        clock.Observe(20);
        Require(!clock.TryTakeStep(), "Paused time advanced combat");
        Require(clock.Resume(20), "Resume refused");
        clock.Observe(21);
        while (clock.TryTakeStep()) steps++;
        Row("clock", steps, largestBatch, clock.PendingSeconds.ToString("F8", CultureInfo.InvariantCulture),
            clock.MaximumSpeed, clock.SelectedSpeed);
    }
    static void CaptureProfile(string path)
    {
        var store = new Store();
        Load(store);
        var raw = LastStandSaveJson.Read(store.Raw);
        raw["credits"] = 100000;
        raw["selectedFitting"] = "launcher";
        var levels = LastStandSaveJson.Object(raw["permanentLevels"]);
        foreach (var track in LastStandUpgradeCatalog.Tracks)
            levels[track.Key] = track.Id == LastStandUpgradeTrackId.ScrapYield ? 0 :
                track.Id == LastStandUpgradeTrackId.CannonAttack ? 1000 : track.PermanentCap;
        store.Raw = LastStandSaveJson.Write(raw);
        var profile = Load(store);
        Require(profile.TryDeploy(), "Golden cohort could not deploy");
        var model = profile.Checkpoint.RestoreModel();
        var shop = profile.Checkpoint.RestoreShop();
        for (int wave = 1; wave <= 30; wave++)
        {
            int remaining = 30000;
            while (!model.AwaitingWaveCommit && model.Status == EncounterStatus.Running && remaining-- > 0)
            {
                model.Step();
                shop.ObserveAuthoritativeKills(model.Kills, model.Wave, 0);
            }
            Require(model.AwaitingWaveCommit && model.Hull > 0, "Golden cohort did not clear");
            Require(profile.TryCommitWave(model, shop), "Golden wave could not commit");
            if (wave == 1 || wave == 10 || wave == 30)
                ObserveProfile("wave-" + wave, profile);
            if (wave != 30) model.ContinueAfterCheckpoint();
        }
        File.WriteAllText(path, store.Raw);
    }
    static void ReloadProfile(string path)
    {
        var store = new Store { Raw = File.ReadAllText(path) };
        var profile = Load(store);
        ObserveProfile("reload", profile);
        Require(profile.TryFinalizeRun(null, "abandon"), "Golden abandon failed");
        Row("finalized", profile.Wallet, profile.FinalizedRunId, profile.HasCheckpoint,
            profile.HistorySnapshot.Lifetime.Runs);
        Require(profile.TryDeploy(), "Golden redeploy failed");
        ObserveProfile("redeploy", profile);
    }
    static int Main(string[] args)
    {
        try
        {
            EconomicObservations();
            ClockObservations();
            if (args[0] == "capture") CaptureProfile(args[1]);
            else Require(args[0] == "verify", "Unknown mode");
            ReloadProfile(args[1]);
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
