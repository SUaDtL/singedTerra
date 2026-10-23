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
                return copy;
            }
        }
        readonly ILastStandStorage storage;
        Record committed, candidate;
        string committedRaw;
        Action afterCommit;
        LastStandProgression(ILastStandStorage storage)
        { this.storage=storage??throw new ArgumentNullException(nameof(storage)); SaveState="blocked"; }
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
        { var definition=LastStandUpgradeCatalog.Get(id);return committed?.Levels[(int)definition.Id]??0; }
        public int PermanentCost(LastStandUpgradeTrackId id)
        { var definition=LastStandUpgradeCatalog.Get(id);int level=GetPermanentLevel(id);
          return level>=definition.PermanentCap?0:definition.PermanentPrice(level+1); }

        public static LastStandProgression Load(ILastStandStorage storage)
        { var result=new LastStandProgression(storage);result.Reload();return result; }
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
        bool Reload()
        {
            try
            {
                string raw=storage.Read();
                if(raw==null)
                {
                    if(committed!=null) { Block("The saved record changed unexpectedly. Reload after resolving the conflict.");return false; }
                    var fresh=new Record { NextRunId=1 };InitializeTiers(fresh,false);return Commit(fresh,null);
                }
                if(committed!=null && raw!=committedRaw)
                { Block("The saved record changed unexpectedly. Reload after resolving the conflict.");return false; }
                if(!TryParseSave(raw,out var parsed,out bool migrate))
                { Block("Saved Last Stand data or checkpoint rules are invalid or unsupported. The original save has been preserved.");return false; }
                committed=parsed;committedRaw=raw;
                if(migrate)return Commit(parsed.Copy(),null);
                SaveState="ready";SaveError=null;return true;
            }
            catch(Exception)
            { Block("Local storage could not be read. Retry when available.");return false; }
        }
        public bool TrySelectTier(int tier)
        {
            if(!Ready || HasCheckpoint || committed.Pending!=null || !IsTierUnlocked(tier))return false;
            if(tier==SelectedTier)return true;
            var next=committed.Copy();next.SelectedTier=tier;return Commit(next,null);
        }
        public bool TrySelectFitting(string fitting)
        {
            if(!Ready || HasCheckpoint || committed.Pending!=null || !IsFittingUnlocked(fitting))return false;
            if(fitting==SelectedFitting)return true;
            var next=committed.Copy();next.SelectedFitting=fitting;return Commit(next,null);
        }
        public bool TryDeploy()
        {
            if(!Ready || HasCheckpoint || committed.Pending!=null || NextRunId==int.MaxValue ||
                !IsTierUnlocked(SelectedTier) || !IsFittingUnlocked(SelectedFitting))return false;
            var next=committed.Copy();
            next.Checkpoint=LastStandRunCheckpoint.Start(next.NextRunId,next.SelectedTier,next.SelectedFitting,next.Levels);
            next.NextRunId++;
            return Commit(next,()=>LastReceipt=null);
        }
        public bool TryCommitWave(EncounterModel model,LastStandShopState shop)
        {
            if(!Ready || Checkpoint==null || model==null || shop==null ||
                !model.AwaitingWaveCommit || model.CompletedWave!=Checkpoint.CompletedWave+1 ||
                model.Profile.Tier!=Checkpoint.Tier || shop.RunId!=Checkpoint.RunId ||
                model.Tick<=Checkpoint.Encounter.Tick || model.Kills<Checkpoint.Encounter.Kills)return false;
            // Both snapshots validate their own conservation and boundary invariants.
            var boundary=new LastStandRunCheckpoint(shop.RunId,model.CaptureCheckpoint(),shop.CaptureCheckpoint());
            if(boundary.FittingId!=Checkpoint.FittingId)return false;
            var next=committed.Copy();
            var tier=LastStandTierCatalog.Get(boundary.Tier);
            var reward=LastStandRewardCatalog.At(tier,boundary.CompletedWave);
            bool first=reward.Milestone!=null && !next.FirstClears.Contains(reward.Milestone.Id);
            long amount=(long)reward.RepeatableSalvage+(first?reward.FirstClearSalvage:0);
            if(amount>int.MaxValue-next.Wallet)
            { Block("Salvage storage is full. This wave has not been saved.");return false; }
            next.Wallet+=(int)amount;
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
            { next.FinalizedRunId=boundary.RunId;next.Checkpoint=null; }
            else next.Checkpoint=boundary;
            var receipt=new LastStandWaveReceipt(boundary.CompletedWave,(int)amount,
                first?reward.Milestone.Id:null,unlockedFitting,unlockedTier);
            return Commit(next,()=>LastReceipt=receipt);
        }
        public bool TryFinalizeRun()
        {
            if(!Ready || !HasCheckpoint)return false;
            var next=committed.Copy();next.FinalizedRunId=next.Checkpoint.RunId;next.Checkpoint=null;
            return Commit(next,null);
        }
        // Compatibility entry points finalize a new wave run without a death payout.
        // Only the legacy parser may create PendingDefeat.
        public bool TryStageDefeat(int elapsedTicks,int kills)=>elapsedTicks>=0 && kills>=0 && TryFinalizeRun();
        public bool TryStageLimit(int elapsedTicks,int kills)=>false;
        public bool TryStageNonDefeat()=>TryFinalizeRun();
        public void AbandonRun() { TryFinalizeRun(); }
        public bool TryClaim()
        {
            if(!Ready || HasCheckpoint || committed.Pending==null ||
                committed.Pending.Reward>int.MaxValue-committed.Wallet)return false;
            var next=committed.Copy();next.Wallet+=next.Pending.Reward;
            next.FinalizedRunId=next.Pending.RunId;next.Pending=null;return Commit(next,null);
        }
        public bool TryPurchase()=>TryPurchase(LastStandUpgradeTrackId.CannonAttack);
        public bool TryPurchase(LastStandUpgradeTrackId id)
        {
            int index=(int)id;
            if(!Ready || committed.Pending!=null || index<0 || index>=LastStandUpgradeCatalog.Tracks.Count)return false;
            int cost=PermanentCost(id);
            if(cost==0 || cost>Wallet)return false;
            // Active runs keep the immutable deployment levels in their checkpoint.
            var next=committed.Copy();next.Wallet-=cost;next.Levels[index]++;return Commit(next,null);
        }
        void Block(string error) { SaveState="blocked";SaveError=error; }
        bool Commit(Record next,Action completion)
        { candidate=next;afterCommit=completion;return Retry(); }
        public bool Retry()
        {
            if(candidate==null)return Reload();
            try
            {
                string desired=Serialize(candidate),existing=storage.Read();
                if(existing!=desired)
                {
                    if(committed!=null && existing!=committedRaw || committed==null && existing!=null)
                    { Block("The saved record changed unexpectedly. Reload after resolving the conflict.");return false; }
                    storage.Write(desired);
                    if(storage.Read()!=desired)throw new InvalidOperationException("Save readback mismatch.");
                }
                committed=candidate;committedRaw=desired;candidate=null;
                var complete=afterCommit;afterCommit=null;SaveState="ready";SaveError=null;complete?.Invoke();return true;
            }
            catch(Exception)
            { SaveState="retry";SaveError="The save was not confirmed. Retry to reconcile local storage.";return false; }
        }
    }
}
