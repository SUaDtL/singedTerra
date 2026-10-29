using System;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

static class EconomyProjectionChecks
{
    static void Check(bool value,string message) { if(!value)throw new Exception(message); }
    static int Main()
    {
        try {
            foreach(string version in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.RetainedEconomyVersion,LastStandUpgradeCatalog.EconomyVersion}) {
                var rules=LastStandUpgradeCatalog.ForEconomy(version);
                var levels=new int[rules.Tracks.Count];levels[0]=100;
                var shop=new LastStandShopState(17,LastStandFitting.Launcher,levels,version);
                var model=EncounterModel.CreatePlayable(shop.Fitting,1,shop);
                Check(model.CommittedCannonDamage==rules.Get(LastStandUpgradeTrackId.CannonAttack).EffectAt(100,1),"Deployment reinterprets pinned effect curve.");
                shop.ObserveAuthoritativeKills(1000);
                var view=LastStandShopPresentation.ProjectRun(shop,LastStandBulkQuantity.Hundred);
                int available=0;foreach(var definition in rules.Tracks)if(definition.Available)available++;
                Check(view.Cards.Count==available && view.Quantity==LastStandBulkQuantity.Hundred,"Run view changed available edition roster or quantity.");
                var card=view.Cards[0];
                var result=shop.TryPurchase(new LastStandShopPurchaseIntent(view.RunId,view.Version,card.TrackId,view.Quantity));
                Check(result.Accepted && result.PurchasedQuantity==card.PurchaseQuantity && result.ChargedScrap==card.QuotedCost,"Displayed bulk quote differs from charged transaction.");
                model.ApplyShopProjection(shop);
                Check(model.CurrentCannonDamage==rules.Get(card.TrackId).EffectAt(card.ResultLevel,1),"Bulk effect does not match final combat projection.");
                Check(card.ResultEffectDescription==rules.Get(card.TrackId).DescribeEffect(card.ResultLevel),"Card describes a different resulting effect.");
                Check(card.CurrentLevel==100,"Old view mutated after purchase.");
                Check(shop.TryPurchase(new LastStandShopPurchaseIntent(view.RunId,view.Version,card.TrackId,view.Quantity)).Refusal==LastStandShopPurchaseRefusal.StaleVersion,"A displayed stale quote can charge twice.");
            }
            Console.WriteLine("PASS projection");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
