using System;
using System.IO;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

// Compiled exclusively against git a17e2ff production sources. The fixture is
// earned by those exact model/shop/profile owners, not fabricated checkpoints.
static class ResearchLegacyV4Fixture
{
    sealed class Store : ILastStandStorage { public string Raw; public string Read() => Raw; public void Write(string value) { Raw = value; } }
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static int Main(string[] args)
    {
        try
        {
            var store = new Store(); LastStandProgression.Load(store);
            var seed = LastStandSaveJson.Read(store.Raw); seed["credits"] = 1000000; seed["selectedFitting"] = "launcher";
            var levels = LastStandSaveJson.Object(seed["permanentLevels"]);
            foreach (var track in LastStandUpgradeCatalog.Tracks) levels[track.Key] = track.PermanentCap;
            store.Raw = LastStandSaveJson.Write(seed);
            var p = LastStandProgression.Load(store); Check(p.TryDeploy(), "v4 deploy");
            var model = p.Checkpoint.RestoreModel(); var shop = p.Checkpoint.RestoreShop();
            for (int wave = 1; wave <= 100; wave++)
            {
                int budget = 20000;
                while (!model.AwaitingWaveCommit && model.Status == EncounterStatus.Running && budget-- > 0)
                { model.Step(); shop.ObserveAuthoritativeKills(model.Kills); }
                Check(model.AwaitingWaveCommit && model.Hull > 0, "v4 fixture must clear wave " + wave);
                Check(p.TryCommitWave(model, shop), "v4 boundary " + wave);
                if (wave == 100) break;
                model.ContinueAfterCheckpoint(); shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
                while (shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases < 13)
                {
                    var buy = shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId, shop.Version, LastStandUpgradeTrackId.CannonAttack));
                    if (!buy.Accepted) break;
                    model.ApplyShopProjection(shop);
                }
            }
            Check(p.Checkpoint.Shop.RunPurchases[0] == 13, "v4 fixture needs nonlinear historical purchase prices");
            Check(LastStandProgression.Load(store).SaveState == "ready", "old owner validates its fixture");
            File.WriteAllText(args[0], store.Raw);
            File.WriteAllText(args[1], p.Checkpoint.RestoreModel().Snapshot());
            Console.WriteLine("PASS legacy-v4-fixture"); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
