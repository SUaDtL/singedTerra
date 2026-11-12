using System;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        public long Revision=>committed?.Revision??0;
        public LastStandResearchSnapshot ResearchSnapshot=>committed?.Research?.Snapshot();
        public LastStandHistorySnapshot HistorySnapshot=>committed?.History?.Snapshot();
        public double MaximumGameSpeed=>committed?.Research?.MaximumGameSpeed??1;
        public int ResearchRank(LastStandResearchTrackId track)=>committed?.Research?.Rank(track)??0;
        public LastStandCombatResearchSnapshot CompletedCombatResearch=>CaptureCombatResearch();
        static bool ResearchSnapshotIsFunded(LastStandResearchState state,LastStandCombatResearchSnapshot snapshot)=>
            state!=null&&snapshot!=null&&snapshot.ArmorPiercing<=state.Rank(LastStandResearchTrackId.ArmorPiercing)&&
            snapshot.AreaControl<=state.Rank(LastStandResearchTrackId.AreaControl)&&snapshot.FieldEngineering<=state.Rank(LastStandResearchTrackId.FieldEngineering);
        public bool ResearchSnapshotIsFunded(LastStandCombatResearchSnapshot snapshot)=>ResearchSnapshotIsFunded(committed?.Research,snapshot);
        public string ResearchContext()=>committed==null?"":ResearchContext(committed);
        static string ResearchContext(Record row,LastStandShopCheckpoint shop=null)
        {
            var s=row.Research.Snapshot();
            shop=shop??row.Checkpoint?.Shop;
            if(shop==null)return s.catalogVersion+":"+string.Join(",",s.completedRanks);
            var liveRanks=new int[LastStandResearchCatalog.LegacyTrackCount];
            Array.Copy(s.completedRanks,liveRanks,liveRanks.Length);
            bool buildcraft=LastStandRunEdition.ForEconomy(shop.EconomyVersion).IsBuildcraft;
            // Retained runs keep their original opaque context format. Only
            // the four original live benefits may change an ongoing sample.
            string context=(buildcraft?LastStandResearchCatalog.Version:LastStandResearchCatalog.LegacyVersion)+":"+string.Join(",",liveRanks);
            if(buildcraft)context+=";l:"+shop.Loadout+";c:"+shop.CombatResearch.ArmorPiercing+","+
                shop.CombatResearch.AreaControl+","+shop.CombatResearch.FieldEngineering;
            if(row.Checkpoint!=null&&row.Checkpoint.Edition.IsSkills)
                context+=";s:"+row.Checkpoint.Skills.Loadout+":"+string.Join(",",row.Checkpoint.Skills.Ranks);
            // The shop freezes deployment levels. Profile purchases made in a
            // running game apply to its next deployment and must not relabel
            // this sample. Stable catalog order keeps both arrays bounded.
            context+=";p:"+string.Join(",",shop.PermanentLevels)+";r:"+string.Join(",",shop.RunPurchases);
            return context;
        }
        static bool TryTerminalShop(Record row,LastStandShopState live,out LastStandShopCheckpoint shop)
        {
            shop=row.Checkpoint.Shop;
            if(live==null)return true;
            if(live.RunId!=shop.RunId || (int)live.Fitting!=shop.Fitting || live.EconomyVersion!=shop.EconomyVersion ||
                !live.Loadout.Equals(shop.Loadout)||!live.CombatResearch.Equals(shop.CombatResearch)||
                live.UniqueKills<shop.UniqueKills || live.FinalAccounting!=null ||
                (live.PurchaseLifecycle!=LastStandShopPurchaseLifecycle.Running &&
                 live.PurchaseLifecycle!=LastStandShopPurchaseLifecycle.Paused &&
                 live.PurchaseLifecycle!=LastStandShopPurchaseLifecycle.CatchingUp))return false;
            var observed=live.CaptureCheckpoint();
            if(observed.PermanentLevels.Count!=shop.PermanentLevels.Count)return false;
            for(int n=0;n<shop.PermanentLevels.Count;n++)
                if(observed.PermanentLevels[n]!=shop.PermanentLevels[n] || observed.RunPurchases[n]<shop.RunPurchases[n])return false;
            shop=observed;return true;
        }
        void InitializeResearch(Record row)
        {
            row.Research=LastStandResearchState.Create(utcNow());
            row.History=new LastStandRunHistory(row.FinalizedRunId);
            if(row.Checkpoint!=null)
                row.History.Begin(row.Checkpoint.RunId,row.Checkpoint.Tier,row.Checkpoint.FittingId,
                    row.Checkpoint.Shop.EconomyVersion,ResearchContext(row),true,row.Checkpoint.CompletedWave);
        }
        static bool UseLiveHistory(Record next,LastStandRunHistory live)
        {
            if(next.Checkpoint==null || next.History.Current==null)return false;
            if(live==null)return true;
            var saved=next.History.Snapshot();var observed=live.Snapshot();
            if(observed.Current==null || observed.Current.RunId!=next.Checkpoint.RunId ||
                observed.LastFinalizedRunId!=saved.LastFinalizedRunId ||
                observed.Current.HighestClearedWave!=saved.Current.HighestClearedWave ||
                observed.Current.RepeatableSalvage!=saved.Current.RepeatableSalvage ||
                observed.Current.MilestoneSalvage!=saved.Current.MilestoneSalvage ||
                observed.Current.ResearchBonusSalvage!=saved.Current.ResearchBonusSalvage)return false;
            next.History=live.Copy();return true;
        }
        public bool TryPreviewResearch(LastStandResearchTime time,out LastStandResearchSnapshot preview)
        {
            preview=null;
            if(!Ready || !committed.Research.TryAdvance(time,out var advance))return false;
            preview=advance.State.Snapshot();return true;
        }
        // Clock ownership transfers only after verified profile persistence. On
        // a readback failure Retry invokes the same callback exactly once.
        public bool TryReconcileResearch(LastStandResearchTime time,Action confirmed=null)
        {
            if(!Ready || !committed.Research.TryAdvance(time,out var advance))return false;
            var next=committed.Copy();next.Research=advance.State;
            return Commit(next,confirmed);
        }
        public bool TryResearchAction(LastStandResearchIntent intent,LastStandResearchTime time,Action confirmed=null)
        {
            if(!Ready || intent==null || intent.ExpectedRevision!=committed.Research.Revision ||
                !committed.Research.TryAdvance(time,out var advance))return false;
            // Elapsed progress may update the revision without changing the
            // displayed action. A completion changes identities/ranks and must
            // be shown before a player can authorize a different purchase.
            if(advance.Completions.Count!=0)
            {
                var reconciled=committed.Copy();reconciled.Research=advance.State;
                Commit(reconciled,confirmed);return false;
            }
            var current=new LastStandResearchIntent { Action=intent.Action,Slot=intent.Slot,Rank=intent.Rank,
                Track=intent.Track,ExpectedRevision=advance.State.Revision,
                ExpectedActiveIdentity=intent.ExpectedActiveIdentity,ExpectedQueuedIdentity=intent.ExpectedQueuedIdentity };
            if(!advance.State.TryApply(current,Wallet,GetBestWave(1),GetBestWave(2),out var change))return false;
            long wallet=(long)Wallet+change.WalletDelta;
            if(wallet<0 || wallet>int.MaxValue)return false;
            var next=committed.Copy();next.Research=change.State;next.Wallet=(int)wallet;
            return Commit(next,confirmed);
        }
    }
}
