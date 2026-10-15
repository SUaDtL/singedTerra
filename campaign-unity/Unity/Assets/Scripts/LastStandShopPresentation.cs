using System;
using System.Collections.Generic;
using System.Globalization;

namespace SingedTerra.LastStand
{
    public enum LastStandShopMode { Run, Permanent }
    public enum LastStandShopCurrency { Scrap, Salvage }
    public enum LastStandShopCardRefusal
    {
        None, WrongFitting, AtCap, InsufficientScrap, CatchingUp, Defeated, Exited, Limit, Failed, Inactive,
        SaveUnavailable, ActiveRun, PendingReward, InsufficientSalvage
    }

    // Copied values only. A card cannot buy, advance time or retain an owner.
    public sealed class LastStandShopCard
    {
        public LastStandUpgradeTrackId TrackId { get; }
        public string Key { get; }
        public string Name { get; }
        public LastStandUpgradeCategory Category { get; }
        public LastStandUpgradeApplicability Applicability { get; }
        public int PermanentLevel { get; }
        public int RunPurchases { get; }
        public int CurrentLevel { get; }
        public int Cap { get; }
        public int RemainingPurchases { get; }
        public bool AppliesToFitting { get; }
        public bool IsDormant { get; }
        public int? NextPrice { get; }
        public string PriceDescription { get; }
        public string CurrentEffectDescription { get; }
        public string NextEffectDescription { get; }
        public LastStandShopCardRefusal Refusal { get; }
        public string Reason { get; }
        public bool CanPurchase => Refusal == LastStandShopCardRefusal.None;

        internal LastStandShopCard(LastStandUpgradeDefinition definition, LastStandUpgradeProjection track,
            LastStandShopMode mode, LastStandShopCardRefusal refusal)
        {
            TrackId = definition.Id; Key = definition.Key; Name = definition.Name;
            Category = definition.Category; Applicability = definition.Applicability;
            PermanentLevel = track.PermanentLevel;
            RunPurchases = mode == LastStandShopMode.Run ? track.RunPurchases : 0;
            CurrentLevel = track.CurrentLevel;
            Cap = mode == LastStandShopMode.Run ? LastStandUpgradeCatalog.TotalCap : LastStandUpgradeCatalog.PermanentCap;
            RemainingPurchases = Cap - CurrentLevel;
            AppliesToFitting = track.IsEligible;
            IsDormant = mode == LastStandShopMode.Permanent && !AppliesToFitting;
            NextPrice = mode == LastStandShopMode.Run ? track.NextPrice : track.NextPermanentPrice;
            PriceDescription = NextPrice.HasValue ? NextPrice.Value.ToString(CultureInfo.InvariantCulture) +
                (mode == LastStandShopMode.Run ? " Scrap" : " Salvage") : "MAX";
            CurrentEffectDescription = track.CurrentEffectDescription;
            NextEffectDescription = !NextPrice.HasValue ? "MAX" :
                mode == LastStandShopMode.Run ? track.NextEffectDescription : definition.DescribeEffect(CurrentLevel + 1);
            Refusal = refusal;
            Reason = DescribeRefusal(refusal, definition.Applicability);
        }

        static string DescribeRefusal(LastStandShopCardRefusal refusal, LastStandUpgradeApplicability applicability)
        {
            switch (refusal)
            {
                case LastStandShopCardRefusal.None: return "Ready";
                case LastStandShopCardRefusal.WrongFitting: return applicability == LastStandUpgradeApplicability.Launcher
                    ? "Requires launcher fitting" : "Requires repair fitting";
                case LastStandShopCardRefusal.AtCap: return "MAX";
                case LastStandShopCardRefusal.InsufficientScrap: return "Not enough Scrap";
                case LastStandShopCardRefusal.CatchingUp: return "Catching up";
                case LastStandShopCardRefusal.Defeated: return "Run ended";
                case LastStandShopCardRefusal.Exited: return "Run exited";
                case LastStandShopCardRefusal.Limit: return "Run limit reached";
                case LastStandShopCardRefusal.Failed: return "Run stopped";
                case LastStandShopCardRefusal.Inactive: return "No active run";
                case LastStandShopCardRefusal.SaveUnavailable: return "Save unavailable";
                case LastStandShopCardRefusal.ActiveRun: return "Run active";
                case LastStandShopCardRefusal.PendingReward: return "Claim pending Salvage first";
                case LastStandShopCardRefusal.InsufficientSalvage: return "Not enough Salvage";
                default: throw new ArgumentOutOfRangeException(nameof(refusal));
            }
        }
    }

