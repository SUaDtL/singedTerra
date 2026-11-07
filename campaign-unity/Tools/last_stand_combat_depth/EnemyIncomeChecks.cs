using System;
using System.Collections.Generic;
using System.Reflection;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

static class EnemyIncomeChecks
{
    const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static void Reject(Action action,string message){bool rejected=false;try{action();}catch(ArgumentException){rejected=true;}catch(OverflowException){rejected=true;}Check(rejected,message);}
    static void Set(object owner,string field,object value){var f=owner.GetType().GetField(field,Private);Check(f!=null,"Known fixture field "+field);f.SetValue(owner,value);}
    static readonly MethodInfo Observe=typeof(LastStandShopState).GetMethod("ObserveAuthoritativeKills",new[]{typeof(EncounterModel),typeof(int)});
    static bool Award(LastStandShopState shop,EncounterModel model,int rank)
    {
        // Before the feature this is the actual controller's scalar call. The
        // same test then exercises the new actual typed owner when implemented.
        if(Observe==null)return shop.ObserveAuthoritativeKills(model.Kills,model.Wave,rank);
        try{return (bool)Observe.Invoke(shop,new object[]{model,rank});}catch(TargetInvocationException e){throw e.InnerException;}
    }
    static LastStandShopState Shop(int tier)
    {
        var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[0]=1000;levels[2]=500;levels[3]=100;levels[5]=10;levels[7]=1;
        var ctor=typeof(LastStandShopState).GetConstructor(new[]{typeof(int),typeof(LastStandFitting),typeof(IReadOnlyList<int>),typeof(int)});
        return ctor==null?new LastStandShopState(1,LastStandFitting.Repair,levels):
            (LastStandShopState)ctor.Invoke(new object[]{1,LastStandFitting.Repair,levels,tier});
    }
    static int Multiplier(FoeKind kind)=>kind==FoeKind.ArmoredBrute?2:kind==FoeKind.SiegeElite?8:1;
    static LastStandShopCheckpoint Ordered(bool reverse)
    {
        var shop=Shop(2);var model=EncounterModel.CreatePlayable(shop.Fitting,2,shop);
        Set(model,"nextCannon",int.MaxValue-1);
        int budget=3000;while(model.Spawned<model.WaveEnemyCount&&budget-->0)model.Step();
        Check(budget>0&&model.Kills==0,"Actual cohort spawned before controlled targeting");
        var enemies=new List<EncounterFoe>();foreach(var foe in model.Foes)if(foe.Alive)enemies.Add(foe);
        enemies.Sort((a,b)=>reverse?b.WaveOrdinal.CompareTo(a.WaveOrdinal):a.WaveOrdinal.CompareTo(b.WaveOrdinal));
        int earned=0,baseEarned=0,carry=0,spent=0;
        foreach(var target in enemies){
            foreach(var foe in model.Foes)if(foe.Alive)foe.Distance=100000;
            target.Distance=0;Set(model,"nextCannon",model.Tick+1);int before=model.Kills;model.Step();
            Check(model.Kills==before+1&&!target.Alive,"One real targeted enemy died");
            int reward=3*Multiplier(target.Kind);baseEarned+=reward;int numerator=reward*101*102+carry;
            earned+=numerator/10000;carry=numerator%10000;
            Check(Award(shop,model,1),"New real kill credited");
            Check(shop.BaseEarnedScrap==baseEarned&&shop.EarnedScrap==earned&&shop.Scrap==earned-spent&&shop.IncomeRemainder==carry,
                "Actual "+target.Kind+" kill must pay its authored value and exact fractional carry independently of kill order");
            int version=shop.Version;Check(!Award(shop,model,1)&&shop.Version==version&&shop.EarnedScrap==earned,"Duplicate observation has no payout or mutation");
            if(model.Kills==2){
                var purchase=shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,LastStandUpgradeTrackId.CannonAttack));
                Check(purchase.Accepted&&purchase.ChargedScrap==5,"Actual earned Scrap buys retained first run index");spent=5;model.ApplyShopProjection(shop);
                shop=LastStandShopState.RestoreCheckpoint(shop.CaptureCheckpoint());
                Check(shop.Tier==2&&shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases==1&&shop.SpentScrap==5&&
                    shop.IncomeRemainder==carry&&!Award(shop,model,1),"Partial immutable shop clone retains paid state, identities and fractional carry");
            }
        }
        Check(Observe!=null,"Authoritative typed ledger entry is required");
        Check(model.AwaitingWaveCommit&&model.CompletedWave==1&&shop.IncomeRemainder>0,"Real completed cohort retains fractional income");
        var checkpoint=new LastStandRunCheckpoint(shop.RunId,model.CaptureCheckpoint(),shop.CaptureCheckpoint());
        var resumed=checkpoint.RestoreModel();var restored=checkpoint.RestoreShop();
        Check(resumed.Snapshot()==model.Snapshot()&&restored.Scrap==earned-spent&&restored.SpentScrap==spent&&
            !Award(restored,resumed,1),"Cleared model/shop restore cannot replay a killed identity");
        resumed.ContinueAfterCheckpoint();Check(!Award(restored,resumed,1)&&restored.RewardWave==2&&restored.DefeatedMask==0,
            "Continuation resets only current cohort identity without replaying income");
        return shop.CaptureCheckpoint();
    }
    static void Order()
    {
        var a=Ordered(false);var b=Ordered(true);
        Check(a.EarnedScrap==b.EarnedScrap&&a.BaseEarnedScrap==b.BaseEarnedScrap&&a.IncomeRemainder==b.IncomeRemainder,"Different kill orders conserve complete cohort value");
    }
    static void HighProjection()
    {
        var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[7]=200;
        var shop=new LastStandShopState(1,LastStandFitting.Repair,levels,2);const int wave=2147483600;
        long expected=(3L+20+(wave-200L)/20)*8*3*3;
        var reward=shop.ProjectKillReward(wave,FoeKind.SiegeElite,100);
        Check(expected>int.MaxValue&&reward.NextKillScrap==expected&&reward.EffectiveScrap==expected,
            "Long-lived elite projection remains truthful above wallet range without crediting it");
        Check(shop.Scrap==0&&shop.UniqueKills==0&&shop.Version==0,"Read-only oversized projection cannot mutate a wallet");
    }
    static void Prefix()
    {
        var economy=LastStandEconomyCatalog.Get(LastStandUpgradeCatalog.EconomyVersion);var edition=LastStandRunEdition.Current;
        // Independent authored recipe values, not the production catalog loop.
        var mixes=new[]{new[]{1,1,1,1,1,1,1,1,1,1},new[]{1,1,1,2,1,1,1,1,2,1},
            new[]{1,1,1,2,2,1,1,1,1,2},new[]{1,1,1,2,2,1,1,1,2,2}};
        for(int tier=1;tier<=4;tier++){
            long expected=0;var definition=LastStandTierCatalog.Get(tier);
            for(int wave=1;wave<=5000;wave++){
                int count=Math.Min(20,6+(wave-1)/20);long bounty=3+Math.Min(wave,200)/10+Math.Max(wave-200,0)/20;
                for(int ordinal=0;ordinal<count;ordinal++)expected+=bounty*(tier>1&&wave%50==0&&ordinal==count-1?8:mixes[tier-1][(wave-1+ordinal)%10]);
                if(wave<=400||wave%500==0)Check(economy.BaseScrapThroughCohorts(definition,wave,edition)==expected,"Exact independent complete-cohort prefix tier "+tier+" wave "+wave);
            }
            int last=2147483600;long one=0,baseLast=3+20+(last-200L)/20;
            for(int ordinal=0;ordinal<20;ordinal++)one+=baseLast*(tier>1&&ordinal==19?8:mixes[tier-1][(int)(((long)last-1+ordinal)%10)]);
            Check(economy.BaseScrapThroughCohorts(definition,last,edition)-economy.BaseScrapThroughCohorts(definition,last-1,edition)==one,
                "Large prefix stays exact without iterating the run horizon");
        }
    }
    static void EmptyIdentity()=>Reject(()=>LastStandEconomyCatalog.Get(LastStandUpgradeCatalog.EconomyVersion).BaseScrapForMask(
        LastStandRunEdition.Current.Tier(2),1,0,LastStandRunEdition.Legacy(LastStandUpgradeCatalog.RetainedEconomyVersion)),
        "Empty masks also reject foreign economy identity");
    static string State(LastStandShopState s)=>String.Join("/",s.RunId,s.Tier,s.Version,s.UniqueKills,s.BaseEarnedScrap,s.BonusEarnedScrap,
        s.EarnedScrap,s.SpentScrap,s.Scrap,s.IncomeRemainder,s.RewardWave,s.DefeatedMask,s.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases);
    static void RefuseUnchanged(LastStandShopState shop,Action attempt,string message)
    {string before=State(shop);Reject(attempt,message);Check(State(shop)==before,"Refusal must be atomic: "+message);}
    static void FirstKill(EncounterModel model)
    {int budget=10000;while(model.Kills==0&&model.Status==EncounterStatus.Running&&budget-->0)model.Step();Check(model.Kills==1,"One actual first kill");}
    static void Admission()
    {
        var shop=Shop(2);var model=EncounterModel.CreatePlayable(shop.Fitting,2,shop);
        RefuseUnchanged(shop,()=>Award(shop,EncounterModel.CreatePlayable(LastStandFitting.Repair,1,Shop(1)),1),"Foreign tier");
        RefuseUnchanged(shop,()=>Award(shop,new EncounterModel(LastStandFitting.Launcher,EncounterProfile.ForTier(2)),1),"Foreign fitting");
        foreach(string version in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.RetainedEconomyVersion})
            RefuseUnchanged(shop,()=>Award(shop,new EncounterModel(LastStandFitting.Repair,EncounterProfile.ForTier(2,LastStandRunEdition.Legacy(version))),1),"Foreign complete edition");
        RefuseUnchanged(shop,()=>shop.ObserveAuthoritativeKills(1,1,0),"Mixed-value tier cannot accept a scalar count");
        Reject(()=>EncounterModel.CreatePlayable(shop.Fitting,1,shop),"Current model creation rejects a foreign shop tier");
        RefuseUnchanged(shop,()=>Award(shop,model,101),"Out-of-range research modifier");
        FirstKill(model);int mask=model.CurrentWaveKillMask;
        Set(model,"<CurrentWaveKillMask>k__BackingField",1<<20);
        RefuseUnchanged(shop,()=>Award(shop,model,1),"Out-of-cohort identity");
        Set(model,"<CurrentWaveKillMask>k__BackingField",0);
        RefuseUnchanged(shop,()=>Award(shop,model,1),"Counter without matching killed identity");
        Set(model,"<CurrentWaveKillMask>k__BackingField",mask);Check(Award(shop,model,1),"Genuine kill remains admissible after refusals");
        int foreignBit=mask==1?2:1;Set(model,"<CurrentWaveKillMask>k__BackingField",foreignBit);
        RefuseUnchanged(shop,()=>Award(shop,model,1),"Replacing an already paid identity");
        Set(model,"<CurrentWaveKillMask>k__BackingField",mask);
        Set(model,"<Wave>k__BackingField",2);Set(model,"<Kills>k__BackingField",6);Set(model,"<CurrentWaveKillMask>k__BackingField",0);
        RefuseUnchanged(shop,()=>Award(shop,model,1),"Cannot skip an incomplete cohort");
        Set(model,"<Wave>k__BackingField",1);Set(model,"<Kills>k__BackingField",1);Set(model,"<CurrentWaveKillMask>k__BackingField",mask);
        Check(!Award(shop,model,1),"Original identity remains paid only once");
        var atLimit=Shop(2);Set(atLimit,"<Version>k__BackingField",int.MaxValue);
        RefuseUnchanged(atLimit,()=>Award(atLimit,model,1),"Late checked epoch overflow leaves all income fields unchanged");
        var scalar=Shop(1);Check(scalar.ObserveAuthoritativeKills(6)&&LastStandShopState.RestoreCheckpoint(scalar.CaptureCheckpoint()).BaseEarnedScrap==18,
            "Equal-value Tier1 compatibility remains exact");
    }
    sealed class Store:ILastStandStorage,ILastStandStorageOwnership
    {
        public string Raw,Fault;public int Writes;public bool Owner=true;bool readback;
        public bool CanWrite=>Owner;
        public string Read(){if(readback){readback=false;if(Fault=="readback")throw new Exception("readback denied");if(Fault=="mismatch")return Raw+" ";}return Raw;}
        public void Write(string value){if(Fault=="before")throw new Exception("write denied");Raw=value;Writes++;readback=Fault=="readback"||Fault=="mismatch";if(Fault=="after")throw new Exception("unconfirmed write");}
    }
    static LastStandProgression Load(Store s)=>LastStandProgression.Load(s,()=>1790000000000L);
    static Dictionary<string,object> Obj(object value)=>LastStandSaveJson.Object(value);
    static Store Strong()
    {
        var s=new Store();Check(Load(s).SaveState=="ready","Fresh isolated profile");var data=LastStandSaveJson.Read(s.Raw);
        var levels=Obj(data["permanentLevels"]);levels["cannonAttack"]=1000;levels["hullCapacity"]=500;levels["armor"]=100;levels["fieldRepair"]=10;levels["scrapYield"]=1;
        var tiers=Obj(data["tierRecords"]);Obj(tiers["tier-1"])["bestWave"]=300;Obj(tiers["tier-2"])["unlocked"]=true;
        data["firstClears"]=new List<object>{"tier-1:wave-10","tier-1:wave-100","tier-1:wave-200","tier-1:wave-25","tier-1:wave-300","tier-1:wave-50"};
        data["unlockedFittings"]=new List<object>{"launcher","repair","scattergun"};data["selectedTier"]=2;data["credits"]=100;
        s.Raw=LastStandSaveJson.Write(data);Check(Load(s).SaveState=="ready","Valid authored progression fixture");return s;
    }
    static void Clear(EncounterModel model,LastStandShopState shop,bool buy=false)
    {
        int budget=20000;bool purchased=false;
        while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0){
            model.Step();Award(shop,model,1);
            if(buy&&!purchased&&shop.Scrap>=5){
                var result=shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,LastStandUpgradeTrackId.CannonAttack));
                Check(result.Accepted&&result.ChargedScrap==5,"Actual owner fixture purchase");model.ApplyShopProjection(shop);purchased=true;
            }
        }
        Check(model.AwaitingWaveCommit&&budget>0&&(!buy||purchased),"Real sequential wave completes");
    }
    static void Faults()
    {
        foreach(string fault in new[]{"before","after","readback","mismatch","ownership"}){
            var store=Strong();var p=Load(store);Check(p.TryDeploy(),"Tier2 deploy");var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
            Clear(model,shop,true);int wallet=p.Wallet;string raw=store.Raw;int writes=store.Writes;
            store.Fault=fault;store.Owner=fault!="ownership";
            Check(!p.TryCommitWave(model,shop)&&p.SaveState!="ready"&&p.Wallet==wallet&&p.Checkpoint.CompletedWave==0,
                "Unconfirmed boundary cannot expose optimistic banked progression: "+fault);
            if(fault=="before"||fault=="ownership")Check(store.Raw==raw&&store.Writes==writes,"No bytes changed before admission");
            store.Fault=null;store.Owner=true;Check(p.Retry(),"Retry reconciles durable owner");
            if(fault=="ownership")Check(p.TryCommitWave(model,shop),"Boundary remains available after ownership recovery");
            Check(p.Checkpoint.CompletedWave==1&&store.Writes==writes+1&&p.Wallet==wallet+LastStandRewardCatalog.At(LastStandTierCatalog.Get(2),1).RepeatableSalvage,
                "One committed boundary and exact Salvage, despite retry");
            Check(!p.TryCommitWave(model,shop)&&p.Retry()&&store.Writes==writes+1,"No repeat boundary award/write");
            var reloaded=Load(store);var restored=reloaded.Checkpoint.RestoreShop();var resumed=reloaded.Checkpoint.RestoreModel();
            Check(restored.Tier==2&&restored.RewardWave==1&&restored.DefeatedMask==63&&restored.SpentScrap==5&&
                restored.Scrap==shop.Scrap&&restored.IncomeRemainder==shop.IncomeRemainder&&restored.PurchaseLifecycle==LastStandShopPurchaseLifecycle.Paused,
                "Paid typed ledger resumes paused from one whole durable checkpoint");
            Check(!Award(restored,resumed,1),"Restored cleared mask does not repay");
            resumed.ContinueAfterCheckpoint();Clear(resumed,restored);Check(reloaded.TryCommitWave(resumed,restored),"Next actual cohort commits normally");
            Check(restored.BaseEarnedScrap>shop.BaseEarnedScrap&&restored.UniqueKills==12,"Only subsequent real identities add income");
        }
        var conflictStore=Strong();var owner=Load(conflictStore);owner.TryDeploy();var m=owner.Checkpoint.RestoreModel();var s=owner.Checkpoint.RestoreShop();Clear(m,s);
        conflictStore.Fault="after";Check(!owner.TryCommitWave(m,s),"Unconfirmed write fixture");conflictStore.Fault=null;
        string foreign=conflictStore.Raw+" ";conflictStore.Raw=foreign;int count=conflictStore.Writes;
        Check(!owner.Retry()&&owner.SaveState=="blocked"&&conflictStore.Raw==foreign&&conflictStore.Writes==count,"Unconfirmed candidate cannot overwrite a new owner");
    }
    static void Tamper()
    {
        var store=Strong();var p=Load(store);p.TryDeploy();var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();Clear(model,shop,true);
        Check(p.TryCommitWave(model,shop),"Valid typed checkpoint control");string good=store.Raw;
        foreach(string field in new[]{"tier","rewardWave","defeatedMask","baseEarnedScrap","incomeRemainder","version","spentScrap","uniqueKills","runPurchases"}){
            var data=LastStandSaveJson.Read(good);var saved=Obj(Obj(data["checkpoint"])["shop"]);
            if(field=="runPurchases")Obj(saved[field])["cannonAttack"]=2;
            else saved[field]=field=="tier"?1:field=="rewardWave"?2:field=="defeatedMask"?31:field=="incomeRemainder"?10000:
                field=="version"?2:LastStandSaveJson.Integer(saved[field])+1;
            string bad=LastStandSaveJson.Write(data);var invalid=new Store{Raw=bad};
            Check(Load(invalid).SaveState=="blocked"&&invalid.Raw==bad&&invalid.Writes==0,"Tampered typed checkpoint preserved and rejected: "+field);
        }
        foreach(string field in new[]{"tier","rewardWave","defeatedMask"}){
            var data=LastStandSaveJson.Read(good);Obj(Obj(data["checkpoint"])["shop"]).Remove(field);string bad=LastStandSaveJson.Write(data);var invalid=new Store{Raw=bad};
            Check(Load(invalid).SaveState=="blocked"&&invalid.Raw==bad,"New schema cannot infer omitted identity: "+field);
        }
        Check(Load(new Store{Raw=good}).Checkpoint.CompletedWave==1,"Unmodified current schema roundtrips after negative controls");
    }
    static void Legacy()
    {
        foreach(string version in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.RetainedEconomyVersion}){
            var edition=LastStandRunEdition.Legacy(version);var economy=LastStandEconomyCatalog.Get(version);var levels=new int[economy.Tracks.Count];
            foreach(var track in economy.Tracks)levels[(int)track.Id]=Math.Min(track.PermanentCap,track.Id==LastStandUpgradeTrackId.ScrapYield?1:100);
            var cp=LastStandRunCheckpoint.Start(1,2,"repair",levels,edition);var model=cp.RestoreModel();var shop=cp.RestoreShop();
            Check(shop.Tier==2,"Old schema binds tier from enclosing encounter");
            for(int wave=1;wave<=3;wave++){
                Clear(model,shop);Check(shop.BaseEarnedScrap==economy.BaseScrapThroughKills(model.Kills),"Retained scalar base remains exact through actual typed controller call");
                cp=new LastStandRunCheckpoint(1,model.CaptureCheckpoint(),shop.CaptureCheckpoint());
                Check(cp.Shop.SchemaVersion==LastStandShopCheckpoint.PreviousVersion&&cp.Edition.EconomyVersion==version,"Legacy checkpoint does not change income schema or edition");
                model=cp.RestoreModel();shop=cp.RestoreShop();Check(!Award(shop,model,1),"Retained restored boundary no replay");model.ContinueAfterCheckpoint();
            }
        }
    }
    static int Main(string[] args){try{switch(args[0]){case "order":Order();break;case "high":HighProjection();break;case "prefix":Prefix();break;
        case "empty":EmptyIdentity();break;case "admission":Admission();break;case "faults":Faults();break;case "tamper":Tamper();break;case "legacy":Legacy();break;
        default:throw new Exception("Unknown case");}Console.WriteLine("PASS "+args[0]);return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
