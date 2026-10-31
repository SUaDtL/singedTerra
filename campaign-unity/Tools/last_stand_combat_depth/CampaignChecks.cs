using System;
using System.Linq;
using System.Collections.Generic;
using SingedTerra.Encounter;
using SingedTerra.LastStand;
static class CampaignChecks
{
    sealed class Store:ILastStandStorage,ILastStandStorageOwnership
    {
        public string Raw,Fault;public int Writes;public bool Owner=true;bool readback;
        public bool CanWrite=>Owner;
        public string Read(){if(readback){readback=false;if(Fault=="readback")throw new Exception("readback denied");if(Fault=="mismatch")return Raw+" ";}return Raw;}
        public void Write(string value){if(Fault=="before")throw new Exception("write denied");Raw=value;Writes++;readback=Fault=="readback"||Fault=="mismatch";if(Fault=="after")throw new Exception("unconfirmed");}
    }
    static void Check(bool b,string m){if(!b)throw new Exception(m);}
    static LastStandProgression Load(Store s)=>LastStandProgression.Load(s,()=>1790000000000L);
    static Store Gifted()
    {
        var s=new Store();Check(Load(s).SaveState=="ready","Fresh isolated save");
        var data=LastStandSaveJson.Read(s.Raw);var levels=LastStandSaveJson.Object(data["permanentLevels"]);
        // Gifted levels accelerate genuine sequential cohort/transaction tests;
        // no earned economy or player qualification is claimed.
        foreach(var definition in LastStandUpgradeCatalog.Tracks)levels[definition.Key]=definition.PermanentCap;
        s.Raw=LastStandSaveJson.Write(data);Check(Load(s).SaveState=="ready","Gifted fixture accepted");return s;
    }
    static void Clear(EncounterModel m,LastStandShopState shop)
    {
        int limit=40000;while(!m.AwaitingWaveCommit&&m.Status==EncounterStatus.Running&&limit-->0){m.Step();shop.ObserveAuthoritativeKills(m,0);}
        Check(limit>0&&m.AwaitingWaveCommit&&m.Hull>0,"Actual cohort cleared alive");
    }
    static void Advance(LastStandProgression p,EncounterModel m,LastStandShopState shop,int end)
    {
        while(m.CompletedWave<end){Clear(m,shop);Check(p.TryCommitWave(m,shop),"Sequential wave committed");if(m.CompletedWave<end)m.ContinueAfterCheckpoint();}
    }
    static void Sequential()
    {
        var s=Gifted();var p=Load(s);long expected=0;
        for(int tier=1;tier<=4;tier++){
            Check(LastStandTierCatalog.Get(tier).Playable,"Four authored campaign tiers must be playable");
            Check(p.IsTierUnlocked(tier)&&p.TrySelectTier(tier)&&p.TryDeploy(),"Explicit earned tier deployment");
            var m=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();int run=p.ActiveRunId;
            for(int wave=1;wave<=300;wave++){
                Clear(m,shop);if(tier<4&&wave==299)Check(!p.IsTierUnlocked(tier+1),"No early tier unlock");
                var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(tier),wave);expected+=reward.RepeatableSalvage+reward.FirstClearSalvage;
                Check(p.TryCommitWave(m,shop),"Actual campaign boundary commit");
                Check(p.Wallet==expected&&p.ActiveRunId==run&&p.SelectedTier==tier&&p.ActiveTier==tier&&m.Profile.Tier==tier,"Unlock never promotes, terminates, or adds extra Salvage");
                if(wave<300)m.ContinueAfterCheckpoint();
            }
            if(tier<4)Check(p.IsTierUnlocked(tier+1)&&!p.TrySelectTier(tier+1)&&p.LastReceipt.UnlockedTier==tier+1,"Unlock visible but active run selection immutable");
            Check(p.TryFinalizeRun(null,"abandon")&&p.Wallet==expected,"Explicit end has no extra payout");p=Load(s);
        }
        Check(p.SelectedTier==4&&p.GetBestWave(4)==300,"Four independent earned tier records retained");
    }
    static void Preview()
    {
        var s=Gifted();var p=Load(s);string raw=s.Raw;int writes=s.Writes;
        for(int unlocked=1;unlocked<=4;unlocked++){
            int last=unlocked;var selector=new LastStandSelection(LastStandContentCatalog.Current.TierOptions(id=>id<=last,null,true),"1",true);
            Check(selector.Count==Math.Min(4,unlocked+1),"Only unlocked tiers and first locked preview appear");
            while(selector.Move(1)){}Check(selector.Current.Id==Math.Min(4,unlocked+1).ToString(),"Arrow endpoint matches first lock");
            if(unlocked<4)Check(!selector.Current.Unlocked,"Last choice is preview only");
        }
        Check(!p.TrySelectTier(3)&&!p.TrySelectTier(4)&&s.Raw==raw&&s.Writes==writes,"Locked preview cannot save or select");
        var all=LastStandContentCatalog.Current.FittingOptions(_=>false);var fitting=new LastStandSelection(all,"repair",false);
        Check(fitting.Count==5,"Five fittings use the same bounded window");while(fitting.Move(1)){}Check(fitting.Current.Id=="railgun"&&!fitting.Current.Unlocked,"Final fitting preview keeps lock");
        Check(LastStandContentCatalog.Current.EnvironmentForTier(3).Name=="Cinder Basin"&&LastStandContentCatalog.Current.EnvironmentForTier(4).Name=="Storm Foundry","Stable environment identities");
    }
    static void Atomic()
    {
        var seed=Gifted();var p=Load(seed);
        for(int tier=1;tier<=3;tier++){
            Check(p.TrySelectTier(tier)&&p.TryDeploy(),"Sequential test deployment");var m=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
            Advance(p,m,shop,299);string before=seed.Raw;int wallet=p.Wallet;int run=p.ActiveRunId;
            foreach(string fault in new[]{"before","after","readback","mismatch","ownership"}){
                var store=new Store{Raw=before};var test=Load(store);var boundary=test.Checkpoint.RestoreModel();var income=test.Checkpoint.RestoreShop();boundary.ContinueAfterCheckpoint();Clear(boundary,income);
                int writes=store.Writes;store.Fault=fault;store.Owner=fault!="ownership";
                Check(!test.TryCommitWave(boundary,income)&&test.Wallet==wallet&&!test.IsTierUnlocked(tier+1)&&test.LastReceipt==null&&test.Checkpoint.CompletedWave==299,"Unconfirmed unlock cannot publish receipt or candidate state");
                if(fault=="before"||fault=="ownership")Check(store.Raw==before&&store.Writes==writes,"Prewrite failure preserves bytes");
                store.Fault=null;store.Owner=true;Check(test.Retry(),"Atomic boundary retry");if(fault=="ownership")Check(test.TryCommitWave(boundary,income),"Reacquired owner submits untouched intent");
                int expected=wallet+LastStandRewardCatalog.At(LastStandTierCatalog.Get(tier),300).RepeatableSalvage+150;
                Check(test.Wallet==expected&&test.IsTierUnlocked(tier+1)&&test.LastReceipt.UnlockedTier==tier+1&&test.ActiveRunId==run&&test.ActiveTier==tier&&test.SelectedTier==tier&&store.Writes==writes+1,"One confirmed award, unlock and same run");
                string committed=store.Raw;Check(!test.TryCommitWave(boundary,income)&&test.Retry()&&store.Raw==committed&&store.Writes==writes+1,"Duplicate commit/retry cannot award twice");
                var again=Load(store);Check(again.Wallet==expected&&again.IsTierUnlocked(tier+1)&&again.LastReceipt==null&&store.Raw==committed&&store.Writes==writes+1,"Reload does not replay receipt or reward");
            }
            m.ContinueAfterCheckpoint();Clear(m,shop);Check(p.TryCommitWave(m,shop)&&p.TryFinalizeRun(null,"abandon"),"Continue original real campaign");
            // Replay the same tier through its actual 300 cohorts: repeatable only.
            int previous=p.Wallet;Check(p.TryDeploy(),"Replay deploy");m=p.Checkpoint.RestoreModel();shop=p.Checkpoint.RestoreShop();Advance(p,m,shop,300);
            int repeatable=0;for(int wave=1;wave<=300;wave++)repeatable+=LastStandRewardCatalog.At(LastStandTierCatalog.Get(tier),wave).RepeatableSalvage;
            Check(p.Wallet==previous+repeatable&&p.LastReceipt.MilestoneId==null&&p.LastReceipt.UnlockedTier==0,"Repeat clears never replay first-clear award/unlock");Check(p.TryFinalizeRun(null,"abandon"),"Explicit replay end");
        }
    }
    static void Discovery()
    {
        string next=LastStandTierHudText.NextMilestone(1,499);
        Check(next.Contains("500")&&next.Contains("250")&&next.Contains("Mortar"),"Compact next goal must disclose actual bonus and Mortar unlock");
        Check(LastStandTierHudText.NextMilestone(2,299).Contains("Tier 3"),"Next tier unlock is discoverable");
    }
    static void Manual()
    {
        var store=Gifted();var p=Load(store);string raw=store.Raw;int writes=store.Writes;
        var guidance=new LastStandGuidance();guidance.Configure(false,false);guidance.EnterFirstRun();guidance.PurchaseConfirmed(LastStandUpgradeTrackId.CannonAttack,0);
        Check(guidance.Tutorial==""&&guidance.Suggestion=="","Optional prompts disabled");
        string help=LastStandGuidance.Help;Check(help.Contains("Mortar")&&help.Contains("500")&&help.Contains("Railgun")&&help.Contains("Tier 2 wave 100"),"Manual discovery survives both opt-outs");
        var current=LastStandMilestonePresentation.Rows(1);var mortar=current.Single(x=>x.Milestone.Wave==500);
        Check(mortar.Milestone.FirstClearSalvage==250&&mortar.BaseRepeatableSalvage==6&&mortar.Unlock=="Mortar","Read model uses actual authored reward and fitting");
        var road=LastStandMilestonePresentation.Roadmap(1,p.HasFirstClear);
        Check(road.Contains("Base rewards exclude Salvage Recovery")&&road.Contains(mortar.Describe(false))&&!road.Contains("Tier 3")&&!road.Contains("Tier 4"),"Roadmap exposes only this tier and its next tier, labels base values");
        var legacy=LastStandRunEdition.Legacy(LastStandUpgradeCatalog.PreviousEconomyVersion);
        string old=LastStandMilestonePresentation.Roadmap(1,_=>false,legacy);
        Check(!old.Contains("Mortar")&&!old.Contains("Railgun")&&old.Contains("original reward edition"),"Retained run does not promise current-only rewards");
        Check(!LastStandMilestonePresentation.Roadmap(2,_=>false,legacy).Contains("Tier 3"),"Legacy tier2 cannot advertise a new-edition milestone");
        foreach(var tier in LastStandTierCatalog.All){
            foreach(var row in LastStandMilestonePresentation.Rows(tier.Id)){
                Check(row.Compact.Split('\n').Length<=2,"Compact goal has two-line maximum");
                foreach(var line in row.Compact.Split('\n'))Check(line.Length<=42,"Compact goal narrow text budget");
            }
        }
        Check(store.Raw==raw&&store.Writes==writes,"All discovery projections are read-only");
    }
    static void Fittings()
    {
        var store=Gifted();var p=Load(store);
        for(int tier=1;tier<=2;tier++){
            Check(p.TrySelectTier(tier)&&p.TryDeploy(),"Earned fitting campaign deploy");var m=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
            int end=tier==1?500:100;
            for(int wave=1;wave<=end;wave++){
                Clear(m,shop);string unlock=tier==1&&wave==100?"scattergun":tier==1&&wave==500?"mortar":tier==2&&wave==100?"railgun":null;
                if(unlock!=null){
                    int wallet=p.Wallet,writes=store.Writes;string raw=store.Raw;var priorReceipt=p.LastReceipt;store.Fault="before";
                    Check(!p.TryCommitWave(m,shop)&&!p.IsFittingUnlocked(unlock)&&p.Wallet==wallet&&store.Raw==raw&&store.Writes==writes&&ReferenceEquals(priorReceipt,p.LastReceipt),"Fitting unlock and new receipt wait for durable save");
                    store.Fault=null;Check(p.Retry()&&p.IsFittingUnlocked(unlock)&&p.LastReceipt.UnlockedFitting==unlock&&store.Writes==writes+1,"Exactly one confirmed fitting unlock");
                    var receipt=p.LastReceipt;string text=LastStandTierHudText.WaveReceipt(receipt.Wave,receipt.Salvage,receipt.MilestoneId!=null,receipt.UnlockedFitting,receipt.UnlockedTier);
                    Check(text.Contains(unlock.ToUpperInvariant()+" UNLOCKED")&&text.Contains("+"+(p.Wallet-wallet)+" SALVAGE"),"Receipt names actual persisted award, not projected amount");
                    raw=store.Raw;Check(!p.TryCommitWave(m,shop)&&p.Retry()&&store.Raw==raw&&store.Writes==writes+1,"Fitting retry/duplicate has no new payout");
                }else Check(p.TryCommitWave(m,shop),"Sequential fitting boundary");
                Check(p.SelectedFitting=="repair"&&p.Checkpoint.FittingId=="repair","New fitting never auto-equips");
                if(wave<end)m.ContinueAfterCheckpoint();
            }
            Check(p.TryFinalizeRun(null,"abandon"),"Explicit campaign transition");p=Load(store);
        }
        foreach(var fitting in LastStandFittingCatalog.Definitions)Check(p.IsFittingUnlocked(fitting.Id),"Every fitting unlocked by actual milestones");
    }
    static int Main(string[] args){try{switch(args[0]){case "sequential":Sequential();break;case "preview":Preview();break;case "atomic":Atomic();break;case "discovery":Discovery();break;case "manual":Manual();break;case "fittings":Fittings();break;default:throw new Exception("Unknown case");}Console.WriteLine("PASS "+args[0]);return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
