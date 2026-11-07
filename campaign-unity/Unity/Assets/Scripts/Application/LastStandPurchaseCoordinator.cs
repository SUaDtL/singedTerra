using System;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public interface ILastStandPurchaseHost
    {
        LastStandProgression Progression { get; }
        ILastStandPurchaseSession PurchaseSession { get; }
        LastStandShopState RunShop { get; }
        string Phase { get; }
    }
    public sealed class LastStandPermanentPurchaseResult
    {
        public bool Accepted { get; }
        public bool Silent { get; }
        public string Error { get; }
        public LastStandUpgradeTrackId Track { get; }
        public int PriorLevel { get; }
        public int Quantity { get; }
        public long Cost { get; }
        public string Name { get; }
        internal LastStandPermanentPurchaseResult(bool accepted, bool silent = false, string error = null,
            LastStandUpgradeTrackId track = default, int prior = 0, int quantity = 0, long cost = 0, string name = "")
        { Accepted = accepted; Silent = silent; Error = error; Track = track; PriorLevel = prior; Quantity = quantity; Cost = cost; Name = name; }
    }

    // Commands and uncertain purchase confirmation live here. Presentation owns
    // feedback, and the profile/shop remain the only currency transaction owners.
    public sealed class LastStandPurchaseCoordinator
    {
        readonly ILastStandPurchaseHost host;
        public bool PermanentInProgress { get; private set; }
        LastStandPermanentPurchaseResult pending;
        public bool TemporaryInProgress { get; private set; }
        public LastStandPurchaseCoordinator(ILastStandPurchaseHost host)
        { this.host = host ?? throw new ArgumentNullException(nameof(host)); }

        public LastStandPermanentPurchaseResult Permanent(LastStandUpgradeTrackId track, LastStandBulkQuantity quantity,
            long expectedRevision, bool allowed, Func<bool> reconcileBenefits, Action admitted,
            Action<LastStandPermanentPurchaseResult> publish=null)
        {
            if(PermanentInProgress)return new LastStandPermanentPurchaseResult(false,silent:true);
            PermanentInProgress=true;
            try
            {
                var result=PerformPermanent(track,quantity,expectedRevision,allowed,reconcileBenefits,admitted);
                // Publication can synchronously invoke input/log/Changed callbacks.
                // They remain inside the original command's admission boundary.
                publish?.Invoke(result);
                return result;
            }
            finally { PermanentInProgress=false; }
        }
        LastStandPermanentPurchaseResult PerformPermanent(LastStandUpgradeTrackId track, LastStandBulkQuantity quantity,
            long expectedRevision, bool allowed, Func<bool> reconcileBenefits, Action admitted)
        {
            var progression = host.Progression;
            LastStandUpgradeDefinition definition = null;
            foreach (var candidate in LastStandUpgradeCatalog.Tracks) if (candidate.Id == track) { definition = candidate; break; }
            if (!allowed || definition == null)
                return new LastStandPermanentPurchaseResult(false, silent: true);
            if (expectedRevision != progression.Revision)
                return new LastStandPermanentPurchaseResult(false, error: "Upgrade selection changed. Review the current price.");
            if (progression.SaveState != "ready" || !reconcileBenefits())
                return new LastStandPermanentPurchaseResult(false, error: progression.SaveError);
            int prior = progression.GetPermanentLevel(track);
            var quote = progression.QuotePermanent(track, quantity);
            admitted();
            var receipt = new LastStandPermanentPurchaseResult(true, track: track, prior: prior,
                quantity: quote.Quantity, cost: quote.Cost, name: definition.Name);
            if (!progression.TryPurchasePermanent(track, quantity, progression.Revision))
            {
                pending = progression.SaveState != "ready" ? receipt : null;
                return new LastStandPermanentPurchaseResult(false, error: progression.SaveError ??
                    (prior >= definition.PermanentCap ? definition.Name + " is fully upgraded." : "Not enough salvage yet."));
            }
            pending = null;
            return receipt;
        }
        public LastStandPermanentPurchaseResult ConfirmRetry()
        {
            var receipt = pending; pending = null;
            return receipt != null && host.Progression.GetPermanentLevel(receipt.Track) == receipt.PriorLevel + receipt.Quantity ? receipt : null;
        }
        public LastStandShopPurchaseResult Temporary(LastStandShopPurchaseIntent intent, double timestamp, out bool attempted)
        {
            attempted = false;
            var session = host.PurchaseSession;
            var model = session?.Model;
            var shop = session?.Shop;
            Func<LastStandShopPurchaseRefusal,LastStandShopPurchaseResult> Refuse=reason=>
                new LastStandShopPurchaseResult(reason, 0, shop?.Version ?? 0, null);
            if (TemporaryInProgress) return Refuse(LastStandShopPurchaseRefusal.Inactive);
            if (intent == null) return Refuse(LastStandShopPurchaseRefusal.InvalidIntent);
            if (shop == null || model == null || shop != host.RunShop) return Refuse(LastStandShopPurchaseRefusal.Inactive);
            if (host.Phase != "battle") return shop.FinalAccounting != null ? shop.TryPurchase(intent) : Refuse(LastStandShopPurchaseRefusal.Inactive);
            attempted = TemporaryInProgress = true;
            try
            {
                // Settle admitted ticks against the original immutable intent.
                // Callbacks may replace the live run; never substitute its quote.
                session.AdvanceAt(timestamp);
                if (host.PurchaseSession != session || session.Model != model || session.Shop != shop || host.RunShop != shop)
                {
                    if (host.PurchaseSession?.Model != null && host.PurchaseSession.Model != model)
                        return Refuse(LastStandShopPurchaseRefusal.WrongRun);
                    return shop.FinalAccounting != null ? shop.TryPurchase(intent) : Refuse(LastStandShopPurchaseRefusal.Inactive);
                }
                if (session.Failure != "") return Refuse(LastStandShopPurchaseRefusal.Failed);
                if (model.Status == EncounterStatus.Defeated) return Refuse(LastStandShopPurchaseRefusal.Defeated);
                if (model.Status == EncounterStatus.Limit) return Refuse(LastStandShopPurchaseRefusal.Limit);
                if (host.Progression.ActiveRunId != shop.RunId) return Refuse(LastStandShopPurchaseRefusal.WrongRun);
                if (host.Phase != "battle") return Refuse(LastStandShopPurchaseRefusal.Inactive);
                shop.UpdatePurchaseLifecycle(session.Paused ? LastStandShopPurchaseLifecycle.Paused :
                    session.CatchingUp ? LastStandShopPurchaseLifecycle.CatchingUp : LastStandShopPurchaseLifecycle.Running);
                var result = shop.TryPurchase(intent);
                if (result.Accepted) session.ApplyShopProjection();
                return result;
            }
            finally { TemporaryInProgress = false; }
        }
    }
}
