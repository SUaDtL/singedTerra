using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

static class EnemyInformationChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    static void Check(bool value,string message) { if(!value)throw new Exception(message); }
    static void Set(object target,string field,object value)
    {
        var member=target.GetType().GetField(field,Private);
        Check(member!=null,"Explicit synthetic roster field missing: "+field);member.SetValue(target,value);
    }
    static T Read<T>(object target,string property)
    {
        var member=target.GetType().GetProperty(property);
        Check(member!=null && member.PropertyType==typeof(T),"Enemy information must expose "+property);
        return (T)member.GetValue(target);
    }
    static LastStandShopState Shop(int tier,string economy)
    {
        var rules=LastStandUpgradeCatalog.ForEconomy(economy);
        return new LastStandShopState(51,LastStandFitting.Repair,new int[rules.Tracks.Count],economy,tier:tier);
    }
    static EncounterModel Roster(int tier,int wave,LastStandShopState shop)
    {
        var model=EncounterModel.CreatePlayable(shop.Fitting,tier,shop);
        // Explicit synthetic full-cohort probe, never a progression or income claim.
        Set(model,"<Wave>k__BackingField",wave);Set(model,"nextCannon",int.MaxValue-1);
        Check(model.TryApplyPlayableDefenseProjection(1000000000,raw=>wave>=5000?1:Math.Max(1,raw-7)),"Protected roster fixture accepted");
        int remaining=2000;
        while(model.Spawned<model.WaveEnemyCount && remaining-->0)model.Step();
        Check(remaining>0 && model.ActiveCount==model.WaveEnemyCount,"The real model must spawn the whole living cohort at tier "+tier+" wave "+wave);
        return model;
    }
    static string Ledger(LastStandShopState shop)
    {
        var checkpoint=shop.CaptureCheckpoint();
        return string.Join("|",shop.RunId,shop.Version,shop.UniqueKills,shop.Scrap,shop.EarnedScrap,shop.SpentScrap,
            shop.BaseEarnedScrap,shop.BonusEarnedScrap,shop.IncomeRemainder,shop.PurchaseLifecycle,
            shop.Tier,shop.RewardWave,shop.DefeatedMask,shop.FinalAccounting,
            string.Join(",",checkpoint.PermanentLevels),string.Join(",",checkpoint.RunPurchases));
    }
    static string EnemyText(LastStandWaveInformation info,LastStandWaveInformation.Enemy row)
    {
        string text=info.Describe();int start=text.IndexOf(Read<string>(row,"Name").ToUpperInvariant()+" / "+row.Count+" THIS WAVE",StringComparison.Ordinal);
        Check(start>=0,"Every type has a distinct named display section");int end=text.Length;
        foreach(var other in info.Enemies)if(other.Kind!=row.Kind) {
            int next=text.IndexOf(Read<string>(other,"Name").ToUpperInvariant()+" / "+other.Count+" THIS WAVE",StringComparison.Ordinal);
            if(next>start && next<end)end=next;
        }
        return text.Substring(start,end-start);
    }
    static void RosterInformation()
    {
        foreach(int tier in new[]{2,1})
        foreach(int wave in new[]{1,30,49,50,51,5000,int.MaxValue})
        {
            var shop=Shop(tier,LastStandUpgradeCatalog.EconomyVersion);var model=Roster(tier,wave,shop);
            var counts=new Dictionary<FoeKind,int>();var first=new Dictionary<FoeKind,EncounterFoe>();
            foreach(var foe in model.Foes)if(foe.Alive) {
                counts[foe.Kind]=counts.TryGetValue(foe.Kind,out var n)?n+1:1;first[foe.Kind]=foe;
            }
            string before=model.Snapshot(),ledger=Ledger(shop);
            var info=new LastStandWaveInformation(model,shop,3);string text=info.Describe();
            Check(info.Tier==tier && info.Wave==wave && info.TotalEnemies==model.ActiveCount && info.RemainingEnemies==model.ActiveCount,
                "Wave identity/counts match the actual live cohort");
            Check(info.Enemies.Count==counts.Count,"Information must include every actual enemy type at tier "+tier+" wave "+wave);
            int total=0;var seen=new HashSet<FoeKind>();
            foreach(var row in info.Enemies) {
                Check(seen.Add(row.Kind) && counts.TryGetValue(row.Kind,out var count) && row.Count==count,"One accurately counted row for each actual type");
                total+=row.Count;var foe=first[row.Kind];var definition=LastStandEnemyCatalog.Get(row.Kind);
                Check(row.Hull==foe.MaximumHull && row.RawDamage==foe.Damage && row.Armor==foe.Armor,"Actual spawned HP, damage and armor");
                Check(row.DamageAfterArmor==model.IncomingDamagePerHit(foe.Damage),"Actual current player mitigation, including one-damage floor");
                Check(row.AttackSeconds==(decimal)EncounterModel.AttackIntervalTicks(row.Kind)/20 &&
                    row.MovementUnitsPerSecond==(decimal)model.Profile.Speed(row.Kind)*20/1000,"Actual simulation cadence and world movement at 1x");
                Check(Read<string>(row,"Name")==definition.Name && text.Contains(definition.Name.ToUpperInvariant()),"Authored readable enemy name");
                Check(Read<decimal>(row,"TelegraphSeconds")==definition.TelegraphTicks/20m &&
                    Read<decimal>(row,"StopDistanceWorldUnits")==model.Profile.Stop(row.Kind)/1000m,"Actual warning and stop distance");
                Check(text.Contains("Armor: "+(row.Armor==0?"none":row.Armor.ToString())),"Armor text may not claim armored roles have none");
            }
            Check(total==model.ActiveCount,"Information preserves bounded total cohort size");
            Check(!text.Contains("VALUE / EACH ENEMY TYPE") || tier==1,"Mixed enemies may not be presented with one equal-value reward");
            if(tier==2 && wave==50) {
                var elite=Find(info,FoeKind.SiegeElite);var brute=Find(info,FoeKind.ArmoredBrute);
                Check(elite.Count==1 && elite.Hull==15792 && elite.Armor==16 && elite.RawDamage==336 && elite.DamageAfterArmor==329,
                    "Independent wave50 elite scale, armor and mitigation golden");
                Check(elite.AttackSeconds==6m && elite.MovementUnitsPerSecond==.4m && Read<decimal>(elite,"TelegraphSeconds")==1.5m,
                    "Independent elite cadence/movement/windup golden");
                Check(brute.Armor==8 && brute.AttackSeconds==2m && brute.MovementUnitsPerSecond==.5m,"Independent brute armor/cadence golden");
                Check(text.Contains("Windup: 1.5 s"),"Elite warning duration is visible in information text");
            }
            Check(model.Snapshot()==before && Ledger(shop)==ledger,"Repeated description/projection never mutates combat or ledger");
        }
    }
    static LastStandWaveInformation.Enemy Find(LastStandWaveInformation info,FoeKind kind)
    {foreach(var row in info.Enemies)if(row.Kind==kind)return row;throw new Exception("Missing actual enemy "+kind);}
    static void Retained()
    {
        foreach(string economy in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.RetainedEconomyVersion})
        foreach(int tier in new[]{1,2}) {
            var shop=Shop(tier,economy);var model=Roster(tier,30,shop);string before=model.Snapshot(),ledger=Ledger(shop);
            var info=new LastStandWaveInformation(model,shop,3);var close=Find(info,FoeKind.Close);var ranged=Find(info,FoeKind.Ranged);
            Check(info.Enemies.Count==2 && close.Count==4 && ranged.Count==3,"Retained exact wave30 Close/Ranged roster");
            foreach(var row in info.Enemies)Check(row.Hull==392*(tier==1?1:3) && row.RawDamage==18*(tier==1?1:3) && row.Armor==0,
                "Retained exact full health/damage/zero armor");
            Check(close.AttackSeconds==1m && ranged.AttackSeconds==1.5m && close.MovementUnitsPerSecond==1m && ranged.MovementUnitsPerSecond==.8m,
                "Retained exact cadence/movement");
            Check(info.RetainedEconomy && info.Describe().Contains("saved income") && info.Describe().Contains("Fractional value carries"),"Retained income/fraction disclosure");
            Check(model.Snapshot()==before && Ledger(shop)==ledger,"Retained projection is read only");
        }
    }
    static void Rewards()
    {
        var rules=LastStandUpgradeCatalog.ForEconomy(LastStandUpgradeCatalog.EconomyVersion);
        var levels=new int[rules.Tracks.Count];
        foreach(var track in rules.Tracks)levels[(int)track.Id]=track.Available?Math.Min(track.PermanentCap,500):0;
        levels[(int)LastStandUpgradeTrackId.ScrapYield]=1;
        var shop=new LastStandShopState(73,LastStandFitting.Repair,levels,rules.Version,tier:2);
        var model=EncounterModel.CreatePlayable(shop.Fitting,2,shop);
        var observed=new HashSet<FoeKind>();bool fractional=false,carried=false;int kills=0;
        // Actual model progression through every cohort; the fixture supplies
        // explicit upgrade levels but never injects kills or skipped ledger waves.
        for(int step=0;model.CompletedWave<50 && step<100000;step++) {
            string snapshot=model.Snapshot(),ledger=Ledger(shop);int before=shop.Scrap,remainder=shop.IncomeRemainder;
            var info=new LastStandWaveInformation(model,shop,3);
            foreach(var row in info.Enemies) {
                var reward=Read<LastStandKillReward>(row,"Reward");var projected=shop.ProjectKillReward(model.Wave,row.Kind,3);
                Check(reward.BaseScrap==projected.BaseScrap && reward.EffectiveScrap==projected.EffectiveScrap &&
                    reward.NextKillScrap==projected.NextKillScrap && reward.YieldPercent==101 && reward.LogisticsPercent==106,
                    "Every type uses the frozen shop's actual reward and shared carry");
                int multiplier=row.Kind==FoeKind.SiegeElite?8:row.Kind==FoeKind.ArmoredBrute?2:1;
                int expectedBase=rules.BaseScrapPerKill(model.Wave)*multiplier;
                Check(reward.BaseScrap==expectedBase && reward.EffectiveScrap==expectedBase*1.0706m &&
                    reward.NextKillScrap==(expectedBase*101*106+remainder)/10000,"Independent type multiplier and fractional payout arithmetic");
                string section=EnemyText(info,row);
                Check(section.Contains("Base: "+expectedBase+" Scrap") &&
                    section.Contains("Effective value: "+(expectedBase*1.0706m).ToString("0.####",CultureInfo.InvariantCulture)+" Scrap per kill") &&
                    section.Contains("If this type is the next kill: "+((expectedBase*101*106+remainder)/10000)+" Scrap"),
                    "Each named type displays its own independently expected base/effective/conditional payout");
                fractional|=reward.EffectiveScrap!=decimal.Truncate(reward.EffectiveScrap);
            }
            string text=info.Describe();
            Check(text.Contains("current shared carry") && !text.Contains("VALUE / EACH ENEMY TYPE"),"Mixed-type payouts disclose shared changing carry");
            Check(model.Snapshot()==snapshot && Ledger(shop)==ledger,"Reward projection and description may not spend/update carry or run state");
            model.Step();
            EncounterEvent? killed=null;
            foreach(var action in model.Events)if(action.Killed) {
                Check(killed==null && action.Kind==EncounterEventKind.Cannon,"Repair fixture has at most one actual kill in an admitted step");killed=action;
            }
            bool credited=shop.ObserveAuthoritativeKills(model,3);
            if(killed.HasValue) {
                var foe=model.Foes[killed.Value.Slot];var row=Find(info,foe.Kind);var reward=Read<LastStandKillReward>(row,"Reward");
                Check(credited && shop.Scrap-before==reward.NextKillScrap,"Next actual killed type pays its pre-step projected whole Scrap");
                Check(shop.IncomeRemainder==(reward.BaseScrap*101*106+remainder)%10000,"Actual post-kill carry matches exact fractional accounting");
                int after=shop.Scrap;Check(!shop.ObserveAuthoritativeKills(model,3) && shop.Scrap==after,"Duplicate observation does not award projected income again");
                var updated=new LastStandWaveInformation(model,shop,3);
                Check(updated.RemainingEnemies==info.RemainingEnemies-1 && info.RemainingEnemies>updated.RemainingEnemies,"Immutable prior row and updated remaining count");
                observed.Add(foe.Kind);kills++;carried|=remainder>0;
            }else Check(!credited && shop.Scrap==before,"No phantom reward without an actual death");
            if(model.AwaitingWaveCommit) {
                string cleared=new LastStandWaveInformation(model,shop,3).Describe();
                Check(cleared.Contains("Wave cleared; values shown are for this wave.") && !cleared.Contains("If this type is the next kill") &&
                    !cleared.Contains("Next kill pays"),"Cleared cohorts do not advertise a payable next kill");
                if(model.CompletedWave<50)Check(model.ContinueAfterCheckpoint(),"Only actual clear boundaries advance this fixture");
            }
        }
        Check(model.CompletedWave==50 && observed.Count==5 && kills==model.Kills && fractional && carried,
            "Actual rewards cover all five types, elite replacement, fractional accumulation and every completed cohort");
    }
    static void Identity(string dimension)
    {
        string economy=dimension=="economy" || dimension=="tier"?LastStandUpgradeCatalog.PreviousEconomyVersion:LastStandUpgradeCatalog.EconomyVersion;
        int tier=dimension=="economy" || dimension=="tier"?2:1;
        var source=Shop(tier,economy);var model=EncounterModel.CreatePlayable(source.Fitting,tier,source);
        string otherEconomy=dimension=="economy"?LastStandUpgradeCatalog.RetainedEconomyVersion:
            dimension=="edition"?LastStandUpgradeCatalog.PreviousEconomyVersion:economy;
        int otherTier=dimension=="tier"?1:tier;
        var otherRules=LastStandUpgradeCatalog.ForEconomy(otherEconomy);
        var candidate=new LastStandShopState(77,dimension=="fitting"?LastStandFitting.Launcher:LastStandFitting.Repair,
            new int[otherRules.Tracks.Count],otherEconomy,tier:otherTier);
        string before=model.Snapshot(),sourceBefore=Ledger(source),otherBefore=Ledger(candidate);
        // Both owners are independently valid, and both cohorts have Close/Ranged.
        // A rejection must come from identity admission, not an unavailable kind.
        Check(new LastStandWaveInformation(model,source,3).Tier==tier,"The actual outer-bound shop admits its own encounter, including legacy Tier2");
        bool refused=false;
        try { new LastStandWaveInformation(model,candidate,3); }
        catch(ArgumentException error) { refused=error.ParamName=="shop"; }
        Check(model.Snapshot()==before && Ledger(source)==sourceBefore && Ledger(candidate)==otherBefore,
            "Rejected readmodel construction may not change either owner");
        Check(refused,"Wave information must reject mismatched "+dimension+" before projecting stats or rewards");
    }
    static int Main(string[] args)
    {
        try {
            switch(args[0]) {
                case "roster": RosterInformation();break;
                case "retained": Retained();break;
                case "rewards": Rewards();break;
                case "identity-economy": Identity("economy");break;
                case "identity-edition": Identity("edition");break;
                case "identity-tier": Identity("tier");break;
                case "identity-fitting": Identity("fitting");break;
                default:throw new Exception("Unknown information case");
            }
            Console.WriteLine("PASS "+args[0]);return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
