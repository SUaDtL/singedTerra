using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public readonly struct LastStandKillReward
    {
        public readonly int BaseScrap,NextKillScrap,YieldPercent,LogisticsPercent;
        public readonly decimal EffectiveScrap;
        internal LastStandKillReward(int baseScrap,int yieldPercent,int logisticsPercent,int remainder)
        {
            BaseScrap=baseScrap;YieldPercent=yieldPercent;LogisticsPercent=logisticsPercent;
            long numerator=checked((long)baseScrap*yieldPercent*logisticsPercent);
            EffectiveScrap=(decimal)numerator/LastStandShopState.IncomeScale;
            NextKillScrap=checked((int)((numerator+remainder)/LastStandShopState.IncomeScale));
        }
    }
    public sealed class LastStandShopCheckpoint
    {
        public const int Version=2,LegacyVersion=1;
        public readonly int SchemaVersion;
        public readonly string EconomyVersion;
        public readonly int RunId,Fitting,PurchaseSequence,UniqueKills,EarnedScrap,SpentScrap,Scrap;
        public readonly int BaseEarnedScrap,BonusEarnedScrap,IncomeRemainder;
        public readonly IReadOnlyList<int> PermanentLevels,RunPurchases;
        public LastStandShopCheckpoint(int runId,int fitting,int purchaseSequence,int uniqueKills,int earnedScrap,int spentScrap,int scrap,
            IReadOnlyList<int> permanentLevels,IReadOnlyList<int> runPurchases)
            :this(runId,fitting,purchaseSequence,uniqueKills,earnedScrap,spentScrap,scrap,permanentLevels,runPurchases,
                LastStandUpgradeCatalog.LegacyEconomyVersion,earnedScrap,0,0,LegacyVersion) { }
        public LastStandShopCheckpoint(int runId,int fitting,int purchaseSequence,int uniqueKills,int earnedScrap,int spentScrap,int scrap,
            IReadOnlyList<int> permanentLevels,IReadOnlyList<int> runPurchases,string economyVersion,
            int baseEarnedScrap,int bonusEarnedScrap,int incomeRemainder,int schemaVersion=Version)
        {
            if(permanentLevels==null || runPurchases==null)throw new ArgumentNullException(nameof(permanentLevels));
            SchemaVersion=schemaVersion;EconomyVersion=economyVersion;
            BaseEarnedScrap=baseEarnedScrap;BonusEarnedScrap=bonusEarnedScrap;IncomeRemainder=incomeRemainder;
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
        public LastStandBulkQuantity Quantity { get; }

        public LastStandShopPurchaseIntent(int runId, int version, LastStandUpgradeTrackId trackId)
            :this(runId,version,trackId,LastStandBulkQuantity.One) { }
        public LastStandShopPurchaseIntent(int runId,int version,LastStandUpgradeTrackId trackId,LastStandBulkQuantity quantity)
        { RunId = runId; Version = version; TrackId = trackId; Quantity=quantity; }
    }

    public sealed class LastStandShopPurchaseResult
    {
        public bool Accepted => Refusal == LastStandShopPurchaseRefusal.None;
        public LastStandShopPurchaseRefusal Refusal { get; }
        public int ChargedScrap { get; }
        public int Version { get; }
        public LastStandUpgradeProjection Track { get; }
        public int PurchasedQuantity { get; }

        internal LastStandShopPurchaseResult(LastStandShopPurchaseRefusal refusal, int chargedScrap,
            int version, LastStandUpgradeProjection track)
            :this(refusal,chargedScrap,version,track,refusal==LastStandShopPurchaseRefusal.None?1:0) { }
        internal LastStandShopPurchaseResult(LastStandShopPurchaseRefusal refusal,int chargedScrap,
            int version,LastStandUpgradeProjection track,int purchasedQuantity)
        { Refusal = refusal; ChargedScrap = chargedScrap; Version = version; Track = track; PurchasedQuantity=purchasedQuantity; }
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
        readonly LastStandEconomyDefinition economy;
        public const int IncomeScale=10000,MaximumLogisticsRank=100;
        public string EconomyVersion => economy.Version;
        public IReadOnlyList<LastStandUpgradeDefinition> Definitions => economy.Tracks;
        public LastStandUpgradeDefinition GetDefinition(LastStandUpgradeTrackId id) => economy.Get(id);
        public int BaseEarnedScrap { get; private set; }
        public int BonusEarnedScrap { get; private set; }
        public int IncomeRemainder { get; private set; }

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
            :this(runId,fitting,permanentLevels,LastStandUpgradeCatalog.EconomyVersion) { }
        public LastStandShopState(int runId, LastStandFitting fitting, IReadOnlyList<int> permanentLevels,string economyVersion)
        {
            if (runId < 1) throw new ArgumentOutOfRangeException(nameof(runId));
            if (permanentLevels == null) throw new ArgumentNullException(nameof(permanentLevels));
            economy=LastStandUpgradeCatalog.ForEconomy(economyVersion);
            if (permanentLevels.Count != Definitions.Count)
                throw new ArgumentException("Every catalog track requires a permanent level.", nameof(permanentLevels));
            Definitions[0].IsEligible(fitting);
            tracks = new MechanicsShopTrack[permanentLevels.Count];
            for (int index = 0; index < tracks.Length; index++)
                tracks[index] = Definitions[index].CreateTrack(permanentLevels[index], 0);
            RunId = runId;
            Fitting = fitting;
        }
        public LastStandShopCheckpoint CaptureCheckpoint()
        {
            if(IsPurchaseTerminal)throw new InvalidOperationException("Finalized shop cannot resume.");
            var permanent=new int[tracks.Length];var temporary=new int[tracks.Length];
            for(int n=0;n<tracks.Length;n++){permanent[n]=tracks[n].PersistentLevel;temporary[n]=tracks[n].RunPurchases;}
            return new LastStandShopCheckpoint(RunId,(int)Fitting,Version,UniqueKills,EarnedScrap,SpentScrap,Scrap,permanent,temporary,
                EconomyVersion,BaseEarnedScrap,BonusEarnedScrap,IncomeRemainder);
        }
        public static LastStandShopState RestoreCheckpoint(LastStandShopCheckpoint s)
        {
            if(s==null)throw new ArgumentNullException(nameof(s));
            var definitionSet=LastStandUpgradeCatalog.ForEconomy(s.EconomyVersion);
            long maximumBonusPercent=definitionSet.IsLegacy?20000:80000;
            if(s.RunId<1 || s.PurchaseSequence<0 || s.UniqueKills<0 || s.UniqueKills>MaximumUniqueKills ||
                (s.SchemaVersion!=LastStandShopCheckpoint.LegacyVersion && s.SchemaVersion!=LastStandShopCheckpoint.Version) ||
                s.SchemaVersion==LastStandShopCheckpoint.LegacyVersion && (!definitionSet.IsLegacy || s.BonusEarnedScrap!=0 || s.IncomeRemainder!=0) ||
                s.BaseEarnedScrap!=definitionSet.BaseScrapThroughKills(s.UniqueKills) || s.BaseEarnedScrap<0 || s.BonusEarnedScrap<0 ||
                s.IncomeRemainder<0 || s.IncomeRemainder>=IncomeScale ||
                (long)s.BonusEarnedScrap*IncomeScale+s.IncomeRemainder>(long)s.BaseEarnedScrap*maximumBonusPercent ||
                s.EarnedScrap!=(long)s.BaseEarnedScrap+s.BonusEarnedScrap || s.SpentScrap<0 || s.Scrap<0 || (long)s.SpentScrap+s.Scrap!=s.EarnedScrap ||
                s.PermanentLevels.Count!=definitionSet.Tracks.Count || s.RunPurchases.Count!=s.PermanentLevels.Count)
                throw new ArgumentException("Invalid shop checkpoint accounting.");
            var shop=new LastStandShopState(s.RunId,(LastStandFitting)s.Fitting,s.PermanentLevels,s.EconomyVersion);
            long spent=0,purchases=0;
            for(int n=0;n<shop.tracks.Length;n++) {
                var definition=shop.Definitions[n];
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
            shop.BaseEarnedScrap=s.BaseEarnedScrap;shop.BonusEarnedScrap=s.BonusEarnedScrap;shop.IncomeRemainder=s.IncomeRemainder;
            shop.PurchaseLifecycle=LastStandShopPurchaseLifecycle.Paused;
            return shop;
        }

        // Returns a frozen catalog projection, never the ledger's mutable track.
        public LastStandUpgradeProjection GetTrack(LastStandUpgradeTrackId id)
        {
            var definition = GetDefinition(id);
            var track = tracks[(int)definition.Id];
            return definition.Project(track.PersistentLevel, track.RunPurchases, Fitting);
        }

        int YieldPercent => economy.IsLegacy?100:100+tracks[(int)LastStandUpgradeTrackId.ScrapYield].CurrentLevel;
        static int LogisticsPercent(int rank)
        {
            if(rank<0 || rank>MaximumLogisticsRank)throw new ArgumentOutOfRangeException(nameof(rank));
            return 100+2*rank;
        }
        public LastStandKillReward ProjectKillReward(int wave,int logisticsRank)
            => new LastStandKillReward(economy.BaseScrapPerKill(wave),YieldPercent,LogisticsPercent(logisticsRank),IncomeRemainder);

        public bool ObserveAuthoritativeKills(int uniqueKills) => CreditKills(uniqueKills,0);
        // The production caller reconciles each admitted simulation step before
        // allowing research/upgrade changes to alter subsequent reward events.
        public bool ObserveAuthoritativeKills(int uniqueKills,int wave,int logisticsRank)
        {
            if(wave<1)throw new ArgumentOutOfRangeException(nameof(wave));
            if(uniqueKills>UniqueKills && (economy.WaveForKill(uniqueKills)!=wave || economy.WaveForKill(UniqueKills+1)!=wave))
                throw new ArgumentException("Kill reward observations must belong to one authoritative wave.");
            return CreditKills(uniqueKills,logisticsRank);
        }
        bool CreditKills(int uniqueKills,int logisticsRank)
        {
            if (uniqueKills < 0 || uniqueKills > MaximumUniqueKills)
                throw new ArgumentOutOfRangeException(nameof(uniqueKills));
            int logisticsPercent=LogisticsPercent(logisticsRank);
            if (IsPurchaseTerminal) return false;
            if (uniqueKills <= UniqueKills) return false;
            long baseTotal=economy.BaseScrapThroughKills(uniqueKills);
            int baseIncome=checked((int)(baseTotal-BaseEarnedScrap));
            long bonusNumerator=checked((long)baseIncome*(YieldPercent*logisticsPercent-IncomeScale)+IncomeRemainder);
            int bonusIncome=checked((int)(bonusNumerator/IncomeScale));
            int nextBase=checked(BaseEarnedScrap+baseIncome),nextBonus=checked(BonusEarnedScrap+bonusIncome);
            int income = checked(baseIncome+bonusIncome);
            int nextScrap = checked(Scrap + income);
            int nextEarned = checked(EarnedScrap + income);
            int nextVersion = checked(Version + 1);
            UniqueKills = uniqueKills;
            BaseEarnedScrap=nextBase;BonusEarnedScrap=nextBonus;IncomeRemainder=(int)(bonusNumerator%IncomeScale);
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
            if (intent == null || !Enum.IsDefined(typeof(LastStandBulkQuantity),intent.Quantity))
                return Refuse(LastStandShopPurchaseRefusal.InvalidIntent);
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
            var definition = GetDefinition(intent.TrackId);
            var track = tracks[index];
            if (!definition.IsEligible(Fitting)) return Refuse(LastStandShopPurchaseRefusal.WrongFitting);
            if (track.RemainingPurchases == 0) return Refuse(LastStandShopPurchaseRefusal.AtCap);
            var quote=definition.QuoteRun(track.PersistentLevel,track.RunPurchases,Scrap,intent.Quantity);
            if (quote.Quantity==0) return Refuse(LastStandShopPurchaseRefusal.InsufficientScrap);

            // Prepare the immutable matching effect/result before the synchronous
            // debit/increment; no callback can observe an intermediate candidate.
            var nextTrack=definition.CreateTrack(track.PersistentLevel,track.RunPurchases+quote.Quantity);
            int nextScrap=checked(Scrap-quote.Cost),nextSpent=checked(SpentScrap+quote.Cost);
            // The epoch may skip values. Keeping it at least the paid-rank count
            // preserves the existing durable checkpoint validation invariant.
            int nextVersion=checked(Version+quote.Quantity);
            var candidate = new LastStandShopPurchaseResult(LastStandShopPurchaseRefusal.None, quote.Cost,
                nextVersion, definition.Project(nextTrack.PersistentLevel,nextTrack.RunPurchases,Fitting),quote.Quantity);
            tracks[index]=nextTrack;Scrap=nextScrap;SpentScrap=nextSpent;Version=nextVersion;
            return candidate;
        }

        // Accounting primitive for the authoritative intent owner. No mutable
        // handle or public purchase API can debit separately from the level increment.
        internal bool TryPurchaseLevel(LastStandUpgradeTrackId id)
        {
            return TryPurchase(new LastStandShopPurchaseIntent(RunId,Version,id)).Accepted;
        }
    }
}