    public sealed class LastStandShopView
    {
        public LastStandShopMode Mode { get; }
        public LastStandShopCurrency Currency { get; }
        public string CurrencyName { get; }
        public int Balance { get; }
        public int RunId { get; }
        public int Version { get; }
        public LastStandShopPurchaseLifecycle? Lifecycle { get; }
        public LastStandFitting Fitting { get; }
        public string SaveState { get; }
        public string SaveError { get; }
        public IReadOnlyList<LastStandShopCard> Cards { get; }

        internal LastStandShopView(LastStandShopMode mode, int balance, int runId, int version,
            LastStandShopPurchaseLifecycle? lifecycle, LastStandFitting fitting, string saveState, string saveError,
            LastStandShopCard[] cards)
        {
            Mode = mode;
            Currency = mode == LastStandShopMode.Run ? LastStandShopCurrency.Scrap : LastStandShopCurrency.Salvage;
            CurrencyName = Currency.ToString(); Balance = balance; RunId = runId; Version = version;
            Lifecycle = lifecycle; Fitting = fitting; SaveState = saveState; SaveError = saveError;
            Cards = Array.AsReadOnly((LastStandShopCard[])cards.Clone());
        }
    }

    // Rendering observes these snapshots. The existing controller/progression
    // must still validate a current intent at activation; Ready is no reservation.
    public static class LastStandShopPresentation
    {
        public static LastStandShopView ProjectRun(LastStandShopState shop)
        {
            if (shop == null) throw new ArgumentNullException(nameof(shop));
            int balance = shop.Scrap, runId = shop.RunId, version = shop.Version;
            var lifecycle = shop.PurchaseLifecycle;
            var fitting = shop.Fitting;
            var cards = new LastStandShopCard[LastStandUpgradeCatalog.Tracks.Count];
            foreach (var definition in LastStandUpgradeCatalog.Tracks)
            {
                var track = shop.GetTrack(definition.Id);
                cards[(int)definition.Id] = new LastStandShopCard(definition, track, LastStandShopMode.Run,
                    RunRefusal(lifecycle, track, balance));
            }
            return new LastStandShopView(LastStandShopMode.Run, balance, runId, version,
                lifecycle, fitting, String.Empty, String.Empty, cards);
        }

        public static LastStandShopView ProjectPermanent(LastStandProgression progression, LastStandFitting fitting)
        {
            if (progression == null) throw new ArgumentNullException(nameof(progression));
            int balance = progression.Wallet;
            string saveState = progression.SaveState, saveError = progression.SaveError ?? String.Empty;
            var admission = saveState != "ready" ? LastStandShopCardRefusal.SaveUnavailable :
                progression.ActiveRunId != 0 ? LastStandShopCardRefusal.ActiveRun :
                progression.PendingDefeat != null ? LastStandShopCardRefusal.PendingReward : LastStandShopCardRefusal.None;
            var cards = new LastStandShopCard[LastStandUpgradeCatalog.Tracks.Count];
            foreach (var definition in LastStandUpgradeCatalog.Tracks)
            {
                var track = definition.Project(progression.GetPermanentLevel(definition.Id), 0, fitting);
                var refusal = admission != LastStandShopCardRefusal.None ? admission :
                    !track.NextPermanentPrice.HasValue ? LastStandShopCardRefusal.AtCap :
                    balance < track.NextPermanentPrice.Value ? LastStandShopCardRefusal.InsufficientSalvage : LastStandShopCardRefusal.None;
                cards[(int)definition.Id] = new LastStandShopCard(definition, track, LastStandShopMode.Permanent, refusal);
            }
            return new LastStandShopView(LastStandShopMode.Permanent, balance, 0, 0,
                null, fitting, saveState, saveError, cards);
        }

        static LastStandShopCardRefusal RunRefusal(LastStandShopPurchaseLifecycle lifecycle,
            LastStandUpgradeProjection track, int balance)
        {
            switch (lifecycle)
            {
                case LastStandShopPurchaseLifecycle.CatchingUp: return LastStandShopCardRefusal.CatchingUp;
                case LastStandShopPurchaseLifecycle.Defeated: return LastStandShopCardRefusal.Defeated;
                case LastStandShopPurchaseLifecycle.Exited: return LastStandShopCardRefusal.Exited;
                case LastStandShopPurchaseLifecycle.Limit: return LastStandShopCardRefusal.Limit;
                case LastStandShopPurchaseLifecycle.Failed: return LastStandShopCardRefusal.Failed;
                case LastStandShopPurchaseLifecycle.Inactive: return LastStandShopCardRefusal.Inactive;
            }
            if (!track.IsEligible) return LastStandShopCardRefusal.WrongFitting;
            if (!track.NextPrice.HasValue) return LastStandShopCardRefusal.AtCap;
            return balance < track.NextPrice.Value ? LastStandShopCardRefusal.InsufficientScrap : LastStandShopCardRefusal.None;
        }
    }
}
