using System;
using SingedTerra.LastStand;

static class EconomyProgressionChecks
{
    static void Check(bool value,string message) { if(!value)throw new Exception(message); }
    static void Reject(Action action,string message)
    { try {action();}catch(ArgumentException){return;}throw new Exception(message); }
    static LastStandShopCheckpoint Copy(LastStandShopCheckpoint s,int? baseIncome=null,int? bonus=null,int? remainder=null,string economy=null)
    {return new LastStandShopCheckpoint(s.RunId,s.Fitting,s.PurchaseSequence,s.UniqueKills,s.EarnedScrap,s.SpentScrap,s.Scrap,
        s.PermanentLevels,s.RunPurchases,economy??s.EconomyVersion,baseIncome??s.BaseEarnedScrap,bonus??s.BonusEarnedScrap,remainder??s.IncomeRemainder,s.SchemaVersion);}
    static int Main(string[] args)
    {
        try {
            if(args[0]=="onboarding") {
                long budget=0;
                for(int wave=1;wave<=300;wave++) {
                    var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),wave);
                    budget+=reward.RepeatableSalvage+reward.FirstClearSalvage;
                }
                foreach(var track in LastStandUpgradeCatalog.Tracks) {
                    long total=0;for(int rank=1;rank<=track.PermanentCap;rank++)total+=track.PermanentPrice(rank);
                    Check(total>budget,track.Key+" reaches permanent MAX from the first-pass wave-300 budget.");
                }
            }
            else if(args[0]=="income") {
                var shop=new LastStandShopState(1,LastStandFitting.Repair,new int[LastStandUpgradeCatalog.Tracks.Count]);
                shop.ObserveAuthoritativeKills(LastStandWaveCatalog.TotalEnemiesThroughWave(499));
                int before=shop.EarnedScrap;
                shop.ObserveAuthoritativeKills(LastStandWaveCatalog.TotalEnemiesThroughWave(500));
                Check(shop.EarnedScrap-before>60,"Late-wave base Scrap remains stuck at the old 60-per-wave ceiling.");
            }
            else if(args[0]=="early-income") {
                var current=LastStandUpgradeCatalog.ForEconomy(LastStandUpgradeCatalog.EconomyVersion);
                Check(current.BaseScrapPerKill(1)==3 && current.BaseScrapPerKill(9)==3 &&
                    current.BaseScrapPerKill(10)==4 && current.BaseScrapPerKill(20)==5 && current.BaseScrapPerKill(30)==6,
                    "New-run base bounty must grow at early ten-wave milestones, including wave 30.");
                var old=LastStandUpgradeCatalog.ForEconomy("research-farming-economy-v2");
                Check(current.Version!=old.Version,"New bounty must not replace saved v2 accounting.");
                Check(old.BaseScrapPerKill(30)==3 && old.BaseScrapPerKill(250)==3 && old.BaseScrapPerKill(251)==4,
                    "Retained v2 bounty changed.");
                int[] paidV2Prices={552,338,442,484,0,326,335,923};
                for(int i=0;i<paidV2Prices.Length;i++)if(paidV2Prices[i]!=0)
                    Check(old.Tracks[i].RunPrice(100)==paidV2Prices[i],"Retained deep v2 price changed: "+old.Tracks[i].Key);
                foreach(var row in current.Tracks)for(int rank=1;rank<=Math.Min(8,row.TotalCap);rank++)
                    Check(row.RunPrice(rank)==old.Get(row.Id).RunPrice(rank),"Initial purchases became more expensive.");
                var shop=new LastStandShopState(4,LastStandFitting.Repair,new int[8],old.Version);
                int kills=LastStandWaveCatalog.TotalEnemiesThroughWave(30);
                shop.ObserveAuthoritativeKills(kills);
                Check(shop.TryPurchase(new LastStandShopPurchaseIntent(4,shop.Version,LastStandUpgradeTrackId.CannonAttack)).Accepted,"Saved run purchase.");
                var restored=LastStandShopState.RestoreCheckpoint(shop.CaptureCheckpoint());
                int before=restored.Scrap;restored.ObserveAuthoritativeKills(kills+1,31,0);
                Check(restored.EconomyVersion==old.Version && restored.Scrap==before+3 && restored.SpentScrap==shop.SpentScrap,
                    "Resumed paid run must retain its prices and payout.");
            }
            else if(args[0]=="reward-preview") {
                foreach(string version in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.EconomyVersion}) {
                    var rules=LastStandUpgradeCatalog.ForEconomy(version);
                    var levels=new int[rules.Tracks.Count];if(!rules.IsLegacy)levels[7]=1;
                    var shop=new LastStandShopState(5,LastStandFitting.Repair,levels,version);
                    for(int kill=1;kill<=500;kill++) {
                        int wave=rules.WaveForKill(kill),rank=kill<100?1:2;
                        int before=shop.Scrap,epoch=shop.Version,remainder=shop.IncomeRemainder;
                        var reward=shop.ProjectKillReward(wave,rank);
                        Check(reward.BaseScrap==rules.BaseScrapPerKill(wave),"Reward preview uses wrong run economy.");
                        Check(reward.EffectiveScrap==reward.BaseScrap*(rules.IsLegacy?1m:1.01m)*(1m+.02m*rank),"Reward entitlement has wrong modifiers.");
                        Check(shop.Scrap==before && shop.Version==epoch && shop.IncomeRemainder==remainder,"Viewing reward changes accounting.");
                        shop.ObserveAuthoritativeKills(kill,wave,rank);
                        Check(shop.Scrap-before==reward.NextKillScrap,"Next paid kill differs from displayed reward and carry.");
                        if(kill==100)shop=LastStandShopState.RestoreCheckpoint(shop.CaptureCheckpoint());
                    }
                    Reject(()=>shop.ProjectKillReward(0,0),"Invalid reward wave accepted.");
                    Reject(()=>shop.ProjectKillReward(1,101),"Invalid reward research accepted.");
                }
            }
            else if(args[0]=="legacy") {
                var old=LastStandUpgradeCatalog.ForEconomy(LastStandUpgradeCatalog.LegacyEconomyVersion);
                var current=LastStandUpgradeCatalog.ForEconomy(LastStandUpgradeCatalog.EconomyVersion);
                Check(old.Tracks.Count==7 && current.Tracks.Count==8,"Versioned roster boundaries.");
                for(int i=0;i<7;i++)Check(old.Tracks[i].Key==current.Tracks[i].Key,"Existing stable track identity moved.");
                long cap=0;for(int n=1;n<=12;n++)cap+=old.Get(LastStandUpgradeTrackId.CannonCycle).PermanentPrice(n);
                Check(cap==94,"Legacy price rule was changed.");
                Check(old.Get(LastStandUpgradeTrackId.CannonAttack).EffectAt(100,1)==2712 &&
                    old.Get(LastStandUpgradeTrackId.CannonAttack).RunPrice(100)==711,"Deep legacy attack curve or paid prices changed.");
                Check(old.Get(LastStandUpgradeTrackId.LauncherAttack).EffectAt(100,1)==1470 &&
                    old.Get(LastStandUpgradeTrackId.ScattergunAttack).EffectAt(100,1)==1014 &&
                    old.Get(LastStandUpgradeTrackId.HullCapacity).EffectAt(100,1)==5852 &&
                    old.Get(LastStandUpgradeTrackId.FieldRepair).EffectAt(100,1)==314,"Deep legacy fitting effects changed.");
                Check(current.Get(LastStandUpgradeTrackId.CannonCycle).PermanentPrice(1)==20,"Profile uses new permanent prices.");
                var shop=new LastStandShopState(2,LastStandFitting.Repair,new int[7],old.Version);
                shop.ObserveAuthoritativeKills(50);
                Check(shop.TryPurchase(new LastStandShopPurchaseIntent(2,shop.Version,LastStandUpgradeTrackId.CannonAttack)).Accepted,"Legacy paid purchase.");
                var saved=shop.CaptureCheckpoint();
                var v1=new LastStandShopCheckpoint(saved.RunId,saved.Fitting,saved.PurchaseSequence,saved.UniqueKills,saved.EarnedScrap,saved.SpentScrap,saved.Scrap,saved.PermanentLevels,saved.RunPurchases);
                var restored=LastStandShopState.RestoreCheckpoint(v1);
                Check(restored.EconomyVersion==old.Version && restored.SpentScrap==5 && restored.Definitions.Count==7,"Old paid ledger changed on restore.");
                restored.ObserveAuthoritativeKills(51,old.WaveForKill(51),50);
                var mixed=LastStandShopState.RestoreCheckpoint(restored.CaptureCheckpoint());
                Check(mixed.BaseEarnedScrap==153 && mixed.BonusEarnedScrap==3 && mixed.EarnedScrap==156,"Prospective research must not reprice past legacy kills.");
                Check(!mixed.ObserveAuthoritativeKills(51,old.WaveForKill(51),50),"Reload replayed a paid kill.");
                Reject(()=>LastStandUpgradeCatalog.ForEconomy("future-unknown"),"Unknown economy silently defaulted.");
                Reject(()=>mixed.GetTrack(LastStandUpgradeTrackId.ScrapYield),"Legacy roster gained an active new track.");
            }
            else if(args[0]=="fraction") {
                var levels=new int[8];levels[7]=1;
                var shop=new LastStandShopState(3,LastStandFitting.Repair,levels,LastStandUpgradeCatalog.PreviousEconomyVersion);
                var rules=LastStandUpgradeCatalog.ForEconomy(shop.EconomyVersion);
                for(int kill=1;kill<=50;kill++)shop.ObserveAuthoritativeKills(kill,rules.WaveForKill(kill),1);
                Check(shop.EarnedScrap==154 && shop.IncomeRemainder==5300,"Fractional multiplicative reward lost precision.");
                var boundary=shop.CaptureCheckpoint();
                var restored=LastStandShopState.RestoreCheckpoint(boundary);
                for(int kill=51;kill<=100;kill++)restored.ObserveAuthoritativeKills(kill,rules.WaveForKill(kill),2);
                Check(restored.BaseEarnedScrap==300 && restored.BonusEarnedScrap==12 && restored.IncomeRemainder==900,"Mixed research epochs did not conserve income.");
                var rollback=LastStandShopState.RestoreCheckpoint(boundary);
                Check(rollback.UniqueKills==50 && rollback.EarnedScrap==154 && rollback.IncomeRemainder==5300,"Unfinished wave carry leaked into rollback.");
                Reject(()=>LastStandShopState.RestoreCheckpoint(Copy(boundary,baseIncome:151)),"Corrupt base income accepted.");
                Reject(()=>LastStandShopState.RestoreCheckpoint(Copy(boundary,bonus:5)),"Corrupt bonus conservation accepted.");
                Reject(()=>LastStandShopState.RestoreCheckpoint(Copy(boundary,remainder:10000)),"Unnormalized carry accepted.");
                Reject(()=>restored.ObserveAuthoritativeKills(101,999,1),"Wrong wave reward context accepted.");
                Reject(()=>restored.ObserveAuthoritativeKills(101,rules.WaveForKill(101),101),"Unknown logistics rank accepted.");
            }
            else if(args[0]=="prefix") {
                foreach(string version in new[]{LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.EconomyVersion}) {
                var rules=LastStandUpgradeCatalog.ForEconomy(version);
                long expected=0;int kills=0;
                for(int wave=1;wave<=1200;wave++) {
                    int count=LastStandWaveCatalog.ForWave(1,wave).EnemyCount;
                    for(int n=0;n<count;n++) {
                        kills++;expected+=rules.BaseScrapPerKill(wave);
                        Check(rules.WaveForKill(kills)==wave,"Kill ordinal resolves wrong wave.");
                        Check(rules.BaseScrapThroughKills(kills)==expected,"Closed-form income differs from actual wave events.");
                    }
                }
                Check(rules.BaseScrapThroughKills(int.MaxValue)>0,"Large bounded prefix overflowed.");
                }
            }
            else if(args[0]=="value") {
                foreach(var row in LastStandUpgradeCatalog.Tracks) {
                    int p=Math.Min(40,row.PermanentCap-1),target=Math.Min(row.TotalCap,p+20);
                    long fromZero=0,fromPermanent=0;
                    for(int n=1;n<=target;n++)fromZero+=row.RunPrice(n);
                    for(int n=1;n<=target-p;n++)fromPermanent+=row.RunPrice(n);
                    Check(fromPermanent<fromZero,row.Key+" permanent levels did not save matched-build Scrap.");
                    int before=row.EffectAt(0,100000),after=row.EffectAt(p,100000);
                    Check(row.Id==LastStandUpgradeTrackId.CannonCycle || row.Id==LastStandUpgradeTrackId.Armor ? after<before : after>before,
                        row.Key+" permanent level has no starting benefit.");
                    for(int level=1;level<=row.TotalCap;level++) {
                        Check(row.RunPrice(level)>0,"Invalid price.");
                        Check(row.EffectAt(level,100000)!=row.EffectAt(level-1,100000),row.Key+" sells a zero-effect rank.");
                    }
                }
            }
            else if(args[0]=="bulk-quotes") {
                var row=LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack);
                int budget=0;for(int n=1;n<=7;n++)budget+=row.RunPrice(n);
                foreach(var quantity in new[]{LastStandBulkQuantity.Ten,LastStandBulkQuantity.Hundred,LastStandBulkQuantity.Max}) {
                    var quote=row.QuoteRun(20,0,budget,quantity);
                    Check(quote.Quantity==7 && quote.Cost==budget && quote.ResultLevel==27,"Affordable partial bulk quote is not exact.");
                }
                var one=row.QuoteRun(20,0,budget,LastStandBulkQuantity.One);
                Check(one.Quantity==1 && one.Cost==row.RunPrice(1),"Permanent levels must not inflate initial run prices.");
                var end=row.QuoteRun(row.PermanentCap,row.TotalCap-row.PermanentCap-2,int.MaxValue,LastStandBulkQuantity.Hundred);
                Check(end.Quantity==2 && end.ResultLevel==row.TotalCap,"Bulk quote crosses cap.");
                var max=row.QuoteRun(0,0,int.MaxValue,LastStandBulkQuantity.Max);
                long expected=0;for(int n=1;n<=max.Quantity;n++)expected+=row.RunPrice(n);
                Check(max.Cost==expected && max.Cost<=int.MaxValue,"Max quote overflows wallet bounds.");
                int permanentBudget=row.PermanentPrice(1)+row.PermanentPrice(2);
                var permanent=row.QuotePermanent(0,permanentBudget,LastStandBulkQuantity.Ten);
                Check(permanent.Quantity==2 && permanent.Cost==permanentBudget && permanent.ResultLevel==2,"Permanent partial quote mismatch.");
                Reject(()=>row.QuoteRun(0,0,budget,(LastStandBulkQuantity)6),"Invalid quantity accepted.");
                Reject(()=>row.QuotePermanent(0,-1,LastStandBulkQuantity.Max),"Negative wallet accepted.");
            }
            else if(args[0]=="bulk-ledger") {
                foreach(string economy in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.EconomyVersion}) {
                    var rules=LastStandUpgradeCatalog.ForEconomy(economy);
                    var shop=new LastStandShopState(12,LastStandFitting.Repair,new int[rules.Tracks.Count],economy);
                    shop.ObserveAuthoritativeKills(10000);
                    var quote=shop.GetDefinition(LastStandUpgradeTrackId.CannonAttack).QuoteRun(0,0,shop.Scrap,LastStandBulkQuantity.Hundred);
                    var intent=new LastStandShopPurchaseIntent(shop.RunId,shop.Version,LastStandUpgradeTrackId.CannonAttack,LastStandBulkQuantity.Hundred);
                    var result=shop.TryPurchase(intent);
                    Check(result.Accepted && result.PurchasedQuantity==quote.Quantity && result.ChargedScrap==quote.Cost,"Bulk intent did not debit exact displayed quote.");
                    Check(result.Track.CurrentLevel==quote.ResultLevel && shop.SpentScrap+shop.Scrap==shop.EarnedScrap,"Bulk levels/accounting diverged.");
                    int spent=shop.SpentScrap;
                    Check(shop.TryPurchase(intent).Refusal==LastStandShopPurchaseRefusal.StaleVersion && shop.SpentScrap==spent,"Repeated intent charged twice.");
                    var restored=LastStandShopState.RestoreCheckpoint(shop.CaptureCheckpoint());
                    Check(restored.SpentScrap==spent && restored.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases==quote.Quantity,"Bulk paid levels did not restore.");
                    var wrong=new LastStandShopPurchaseIntent(shop.RunId,shop.Version,LastStandUpgradeTrackId.LauncherAttack,LastStandBulkQuantity.Max);
                    Check(shop.TryPurchase(wrong).Refusal==LastStandShopPurchaseRefusal.WrongFitting && shop.SpentScrap==spent,"Ineligible bulk changed state.");
                    var invalid=new LastStandShopPurchaseIntent(shop.RunId,shop.Version,LastStandUpgradeTrackId.CannonAttack,(LastStandBulkQuantity)6);
                    Check(shop.TryPurchase(invalid).Refusal==LastStandShopPurchaseRefusal.InvalidIntent && shop.SpentScrap==spent,"Invalid bulk changed state.");
                }
            }
            else throw new ArgumentException("Unknown case");
            Console.WriteLine("PASS "+args[0]);return 0;
        } catch(Exception e) { Console.Error.WriteLine(e);return 1; }
    }
}
