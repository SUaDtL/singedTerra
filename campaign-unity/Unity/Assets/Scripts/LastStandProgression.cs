using System;
using System.Collections.Generic;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public sealed class PendingDefeat
    {
        public int RunId { get; }
        public int ElapsedTicks { get; }
        public int Kills { get; }
        public int Reward { get; }
        public int Tier { get; }
        public string ProfileVersion { get; }
        public bool IsLimit { get; }
        public bool NewBestTime { get; }
        public bool NewBestKills { get; }
        public bool UnlockedTierTwo { get; }
        public PendingDefeat(int runId, int elapsedTicks, int kills)
            : this(runId, elapsedTicks, kills, 1, 0, "", false, false, false, false) { }
        internal PendingDefeat(int runId, int elapsedTicks, int kills, int reward,
            int tier, string profile, bool isLimit, bool bestTime, bool bestKills, bool unlocked)
        {
            RunId=runId; ElapsedTicks=elapsedTicks; Kills=kills; Reward=reward; Tier=tier;
            ProfileVersion=profile; IsLimit=isLimit; NewBestTime=bestTime;
            NewBestKills=bestKills; UnlockedTierTwo=unlocked;
        }
    }

    public sealed class LastStandWaveReceipt
    {
        public int Wave { get; }
        public int Salvage { get; }
        public string MilestoneId { get; }
        public string UnlockedFitting { get; }
        public int UnlockedTier { get; }
        internal LastStandWaveReceipt(int wave,int salvage,string milestone,string fitting,int tier)
        { Wave=wave; Salvage=salvage; MilestoneId=milestone; UnlockedFitting=fitting; UnlockedTier=tier; }
    }

    // One local-only transaction owns both banked progression and the latest
    // boundary checkpoint. It is not account or verified reward authority.
    public sealed partial class LastStandProgression
    {
        public const string StorageKey = "singedTerra.lastStand.prototype.v1";
        sealed class TierRecord
        {
            internal int BestWave, LegacyTicks, LegacyKills;
            internal bool Unlocked;
            internal TierRecord Copy() => (TierRecord)MemberwiseClone();
        }
        sealed class Record
        {
            public long Revision;
            public int RecoveryRemainder;
            public LastStandResearchState Research;
            public LastStandRunHistory History;
            public int Wallet, NextRunId, FinalizedRunId, SelectedTier=1;
            public int[] Levels=new int[LastStandUpgradeCatalog.Tracks.Count];
            public string SelectedFitting="repair";
            public PendingDefeat Pending;
            public LastStandRunCheckpoint Checkpoint;
            public Dictionary<string,TierRecord> Tiers=new Dictionary<string,TierRecord>(StringComparer.Ordinal);
            public HashSet<string> FirstClears=new HashSet<string>(StringComparer.Ordinal);
            public HashSet<string> Fittings=new HashSet<string>(StringComparer.Ordinal) {"repair","launcher"};
            // Historical parser output only, never the v4 tier storage shape.
            public int[] BestTicks=new int[2], BestKills=new int[2];
            public bool TierTwoUnlocked;
            public int Level { get=>Levels[(int)LastStandUpgradeTrackId.CannonAttack]; set=>Levels[(int)LastStandUpgradeTrackId.CannonAttack]=value; }
            public Record Copy()
            {
                var copy=(Record)MemberwiseClone();
                copy.Levels=(int[])Levels.Clone();
                copy.Tiers=new Dictionary<string,TierRecord>(StringComparer.Ordinal);
                foreach(var pair in Tiers)copy.Tiers.Add(pair.Key,pair.Value.Copy());
                copy.FirstClears=new HashSet<string>(FirstClears,StringComparer.Ordinal);
                copy.Fittings=new HashSet<string>(Fittings,StringComparer.Ordinal);
                copy.Research=Research?.Clone();
                copy.History=History?.Copy();
                return copy;
            }
        }
        readonly ILastStandStorage storage;
        readonly Func<long> utcNow;
        Record committed, candidate;
        string committedRaw;
        Action afterCommit;
        LastStandProgression(ILastStandStorage storage,Func<long> utcNow)
        { this.storage=storage??throw new ArgumentNullException(nameof(storage)); this.utcNow=utcNow??(()=>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()); SaveState="blocked"; }
        public int Wallet=>committed?.Wallet??0;
        public int CannonAttackLevel=>committed?.Level??0;
        public int CannonDamage=>Checkpoint?.Encounter.CannonDamage??
            LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack).EffectAt(CannonAttackLevel,1);
        public int NextCost=>PermanentCost(LastStandUpgradeTrackId.CannonAttack);
        public int NextRunId=>committed?.NextRunId??0;
        public int FinalizedRunId=>committed?.FinalizedRunId??0;
        public PendingDefeat PendingDefeat=>committed?.Pending;
        public LastStandRunCheckpoint Checkpoint=>committed?.Checkpoint;
        public bool HasCheckpoint=>Checkpoint!=null;
        public int ActiveRunId=>Checkpoint?.RunId??0;
        public int ActiveTier=>Checkpoint?.Tier??0;
        public string ActiveProfileVersion=>Checkpoint?.RulesVersion;
        public int SelectedTier=>committed?.SelectedTier??1;
        public string SelectedFitting=>committed?.SelectedFitting??"repair";
        public bool TierTwoUnlocked=>IsTierUnlocked(2);
        public string SaveState { get; private set; }
        public string SaveError { get; private set; }
        public LastStandWaveReceipt LastReceipt { get; private set; }
        bool Ready=>SaveState=="ready" && committed!=null && candidate==null;

        public int GetBestWave(int tier)=>GetTier(tier)?.BestWave??0;
        public int GetBestTicks(int tier)=>GetTier(tier)?.LegacyTicks??0;
        public int GetBestKills(int tier)=>GetTier(tier)?.LegacyKills??0;
        TierRecord GetTier(int tier)
        {
            if(committed==null || !LastStandTierCatalog.IsValid(tier))return null;
            return committed.Tiers.TryGetValue(LastStandTierCatalog.Get(tier).Key,out var row)?row:null;
        }
        public bool IsTierUnlocked(int tier)=>GetTier(tier)?.Unlocked??false;
        public bool IsFittingUnlocked(string fitting)=>committed!=null && committed.Fittings.Contains(fitting);
        public bool HasFirstClear(string milestone)=>committed!=null && committed.FirstClears.Contains(milestone);
        public int GetPermanentLevel(LastStandUpgradeTrackId id)
        {
            var definition=LastStandUpgradeCatalog.Get(id);int index=(int)definition.Id;
            // A failed migration still exposes the last committed old shape.
            // Newly introduced slots are neutral until the candidate is durable.
            return committed!=null&&index<committed.Levels.Length?committed.Levels[index]:0;
        }
        public int PermanentCost(LastStandUpgradeTrackId id)
        { var definition=LastStandUpgradeCatalog.Get(id);int level=GetPermanentLevel(id);
          return level>=definition.PermanentCap?0:definition.PermanentPrice(level+1); }

        public static LastStandProgression Load(ILastStandStorage storage,Func<long> utcNow=null)
        { var result=new LastStandProgression(storage,utcNow);result.Reload();return result; }
        static void InitializeTiers(Record record,bool legacy)
        {
            foreach(var tier in LastStandTierCatalog.All)
            {
                if(record.Tiers.ContainsKey(tier.Key))continue;
                record.Tiers.Add(tier.Key,new TierRecord {
                    Unlocked=tier.RequiredTier==0 || legacy && tier.Id==2 && record.TierTwoUnlocked,
                    LegacyTicks=legacy && tier.Id<=2?record.BestTicks[tier.Id-1]:0,
                    LegacyKills=legacy && tier.Id<=2?record.BestKills[tier.Id-1]:0 });
            }
        }
        static bool ReconcileUnlocks(Record row)
        {
            bool changed=false;
            foreach(var tier in LastStandTierCatalog.All)
                if(tier.Playable&&tier.RequiredTier!=0&&!row.Tiers[tier.Key].Unlocked&&
                    row.Tiers[LastStandTierCatalog.Get(tier.RequiredTier).Key].BestWave>=tier.RequiredWave)
                {row.Tiers[tier.Key].Unlocked=true;changed=true;}
            foreach(var fitting in LastStandFittingCatalog.Definitions)
                if(fitting.Playable&&!fitting.InitiallyUnlocked&&row.Tiers[LastStandTierCatalog.Get(fitting.UnlockTier).Key].BestWave>=fitting.UnlockWave)
                    changed=row.Fittings.Add(fitting.Id)||changed;
            return changed;
        }
        bool Reload()
        {
            try
            {
                string raw=storage.Read();
                if(raw==null)
                {
                    if(committed!=null) { Block("The saved record changed unexpectedly. Reload after resolving the conflict.",LastStandSaveHealth.Conflict);return false; }
                    var fresh=new Record { NextRunId=1 };InitializeTiers(fresh,false);InitializeResearch(fresh);return Commit(fresh,null);
                }
                if(committed!=null && raw!=committedRaw)
                { Block("The saved record changed unexpectedly. Reload after resolving the conflict.",LastStandSaveHealth.Conflict);return false; }
                if(!TryParseSave(raw,out var parsed,out bool migrate))
                { Block("Saved Last Stand data or checkpoint rules are invalid or unsupported. The original save has been preserved.",
                    IsFutureSave(raw)?LastStandSaveHealth.UnsupportedVersion:LastStandSaveHealth.InvalidData);
                    rejectedRaw=SaveHealth==LastStandSaveHealth.InvalidData&&CanPreserveRejectedSave(raw)?raw:null;
                    return false; }
                committed=parsed;committedRaw=raw;
                var next=parsed.Copy();
                if(migrate) {
                    InitializeTiers(next,false);Array.Resize(ref next.Levels,LastStandUpgradeCatalog.Tracks.Count);
                    if(next.Research==null)InitializeResearch(next);
                }
                bool unlocks=ReconcileUnlocks(next);
                if(migrate||unlocks)return Commit(next,null);
                if(!OwnsStorage())return false;
                SaveState="ready";SaveHealth=LastStandSaveHealth.Ready;SaveError=null;return true;
            }
            catch(Exception)
            { Block("Local storage could not be read. Retry when available.",LastStandSaveHealth.ReadUnavailable);return false; }
        }
        public bool TrySelectTier(int tier)
        {
            if(!Ready || HasCheckpoint || committed.Pending!=null || !IsTierUnlocked(tier)||!LastStandTierCatalog.Get(tier).Playable)return false;
            if(tier==SelectedTier)return true;
            var next=committed.Copy();next.SelectedTier=tier;return Commit(next,null);
        }
        public bool TrySelectFitting(string fitting)
        {
            if(!Ready || HasCheckpoint || committed.Pending!=null || !IsFittingUnlocked(fitting)||!LastStandRunEdition.Current.Supports(LastStandFittingCatalog.Parse(fitting)))return false;
            if(fitting==SelectedFitting)return true;
            var next=committed.Copy();next.SelectedFitting=fitting;return Commit(next,null);
        }
        public bool TryDeploy()
        {
            if(!Ready || HasCheckpoint || committed.Pending!=null || NextRunId==int.MaxValue ||
                !IsTierUnlocked(SelectedTier) || !IsFittingUnlocked(SelectedFitting)||!LastStandTierCatalog.Get(SelectedTier).Playable||
                !LastStandRunEdition.Current.Supports(LastStandFittingCatalog.Parse(SelectedFitting)))return false;
            var next=committed.Copy();
            next.Checkpoint=LastStandRunCheckpoint.Start(next.NextRunId,next.SelectedTier,next.SelectedFitting,next.Levels);
            next.History.Begin(next.NextRunId,next.SelectedTier,next.SelectedFitting,next.Checkpoint.Shop.EconomyVersion,ResearchContext(next));
            next.NextRunId++;
            return Commit(next,()=>LastReceipt=null);
        }
        public bool TryCommitWave(EncounterModel model,LastStandShopState shop,LastStandRunHistory history=null)
        {
            if(!Ready || Checkpoint==null || model==null || shop==null ||
                !model.AwaitingWaveCommit || model.CompletedWave!=Checkpoint.CompletedWave+1 ||
                model.Profile.Tier!=Checkpoint.Tier || shop.RunId!=Checkpoint.RunId || model.Profile.Edition.RulesVersion!=Checkpoint.Edition.RulesVersion ||
                model.Profile.Edition.ContentVersion!=Checkpoint.Edition.ContentVersion||model.Profile.Edition.EconomyVersion!=Checkpoint.Edition.EconomyVersion||
                shop.EconomyVersion!=Checkpoint.Edition.EconomyVersion||shop.Tier!=Checkpoint.Tier||
                model.Tick<=Checkpoint.Encounter.Tick || model.Kills<Checkpoint.Encounter.Kills)return false;
            // Both snapshots validate their own conservation and boundary invariants.
            var boundary=new LastStandRunCheckpoint(shop.RunId,model.CaptureCheckpoint(),shop.CaptureCheckpoint());
            if(boundary.FittingId!=Checkpoint.FittingId)return false;
            var next=committed.Copy();
            var tier=boundary.Edition.Tier(boundary.Tier);
            var reward=LastStandRewardCatalog.At(tier,boundary.CompletedWave,boundary.Edition);
            bool first=reward.Milestone!=null && !next.FirstClears.Contains(reward.Milestone.Id);
            if(!LastStandResearchCatalog.TryMultiplyReward(reward.RepeatableSalvage,
                next.Research.Rank(LastStandResearchTrackId.SalvageRecovery),next.RecoveryRemainder,out long repeatable,out int remainder))return false;
            next.RecoveryRemainder=remainder;
            long milestone=first?reward.FirstClearSalvage:0;
            long amount=repeatable+milestone;
            if(amount>int.MaxValue-next.Wallet)
            { Block("Salvage storage is full. This wave has not been saved.");return false; }
            next.Wallet+=(int)amount;
            if(!UseLiveHistory(next,history))return false;
            if(!next.History.BankWave(boundary.CompletedWave,reward.RepeatableSalvage,milestone,
                repeatable-reward.RepeatableSalvage,ResearchContext(next,boundary.Shop)))return false;
            next.Tiers[tier.Key].BestWave=Math.Max(next.Tiers[tier.Key].BestWave,boundary.CompletedWave);
            int unlockedTier=0;string unlockedFitting=null;
            if(first)
            {
                next.FirstClears.Add(reward.Milestone.Id);
                if(reward.Milestone.UnlockTierId!=0)
                {
                    unlockedTier=reward.Milestone.UnlockTierId;
                    next.Tiers[LastStandTierCatalog.Get(unlockedTier).Key].Unlocked=true;
                }
                if(reward.Milestone.UnlockFittingId!=null)
                {
                    unlockedFitting=reward.Milestone.UnlockFittingId;
                    next.Fittings.Add(unlockedFitting);
                }
            }
            if(boundary.Encounter.Hull==0)
            { next.History.Finish("defeat",ResearchContext(next,boundary.Shop));next.FinalizedRunId=boundary.RunId;next.Checkpoint=null; }
            else next.Checkpoint=boundary;
            ReconcileUnlocks(next);
            var receipt=new LastStandWaveReceipt(boundary.CompletedWave,(int)amount,
                first?reward.Milestone.Id:null,unlockedFitting,unlockedTier);
            return Commit(next,()=>LastReceipt=receipt);
        }
        public bool TryFinalizeRun(LastStandRunHistory history=null,string reason="defeat",LastStandShopState shop=null)
        {
            if(!Ready || !HasCheckpoint||shop!=null&&shop.Tier!=Checkpoint.Tier)return false;
            if((reason!="defeat" && reason!="abandon") || !TryTerminalShop(committed,shop,out var terminalShop))return false;
            var next=committed.Copy();if(!UseLiveHistory(next,history))return false;
            if(!next.History.Finish(reason,ResearchContext(next,terminalShop)))return false;
            next.FinalizedRunId=next.Checkpoint.RunId;next.Checkpoint=null;
            return Commit(next,null);
        }
        // Compatibility entry points finalize a new wave run without a death payout.
        // Only the legacy parser may create PendingDefeat.
        public bool TryStageDefeat(int elapsedTicks,int kills)=>elapsedTicks>=0 && kills>=0 && TryFinalizeRun();
        public bool TryStageLimit(int elapsedTicks,int kills)=>false;
        public bool TryStageNonDefeat()=>TryFinalizeRun();
        public void AbandonRun() { TryFinalizeRun(null,"abandon"); }
        public bool TryClaim()
        {
            if(!Ready || HasCheckpoint || committed.Pending==null ||
                committed.Pending.Reward>int.MaxValue-committed.Wallet)return false;
            var next=committed.Copy();next.Wallet+=next.Pending.Reward;
            next.FinalizedRunId=next.Pending.RunId;next.Pending=null;next.History=new LastStandRunHistory(next.FinalizedRunId);return Commit(next,null);
        }
        public bool TryPurchase()=>TryPurchase(LastStandUpgradeTrackId.CannonAttack);
        public bool TryPurchase(LastStandUpgradeTrackId id)=>TryPurchasePermanent(id,LastStandBulkQuantity.One,Revision);
        public LastStandUpgradeQuote QuotePermanent(LastStandUpgradeTrackId id,LastStandBulkQuantity quantity)=>
            LastStandUpgradeCatalog.Get(id).QuotePermanent(GetPermanentLevel(id),Wallet,quantity);
        public bool IsPermanentTrackApplicable(LastStandUpgradeTrackId id)
        {
            // Existing workshop tracks retain their dormant investment policy.
            // New armaments require the owned fitting selected for this purchase.
            var definition=LastStandUpgradeCatalog.Get(id);
            if(definition.Applicability!=LastStandUpgradeApplicability.Mortar&&definition.Applicability!=LastStandUpgradeApplicability.Railgun)return true;
            return IsFittingUnlocked(SelectedFitting)&&definition.IsEligible(LastStandFittingCatalog.Parse(SelectedFitting));
        }
        public bool TryPurchasePermanent(LastStandUpgradeTrackId id,LastStandBulkQuantity quantity,long expectedRevision)
        {
            int index=(int)id;
            if(!Ready || expectedRevision!=Revision || committed.Pending!=null || index<0 || index>=LastStandUpgradeCatalog.Tracks.Count ||
                !Enum.IsDefined(typeof(LastStandBulkQuantity),quantity)||!LastStandUpgradeCatalog.Get(id).Available||!IsPermanentTrackApplicable(id))return false;
            var quote=QuotePermanent(id,quantity);
            if(quote.Quantity==0)return false;
            // Active runs keep the immutable deployment levels in their checkpoint.
            var next=committed.Copy();next.Wallet-=quote.Cost;next.Levels[index]+=quote.Quantity;return Commit(next,null);
        }
        void Block(string error,LastStandSaveHealth health=LastStandSaveHealth.Blocked)
        { SaveState="blocked";SaveHealth=health;SaveError=error; }
        bool OwnsStorage()
        {
            try
            {
                if(storage is ILastStandStorageOwnership owner && !owner.CanWrite)
                { Block(storage is ILastStandStorageDiagnostics diagnostics ? diagnostics.OwnershipError : "This tab cannot save. Another Last Stand tab may own this profile, or this browser does not support save ownership. Close the other tab and reload here.",LastStandSaveHealth.Ownership);return false; }
                return true;
            }
            catch(Exception)
            { Block("Save ownership could not be checked. Retry when local storage is available.",LastStandSaveHealth.ReadUnavailable);return false; }
        }
        bool Commit(Record next,Action completion)
        {
            if(!OwnsStorage())return false;
            if((committed?.Revision??0)>=9007199254740990L) { Block("Saved revision limit reached. The original save has been preserved.");return false; }
            next.Revision=(committed?.Revision??0)+1;candidate=next;afterCommit=completion;return Retry();
        }
        public bool Retry()
        {
            if(!OwnsStorage())return false;
            if(candidate==null)return Reload();
            try
            {
                string desired=Serialize(candidate),existing=storage.Read();
                if(existing!=desired)
                {
                    string expected=committed!=null?committedRaw:RestorePending?restoreDestinationRaw:null;
                    if(existing!=expected)
                    { Block("The saved record changed unexpectedly. Reload after resolving the conflict.",LastStandSaveHealth.Conflict);return false; }
                    storage.Write(desired);
                    if(storage.Read()!=desired)throw new InvalidOperationException("Save readback mismatch.");
                }
                committed=candidate;committedRaw=desired;candidate=null;
                var complete=afterCommit;afterCommit=null;SaveState="ready";SaveHealth=LastStandSaveHealth.Ready;SaveError=null;complete?.Invoke();return true;
            }
            catch(Exception)
            { SaveState="retry";SaveHealth=LastStandSaveHealth.Retry;SaveError="The save was not confirmed. Retry to reconcile local storage.";return false; }
        }
    }
}
