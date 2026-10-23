using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public sealed class LastStandShopCheckpoint
    {
        public const int Version=1;
        public readonly int RunId,Fitting,PurchaseSequence,UniqueKills,EarnedScrap,SpentScrap,Scrap;
        public readonly IReadOnlyList<int> PermanentLevels,RunPurchases;
        public LastStandShopCheckpoint(int runId,int fitting,int purchaseSequence,int uniqueKills,int earnedScrap,int spentScrap,int scrap,
            IReadOnlyList<int> permanentLevels,IReadOnlyList<int> runPurchases)
        {
            if(permanentLevels==null || runPurchases==null)throw new ArgumentNullException(nameof(permanentLevels));
            RunId=runId;Fitting=fitting;PurchaseSequence=purchaseSequence;UniqueKills=uniqueKills;EarnedScrap=earnedScrap;SpentScrap=spentScrap;Scrap=scrap;
            var permanent=new int[permanentLevels.Count];var temporary=new int[runPurchases.Count];
            for(int n=0;n<permanent.Length;n++)permanent[n]=permanentLevels[n];
            for(int n=0;n<temporary.Length;n++)temporary[n]=runPurchases[n];
            PermanentLevels=Array.AsReadOnly(permanent);RunPurchases=Array.AsReadOnly(temporary);
        }
    }
    public enum LastStandShopPurchaseLifecycle { Running, Paused, CatchingUp, Defeated, Exited, Limit, Failed, Inactive }
    public enum LastStandShopPurchaseRefusal
    {
        None, InvalidIntent, WrongRun, StaleVersion, UnknownTrack, WrongFitting, AtCap, InsufficientScrap,
        CatchingUp, Defeated, Exited, Limit, Failed, Inactive
    }

    public sealed class LastStandShopPurchaseIntent
    {
        public int RunId { get; }
        public int Version { get; }
        public LastStandUpgradeTrackId TrackId { get; }

        public LastStandShopPurchaseIntent(int runId, int version, LastStandUpgradeTrackId trackId)
        { RunId = runId; Version = version; TrackId = trackId; }
    }

    public sealed class LastStandShopPurchaseResult
    {
        public bool Accepted => Refusal == LastStandShopPurchaseRefusal.None;
        public LastStandShopPurchaseRefusal Refusal { get; }
        public int ChargedScrap { get; }
        public int Version { get; }
        public LastStandUpgradeProjection Track { get; }

        internal LastStandShopPurchaseResult(LastStandShopPurchaseRefusal refusal, int chargedScrap,
            int version, LastStandUpgradeProjection track)
        { Refusal = refusal; ChargedScrap = chargedScrap; Version = version; Track = track; }
    }

    // Final accounting is an in-memory result, never a spendable balance.
    public sealed class LastStandShopAccounting
    {
        public int RunId { get; }
        public int UniqueKills { get; }
        public int EarnedScrap { get; }
        public int SpentScrap { get; }
        public int FinalScrap { get; }
        public LastStandShopPurchaseLifecycle Lifecycle { get; }

        internal LastStandShopAccounting(int runId, int uniqueKills, int earnedScrap,
            int spentScrap, int finalScrap, LastStandShopPurchaseLifecycle lifecycle)
        {
            RunId = runId; UniqueKills = uniqueKills; EarnedScrap = earnedScrap;
            SpentScrap = spentScrap; FinalScrap = finalScrap; Lifecycle = lifecycle;
        }
    }

    // One run owns frozen permanent levels, independent temporary tracks and Scrap.
    // The session supplies its cumulative authoritative kill counter; presentation,
    // clocks and persistence do not enter this ledger.
    public sealed class LastStandShopState
    {
        public const int ScrapPerKill = 3;
        public const int MaximumUniqueKills = int.MaxValue / ScrapPerKill;
        readonly MechanicsShopTrack[] tracks;

        public int RunId { get; }
        public LastStandFitting Fitting { get; }
        public int Version { get; private set; }
        public int UniqueKills { get; private set; }
        public int Scrap { get; private set; }
        public int EarnedScrap { get; private set; }
        public int SpentScrap { get; private set; }
        public LastStandShopAccounting FinalAccounting { get; private set; }
        public LastStandShopPurchaseLifecycle PurchaseLifecycle { get; private set; } = LastStandShopPurchaseLifecycle.Running;

        public LastStandShopState(int runId, LastStandFitting fitting, IReadOnlyList<int> permanentLevels)
        {
            if (runId < 1) throw new ArgumentOutOfRangeException(nameof(runId));
            if (permanentLevels == null) throw new ArgumentNullException(nameof(permanentLevels));
            if (permanentLevels.Count != LastStandUpgradeCatalog.Tracks.Count)
                throw new ArgumentException("Every catalog track requires a permanent level.", nameof(permanentLevels));
            LastStandUpgradeCatalog.Tracks[0].IsEligible(fitting);
            tracks = new MechanicsShopTrack[permanentLevels.Count];
            for (int index = 0; index < tracks.Length; index++)
                tracks[index] = LastStandUpgradeCatalog.Tracks[index].CreateTrack(permanentLevels[index], 0);
            RunId = runId;
            Fitting = fitting;
        }
        public LastStandShopCheckpoint CaptureCheckpoint()
        {
            if(IsPurchaseTerminal)throw new InvalidOperationException("Finalized shop cannot resume.");
            var permanent=new int[tracks.Length];var temporary=new int[tracks.Length];
            for(int n=0;n<tracks.Length;n++){permanent[n]=tracks[n].PersistentLevel;temporary[n]=tracks[n].RunPurchases;}
            return new LastStandShopCheckpoint(RunId,(int)Fitting,Version,UniqueKills,EarnedScrap,SpentScrap,Scrap,permanent,temporary);
        }
        public static LastStandShopState RestoreCheckpoint(LastStandShopCheckpoint s)
        {
            if(s==null || s.RunId<1 || s.PurchaseSequence<0 || s.UniqueKills<0 || s.UniqueKills>MaximumUniqueKills ||
                s.EarnedScrap!=(long)s.UniqueKills*ScrapPerKill || s.SpentScrap<0 || s.Scrap<0 || (long)s.SpentScrap+s.Scrap!=s.EarnedScrap ||
                s.PermanentLevels.Count!=LastStandUpgradeCatalog.Tracks.Count || s.RunPurchases.Count!=s.PermanentLevels.Count)
                throw new ArgumentException("Invalid shop checkpoint accounting.");
            var shop=new LastStandShopState(s.RunId,(LastStandFitting)s.Fitting,s.PermanentLevels);
            long spent=0,purchases=0;
            for(int n=0;n<shop.tracks.Length;n++) {
                var definition=LastStandUpgradeCatalog.Tracks[n];
                if(s.RunPurchases[n]>0 && !definition.IsEligible(shop.Fitting))throw new ArgumentException("Wrong fitting purchase.");
                shop.tracks[n]=definition.CreateTrack(s.PermanentLevels[n],s.RunPurchases[n]);
                for(int level=1;level<=s.RunPurchases[n];level++)spent+=definition.RunPrice(level);
                purchases+=s.RunPurchases[n];
            }
            if(spent!=s.SpentScrap || purchases>s.PurchaseSequence)throw new ArgumentException("Checkpoint purchases do not match accounting.");
            // Quotes belong to one live shop instance; none survives a reload.
            // Rebase that volatile epoch after validating the durable paid
            // levels, so a corrupt near-overflow epoch cannot break resume,
            // income, purchasing or finalization. The validated purchase count
            // keeps subsequent checkpoints consistent with the same ledger.
            shop.Version=checked((int)purchases);shop.UniqueKills=s.UniqueKills;shop.EarnedScrap=s.EarnedScrap;shop.SpentScrap=s.SpentScrap;shop.Scrap=s.Scrap;
            shop.PurchaseLifecycle=LastStandShopPurchaseLifecycle.Paused;
            return shop;
        }

        // Returns a frozen catalog projection, never the ledger's mutable track.
        public LastStandUpgradeProjection GetTrack(LastStandUpgradeTrackId id)
        {
            var definition = LastStandUpgradeCatalog.Get(id);
            var track = tracks[(int)definition.Id];
            return definition.Project(track.PersistentLevel, track.RunPurchases, Fitting);
        }

        public bool ObserveAuthoritativeKills(int uniqueKills)
        {
            if (uniqueKills < 0 || uniqueKills > MaximumUniqueKills)
                throw new ArgumentOutOfRangeException(nameof(uniqueKills));
            if (IsPurchaseTerminal) return false;
            if (uniqueKills <= UniqueKills) return false;
            int income = checked((uniqueKills - UniqueKills) * ScrapPerKill);
            int nextScrap = checked(Scrap + income);
            int nextEarned = checked(EarnedScrap + income);
            int nextVersion = checked(Version + 1);
            UniqueKills = uniqueKills;
            Scrap = nextScrap;
            EarnedScrap = nextEarned;
            Version = nextVersion;
            return true;
        }

        // The last admitted step supplies income before this boundary. This
        // ledger closes exactly once, freezes conservation, then clears funds/n.
        public LastStandShopAccounting FinalizeAccounting(LastStandShopPurchaseLifecycle lifecycle)
        {
            if (!Enum.IsDefined(typeof(LastStandShopPurchaseLifecycle), lifecycle) ||
                lifecycle == LastStandShopPurchaseLifecycle.Running || lifecycle == LastStandShopPurchaseLifecycle.Paused ||
                lifecycle == LastStandShopPurchaseLifecycle.CatchingUp)
                throw new ArgumentOutOfRangeException(nameof(lifecycle));
            if (FinalAccounting != null) return FinalAccounting;
            UpdatePurchaseLifecycle(lifecycle);
            FinalAccounting = new LastStandShopAccounting(RunId, UniqueKills, EarnedScrap,
                SpentScrap, Scrap, PurchaseLifecycle);
            Scrap = 0;
            foreach (var track in tracks) track.StartNewRun();
            return FinalAccounting;
        }

        // The authoritative owner reports its reconciled admission boundary. This
        // does not reconcile ticks, pause time or clear the later result ledger.
        // A terminal observation permanently closes purchase admission for this run.
        public bool UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle lifecycle)
        {
            if (!Enum.IsDefined(typeof(LastStandShopPurchaseLifecycle), lifecycle) ||
                lifecycle == PurchaseLifecycle || IsPurchaseTerminal) return false;
            int nextVersion = checked(Version + 1);
            PurchaseLifecycle = lifecycle;
            Version = nextVersion;
            return true;
        }

        bool IsPurchaseTerminal => PurchaseLifecycle != LastStandShopPurchaseLifecycle.Running &&
            PurchaseLifecycle != LastStandShopPurchaseLifecycle.Paused &&
            PurchaseLifecycle != LastStandShopPurchaseLifecycle.CatchingUp;

        LastStandShopPurchaseResult Refuse(LastStandShopPurchaseRefusal refusal) =>
            new LastStandShopPurchaseResult(refusal, 0, Version, null);

        public LastStandShopPurchaseResult TryPurchase(LastStandShopPurchaseIntent intent)
        {
            if (intent == null) return Refuse(LastStandShopPurchaseRefusal.InvalidIntent);
            if (intent.RunId != RunId) return Refuse(LastStandShopPurchaseRefusal.WrongRun);
            switch (PurchaseLifecycle)
            {
                case LastStandShopPurchaseLifecycle.CatchingUp: return Refuse(LastStandShopPurchaseRefusal.CatchingUp);
                case LastStandShopPurchaseLifecycle.Defeated: return Refuse(LastStandShopPurchaseRefusal.Defeated);
                case LastStandShopPurchaseLifecycle.Exited: return Refuse(LastStandShopPurchaseRefusal.Exited);
                case LastStandShopPurchaseLifecycle.Limit: return Refuse(LastStandShopPurchaseRefusal.Limit);
                case LastStandShopPurchaseLifecycle.Failed: return Refuse(LastStandShopPurchaseRefusal.Failed);
                case LastStandShopPurchaseLifecycle.Inactive: return Refuse(LastStandShopPurchaseRefusal.Inactive);
            }
            if (intent.Version != Version) return Refuse(LastStandShopPurchaseRefusal.StaleVersion);
            int index = (int)intent.TrackId;
            if (index < 0 || index >= tracks.Length) return Refuse(LastStandShopPurchaseRefusal.UnknownTrack);
            var definition = LastStandUpgradeCatalog.Get(intent.TrackId);
            var track = tracks[index];
            if (!definition.IsEligible(Fitting)) return Refuse(LastStandShopPurchaseRefusal.WrongFitting);
            if (track.RemainingPurchases == 0) return Refuse(LastStandShopPurchaseRefusal.AtCap);
            int price = track.NextRunPrice;
            if (Scrap < price) return Refuse(LastStandShopPurchaseRefusal.InsufficientScrap);

            // Prepare the immutable matching effect/result before the synchronous
            // debit/increment; no callback can observe an intermediate candidate.
            var candidate = new LastStandShopPurchaseResult(LastStandShopPurchaseRefusal.None, price,
                checked(Version + 1), definition.Project(track.PersistentLevel, track.RunPurchases + 1, Fitting));
            if (!TryPurchaseLevel(intent.TrackId)) return Refuse(LastStandShopPurchaseRefusal.InsufficientScrap);
            return candidate;
        }

        // Accounting primitive for the authoritative intent owner. No mutable
        // handle or public purchase API can debit separately from the level increment.
        internal bool TryPurchaseLevel(LastStandUpgradeTrackId id)
        {
            if (PurchaseLifecycle != LastStandShopPurchaseLifecycle.Running &&
                PurchaseLifecycle != LastStandShopPurchaseLifecycle.Paused) return false;
            var definition = LastStandUpgradeCatalog.Get(id);
            var track = tracks[(int)definition.Id];
            if (!definition.IsEligible(Fitting) || track.RemainingPurchases == 0) return false;
            int price = track.NextRunPrice;
            if (Scrap < price) return false;
            int nextScrap = checked(Scrap - price);
            int nextSpent = checked(SpentScrap + price);
            int nextVersion = checked(Version + 1);
            if (!track.TryPurchase()) return false;
            Scrap = nextScrap;
            SpentScrap = nextSpent;
            Version = nextVersion;
            return true;
        }
    }
}
