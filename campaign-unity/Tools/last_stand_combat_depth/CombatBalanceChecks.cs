using System;
using System.Collections.Generic;
using SingedTerra.LastStand;

public static class CombatBalanceChecks
{
    static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
    static void Reject(Action action,string message){bool rejected=false;try{action();}catch(InvalidOperationException){rejected=true;}Check(rejected,message);}
    public static void Run(string name)
    {
        switch(name){
        case "conservation":
            CombatBalanceMeasurements.ValidateIncome(100,60,30,10,40,20,40);
            Reject(()=>CombatBalanceMeasurements.ValidateIncome(100,60,30,10,41,20,40),"Reject one free Salvage");
            Reject(()=>CombatBalanceMeasurements.ValidateIncome(100,90,30,10,40,20,40),"Reject first-clear counted again as repeatable");
            Reject(()=>CombatBalanceMeasurements.ValidateIncome(100,60,30,10,40,20,0),"Reject free research without its debit");
            Reject(()=>CombatBalanceMeasurements.ValidateIncome(long.MaxValue,long.MaxValue,1,0,0,0,0),"Reject sum overflow");break;
        case "cadence":
            var c=new CombatBalanceMeasurements.Cadence();
            Check(!c.Due(0)&&!c.Due(899999),"No purchase before 900 real seconds");
            Check(c.Due(900000)&&!c.Due(900000)&&!c.Due(900001),"Exactly one purchase opportunity at deadline");
            Check(c.Due(3600000)&&!c.Due(3600000)&&!c.Due(3600001),"A delayed observation cannot replay missed purchases");break;
        case "actual-waves":
            var actual=new CombatBalanceMeasurements.Context();string empty=actual.Store.Raw;
            var first=CombatBalanceMeasurements.Run(actual,1,"launcher","none",2,10000,1);
            Check((long)first["repeatableSalvage"]==1&&(long)first["firstClearSalvage"]==0&&actual.Profile.Wallet==1,"Wave1 earns exactly one real Salvage");
            Check((int)first["earnedScrap"]==18&&(int)first["kills"]==6&&(int)first["purchaseIntents"]==0,"Six actual kills earn18 Scrap without purchases");
            var again=CombatBalanceMeasurements.Run(actual,1,"launcher","none",2,10000,1);
            Check(actual.Profile.Wallet==2&&actual.Gross==2&&(long)again["firstClearSalvage"]==0&&actual.Store.Raw!=empty,"Second actual deployment adds exactly one reward");actual.Audit();break;
        case "equal-budget":
            var origin=new CombatBalanceMeasurements.Context();CombatBalanceMeasurements.Run(origin,1,"launcher","afterKill",2,30000);
            var seed=new CombatBalanceMeasurements.Seed(origin,0);var a=seed.Fork();var b=seed.Fork();
            Check(a.Store.Raw==b.Store.Raw&&a.Profile.Wallet==b.Profile.Wallet&&a.Gross==b.Gross,"Comparison starts with exact identical earned profile bytes");
            var repair=CombatBalanceMeasurements.Run(a,1,"repair","none",2,30000);var launcher=CombatBalanceMeasurements.Run(b,1,"launcher","none",2,30000);
            Check((int)repair["ticks"]!=(int)launcher["ticks"]|| (int)repair["finalHull"]!=(int)launcher["finalHull"],"Real fitting mechanics produce distinct matchups at equal investment");
            Check(origin.Store.Raw==seed.Raw,"Comparisons cannot mutate earned parent bytes");
            Reject(()=>CombatBalanceMeasurements.Run(seed.Fork(),4,"railgun","none",10,100),"Unfunded fitting/tier/speed cannot become earned comparison");break;
        case "research-calendar":
            var funded=new CombatBalanceMeasurements.Context();
            for(int n=0;n<16&&funded.Profile.GetBestWave(1)<25;n++){
                CombatBalanceMeasurements.BuyPermanent(funded,funded.Gross/2,false);
                CombatBalanceMeasurements.Run(funded,1,"launcher","afterKill",2,100000,25);
            }
            Check(funded.Profile.GetBestWave(1)>=25,"Research slot comes from actual earned clears");
            while(funded.Gross<40)CombatBalanceMeasurements.Run(funded,1,"launcher","afterKill",2,100000,25);
            long gross=funded.Gross;int wallet=funded.Profile.Wallet;CombatBalanceMeasurements.FundResearch(funded);
            Check(funded.Profile.Wallet==wallet-20&&funded.ResearchSpent==20&&funded.Profile.MaximumGameSpeed==1,"Rank1 charges20 before granting any speed");
            var project=funded.Profile.ResearchSnapshot.slots[0].active;Check(project.durationMilliseconds==600000,"Independent ten real minute rank1 duration");
            funded.Clock.Elapsed+=599999;Check(funded.Research.Reconcile()&&funded.Profile.MaximumGameSpeed==1,"No early research completion");
            funded.Clock.Elapsed+=2;Check(funded.Research.Reconcile()&&funded.Profile.MaximumGameSpeed==1.5&&funded.Gross==gross,"Only elapsed unscaled paid research grants1.5x; no idle income (1ms floating clock admission allowance)");funded.Audit();break;
        case "early-cap":
            foreach(var entry in CombatBalanceMeasurements.EarlyAffordabilityBounds()){
                var bound=(Dictionary<string,object>)entry;
                Check((long)bound["salvageUpper"]==9342&&(long)bound["scrapUpper"]==12096000,"Independent generous bounds include every foe at elite8x and free maximum income research");
                Check((int)bound["maximumPermanentRanks"]+(int)bound["maximumTemporaryRanks"]==(int)bound["maximumCombinedRanks"]&&(int)bound["maximumCombinedRanks"]<5000,"Even independently affordable permanent PLUS run ranks cannot cap the track");
            }break;
        case "production-baselines":
            foreach(int tier in new[]{1,2,3,4})foreach(int wave in new[]{1,10,25,100,300,500,2000,5000}){
                var cohort=LastStandWaveCatalog.ForWave(tier,wave);
                Check(cohort.EnemyCount==Math.Min(20,6+(wave-1)/20)&&cohort.SpawnIntervalTicks==(wave<100?28:36),"No accelerated spawning or reduced cohort fakes pacing");
                Check(LastStandRewardCatalog.At(LastStandTierCatalog.Get(tier),wave).RepeatableSalvage==1+wave/100+(tier-1)*Math.Max(0,wave-100)/100,"Independent repeatable reward equation rejects inflated rewards");
            }break;
        case "farm-rate":
            Check(LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),100).RepeatableSalvage==2,"Tier1wave100 repeatable2");
            Check(LastStandRewardCatalog.At(LastStandTierCatalog.Get(2),1).RepeatableSalvage==1,"Tier2onboarding repeatable1");
            var sample=new LastStandRunSummary(1,1,"launcher",LastStandUpgradeCatalog.EconomyVersion,"","",100,"abandon",false,3600000,0,0,100,50000,10,new long[]{0,3600000,0,0,0,0,0,0,0,0});
            Check(sample.FarmingRate==110,"One-time50000 cannot inflate repeatable rate110/hour");break;
        case "report-stream":
            var rows=new List<object>();for(int n=0;n<10000;n++)rows.Add(CombatBalanceMeasurements.D("id",n,"text","quoted \"value\"\n"));
            var writer=new System.IO.StringWriter();CombatBalanceMeasurements.WriteReport(writer,CombatBalanceMeasurements.D("rows",rows));
            string text=writer.ToString();Check(text.StartsWith("{\"rows\":[{\"id\":0,")&&text.EndsWith("}]}"),"Large report keeps exact nested structure");
            Check(text.Contains("\"id\":9999,")&&text.Contains("quoted \\\"value\\\"\\u000a"),"Report streams full final row and escaped text");break;
        case "time-bins":
            var direct=new LastStandRunHistory();var batched=new LastStandRunHistory();var ledger=new CombatBalanceMeasurements.TimeLedger();
            direct.Begin(1,1,"launcher",LastStandUpgradeCatalog.EconomyVersion,"");batched.Begin(1,1,"launcher",LastStandUpgradeCatalog.EconomyVersion,"");
            for(int tick=0;tick<1000;tick++){
                double speed=(tick%10+1)*.5;long ms=17+tick%31;direct.AddActiveTime(ms,speed);ledger.Add(ms,speed);
                if(tick%127==0)ledger.Flush(batched);
            }
            ledger.Flush(batched);ledger.Flush(batched);
            Check(direct.Current.ActiveMilliseconds==batched.Current.ActiveMilliseconds,"Batched flush preserves exact active time through speed changes");
            for(int bin=0;bin<10;bin++)Check(direct.Current.SpeedMilliseconds[bin]==batched.Current.SpeedMilliseconds[bin],"Every actual history speed bin matches per-observation accounting");break;
        case "milestone-repeat":
            var milestone=new CombatBalanceMeasurements.Context();
            var firstTen=CombatBalanceMeasurements.Run(milestone,1,"launcher","afterKill",2,30000,10);
            var secondTen=CombatBalanceMeasurements.Run(milestone,1,"launcher","afterKill",2,30000,10);
            Check((long)firstTen["repeatableSalvage"]==10&&(long)firstTen["firstClearSalvage"]==5&&(long)secondTen["repeatableSalvage"]==10&&(long)secondTen["firstClearSalvage"]==0,"Actual wave10 first-clear5 is paid once while repeatable10 remains repeatable");break;
        case "role-events":
            foreach(var fitting in new[]{LastStandFitting.Mortar,LastStandFitting.Railgun}){
                // Gifted strength is solely an observer regression fixture, not earned evidence.
                var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[(int)LastStandUpgradeTrackId.HullCapacity]=500;levels[(int)LastStandUpgradeTrackId.Armor]=500;
                var shop=new LastStandShopState(1,fitting,levels,tier:2);var model=SingedTerra.Encounter.EncounterModel.CreatePlayable(fitting,2,shop);var effects=new CombatBalanceMeasurements.RoleEffects();
                while(model.Status==SingedTerra.Encounter.EncounterStatus.Running&&model.Tick<100000){
                    model.Step();effects.Observe(model);shop.ObserveAuthoritativeKills(model,0);
                    var observed=effects.Snapshot();if(fitting==LastStandFitting.Mortar?(int)observed["mortarMultiTargetCasts"]>0:(long)observed["railgunEffectiveArmorBypass"]>0)break;
                    if(model.AwaitingWaveCommit&&!model.ContinueAfterCheckpoint())break;
                }
                var result=effects.Snapshot();Check(fitting==LastStandFitting.Mortar?(int)result["mortarAdditionalTargets"]>0:(long)result["railgunEffectiveArmorBypass"]>0,"Actual continuous role effect is observed: "+fitting);
                long attributed=0;foreach(var row in (List<object>)result["damageByWeaponAndEnemy"])attributed+=(long)((Dictionary<string,object>)row)["kills"];
                Check(attributed==model.Kills,"Actual kill identities have exactly one weapon/type attribution");
            }break;
        case "split-investment":
            var originSplit=new CombatBalanceMeasurements.Context();CombatBalanceMeasurements.Run(originSplit,1,"launcher","afterKill",2,100000,25);
            var splitSeed=new CombatBalanceMeasurements.Seed(originSplit,0);var left=splitSeed.Fork();var right=splitSeed.Fork();
            left.Profile.TrySelectFitting("repair");right.Profile.TrySelectFitting("launcher");
            var leftAllocation=CombatBalanceMeasurements.BuySplit(left);var rightAllocation=CombatBalanceMeasurements.BuySplit(right);
            Check(left.GetType()==right.GetType()&&left.Gross==right.Gross,"Same earned available budget");
            Check((long)leftAllocation["auxiliarySpent"]>0&&(long)rightAllocation["auxiliarySpent"]>0,"Supplemental allocation actually funds both distinct auxiliaries");
            Check(left.Profile.GetPermanentLevel(LastStandUpgradeTrackId.FieldRepair)>0&&right.Profile.GetPermanentLevel(LastStandUpgradeTrackId.LauncherAttack)>0,"Actual paid auxiliary levels, no source-free projection");
            left.Audit();right.Audit();Check(originSplit.Store.Raw==splitSeed.Raw,"Allocation branches preserve parent bytes");break;
        case "active-fork":
            var unlockSource=new CombatBalanceMeasurements.Context();CombatBalanceMeasurements.Seed captured=null;
            CombatBalanceMeasurements.Run(unlockSource,1,"launcher","afterKill",2,30000,10,(profile,model)=>{if(model.CompletedWave==10)captured=new CombatBalanceMeasurements.Seed(profile,0);});
            Check(captured!=null,"Actual confirmed boundary captured");var abandoned=captured.Fork();
            Check(!abandoned.Profile.HasCheckpoint&&abandoned.Gross==15&&abandoned.Profile.Wallet==15,"Fork performs real abandon without replaying rewards or adding currency");
            Check(abandoned.Profile.HistorySnapshot.Recent[0].FinishReason=="abandon","Actual application finalization is retained");break;
        default:throw new ArgumentException("Unknown check "+name);
        }
    }
}
