using System;
using System.Collections.Generic;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        static Dictionary<string,object> Map(params object[] entries)
        {
            var result=new Dictionary<string,object>(StringComparer.Ordinal);
            for(int n=0;n<entries.Length;n+=2)result.Add((string)entries[n],entries[n+1]);
            return result;
        }
        static int Number(Dictionary<string,object> map,string key)=>LastStandSaveJson.Integer(map[key]);
        static string Text(Dictionary<string,object> map,string key)=>LastStandSaveJson.String(map[key]);
        static bool Bool(Dictionary<string,object> map,string key)=>LastStandSaveJson.Boolean(map[key]);
        static Dictionary<string,object> LevelsJson(IReadOnlyList<int> levels,string economy=null)
        {
            var result=Map();
            foreach(var track in LastStandUpgradeCatalog.ForEconomy(economy??LastStandUpgradeCatalog.EconomyVersion).Tracks)result.Add(track.Key,levels[(int)track.Id]);
            return result;
        }
        static int[] ReadLevels(object value,bool permanent,string economy=null)
        {
            var map=LastStandSaveJson.Object(value);
            var catalog=LastStandUpgradeCatalog.ForEconomy(economy??LastStandUpgradeCatalog.EconomyVersion);
            if(map.Count!=catalog.Tracks.Count)throw new FormatException("Missing upgrade tracks.");
            var result=new int[map.Count];
            foreach(var pair in map)
            {
                if(!catalog.TryGet(pair.Key,out var definition))throw new FormatException("Unknown upgrade track.");
                int level=LastStandSaveJson.Integer(pair.Value);
                if(level>(permanent?definition.PermanentCap:definition.TotalCap))throw new FormatException("Invalid upgrade level.");
                result[(int)definition.Id]=level;
            }
            return result;
        }
        static List<object> Strings(IEnumerable<string> values)
        {
            var sorted=new List<string>(values);sorted.Sort(StringComparer.Ordinal);
            var result=new List<object>();foreach(string s in sorted)result.Add(s);return result;
        }
        static HashSet<string> ReadStrings(object value)
        {
            var result=new HashSet<string>(StringComparer.Ordinal);
            foreach(var item in LastStandSaveJson.Array(value))
                if(!result.Add(LastStandSaveJson.String(item)))throw new FormatException("Duplicate saved identity.");
            return result;
        }
        static object PendingJson(PendingDefeat p)=>p==null?null:Map(
            "runId",p.RunId,"elapsedTicks",p.ElapsedTicks,"kills",p.Kills,"reward",p.Reward,
            "tier",p.Tier,"profileVersion",p.ProfileVersion,"isLimit",p.IsLimit,
            "newBestTime",p.NewBestTime,"newBestKills",p.NewBestKills,"unlockedTierTwo",p.UnlockedTierTwo);
        static string Serialize(Record record)
        {
            var tiers=Map();
            foreach(var tier in LastStandTierCatalog.All)
            {
                var row=record.Tiers[tier.Key];
                tiers.Add(tier.Key,Map("bestWave",row.BestWave,"legacyTicks",row.LegacyTicks,
                    "legacyKills",row.LegacyKills,"unlocked",row.Unlocked));
            }
            return LastStandSaveJson.Write(Map("version",5,"credits",record.Wallet,
                "revision",record.Revision,"recoveryRemainder",record.RecoveryRemainder,
                "research",ResearchJson(record.Research),"history",HistoryJson(record.History),
                "permanentLevels",LevelsJson(record.Levels),"nextRunId",record.NextRunId,
                "lastFinalizedRunId",record.FinalizedRunId,"selectedTier",record.SelectedTier,
                "selectedFitting",record.SelectedFitting,"tierRecords",tiers,
                "firstClears",Strings(record.FirstClears),"unlockedFittings",Strings(record.Fittings),
                "pendingDefeat",PendingJson(record.Pending),"checkpoint",CheckpointJson(record.Checkpoint)));
        }
        static bool TryParseSave(string raw,out Record record,out bool migrate)
        {
            record=null;migrate=false;
            try
            {
                var map=LastStandSaveJson.Read(raw);
                if(!map.ContainsKey("version"))return false;
                int version=Number(map,"version");
                if(version<4)
                {
                    if(!TryParseLegacyVersions(raw,out record,out migrate))return false;
                    InitializeTiers(record,true);migrate=true;return true;
                }
                if(version!=4 && version!=5)return false;
                var fields=new List<string>{"version","credits","permanentLevels","nextRunId","lastFinalizedRunId",
                    "selectedTier","selectedFitting","tierRecords","firstClears","unlockedFittings","pendingDefeat","checkpoint"};
                if(version==5)fields.AddRange(new[]{"revision","recoveryRemainder","research","history"});
                LastStandSaveJson.Fields(map,fields.ToArray());
                var levels=ReadLevels(map["permanentLevels"],true,version==4?LastStandUpgradeCatalog.LegacyEconomyVersion:LastStandUpgradeCatalog.EconomyVersion);
                if(version==4)Array.Resize(ref levels,LastStandUpgradeCatalog.Tracks.Count);
                var parsed=new Record { Wallet=Number(map,"credits"),Levels=levels,
                    NextRunId=Number(map,"nextRunId"),FinalizedRunId=Number(map,"lastFinalizedRunId"),
                    SelectedTier=Number(map,"selectedTier"),SelectedFitting=Text(map,"selectedFitting"),
                    FirstClears=ReadStrings(map["firstClears"]),Fittings=ReadStrings(map["unlockedFittings"]) };
                if(parsed.NextRunId<1 || parsed.FinalizedRunId>=parsed.NextRunId || !LastStandTierCatalog.IsValid(parsed.SelectedTier))return false;
                var tierMap=LastStandSaveJson.Object(map["tierRecords"]);
                if(tierMap.Count!=LastStandTierCatalog.All.Count)return false;
                var knownMilestones=new HashSet<string>(StringComparer.Ordinal);
                foreach(var tier in LastStandTierCatalog.All)
                {
                    var t=LastStandSaveJson.Object(tierMap[tier.Key]);
                    LastStandSaveJson.Fields(t,"bestWave","legacyTicks","legacyKills","unlocked");
                    var row=new TierRecord { BestWave=Number(t,"bestWave"),LegacyTicks=Number(t,"legacyTicks"),
                        LegacyKills=Number(t,"legacyKills"),Unlocked=Bool(t,"unlocked") };
                    if(row.LegacyTicks>LastStandTierCatalog.LegacyHorizonTicks ||
                        !row.Unlocked && (tier.RequiredTier==0 || row.BestWave>0 || row.LegacyTicks>0 || row.LegacyKills>0))return false;
                    parsed.Tiers.Add(tier.Key,row);
                    foreach(var milestone in LastStandRewardCatalog.Milestones(tier))
                    {
                        knownMilestones.Add(milestone.Id);
                        bool earned=parsed.FirstClears.Contains(milestone.Id);
                        if(earned!=(row.BestWave>=milestone.Wave))return false;
                    }
                }
                foreach(string id in parsed.FirstClears)if(!knownMilestones.Contains(id))return false;
                foreach(string id in parsed.Fittings)LastStandFittingCatalog.Parse(id);
                if(!parsed.Fittings.Contains("repair") || !parsed.Fittings.Contains("launcher") ||
                    !parsed.Fittings.Contains(parsed.SelectedFitting) || !parsed.Tiers[LastStandTierCatalog.Get(parsed.SelectedTier).Key].Unlocked)return false;
                bool scatterEarned=parsed.FirstClears.Contains(LastStandTierCatalog.Get(1).Key+":wave-100");
                if(parsed.Fittings.Contains("scattergun")!=scatterEarned)return false;
                foreach(var tier in LastStandTierCatalog.All)
                    if(tier.RequiredTier!=0 && parsed.Tiers[LastStandTierCatalog.Get(tier.RequiredTier).Key].BestWave>=tier.RequiredWave &&
                        !parsed.Tiers[tier.Key].Unlocked)return false;
                parsed.Pending=ReadPending(map["pendingDefeat"],parsed);
                parsed.Checkpoint=ReadCheckpoint(map["checkpoint"]);
                if(parsed.Checkpoint!=null)
                {
                    var cp=parsed.Checkpoint;
                    if(parsed.Pending!=null || cp.RunId!=parsed.NextRunId-1 || cp.RunId<=parsed.FinalizedRunId ||
                        cp.Tier!=parsed.SelectedTier || cp.FittingId!=parsed.SelectedFitting || cp.Encounter.Hull==0 ||
                        cp.CompletedWave>parsed.Tiers[LastStandTierCatalog.Get(cp.Tier).Key].BestWave)return false;
                    foreach(var track in LastStandUpgradeCatalog.ForEconomy(cp.Shop.EconomyVersion).Tracks)
                        if(cp.Shop.PermanentLevels[(int)track.Id]>parsed.Levels[(int)track.Id])return false;
                }
                if(version==5)
                {
                    parsed.Revision=LastStandSaveJson.LongInteger(map["revision"]);
                    parsed.RecoveryRemainder=Number(map,"recoveryRemainder");
                    if(parsed.Revision<1 || parsed.RecoveryRemainder>=LastStandResearchCatalog.MultiplierDenominator)return false;
                    parsed.Research=ReadResearch(map["research"]);parsed.History=ReadHistory(map["history"]);
                    if(!parsed.Research.IsAvailableFor(parsed.Tiers[LastStandTierCatalog.Get(1).Key].BestWave))return false;
                    var history=parsed.History.Snapshot();var current=history.Current;
                    if(history.LastFinalizedRunId!=parsed.FinalizedRunId || (current==null)!=(parsed.Checkpoint==null))return false;
                    if(current!=null && (current.RunId!=parsed.Checkpoint.RunId || current.Tier!=parsed.Checkpoint.Tier ||
                        current.Fitting!=parsed.Checkpoint.FittingId || current.EconomyVersion!=parsed.Checkpoint.Shop.EconomyVersion ||
                        current.HighestClearedWave!=parsed.Checkpoint.CompletedWave))return false;
                }
                else migrate=true;
                record=parsed;return true;
            }
            catch(Exception error) when(error is FormatException || error is ArgumentException || error is KeyNotFoundException ||
                error is OverflowException || error is InvalidOperationException || error is IndexOutOfRangeException)
            { return false; }
        }
        static PendingDefeat ReadPending(object value,Record record)
        {
            if(value==null)return null;
            var p=LastStandSaveJson.Object(value);
            LastStandSaveJson.Fields(p,"runId","elapsedTicks","kills","reward","tier","profileVersion","isLimit","newBestTime","newBestKills","unlockedTierTwo");
            int run=Number(p,"runId"),ticks=Number(p,"elapsedTicks"),kills=Number(p,"kills"),reward=Number(p,"reward"),tier=Number(p,"tier");
            string version=Text(p,"profileVersion");bool limit=Bool(p,"isLimit"),time=Bool(p,"newBestTime"),bestKills=Bool(p,"newBestKills"),unlock=Bool(p,"unlockedTierTwo");
            if(run<1 || run!=record.NextRunId-1 || run<=record.FinalizedRunId)throw new FormatException("Invalid legacy claim identity.");
            if(tier==0)
            {
                if(version!="" || reward!=1 || limit || time || bestKills || unlock)throw new FormatException("Invalid legacy claim.");
            }
            else
            {
                if(!LastStandTierCatalog.IsValid(tier) || tier!=record.SelectedTier || version!=LastStandTierCatalog.LegacyProfileVersion ||
                    ticks>LastStandTierCatalog.LegacyHorizonTicks || reward!=(limit?0:1) || limit && ticks!=LastStandTierCatalog.LegacyHorizonTicks)
                    throw new FormatException("Invalid legacy result.");
                var row=record.Tiers[LastStandTierCatalog.Get(tier).Key];
                if(!row.Unlocked || row.LegacyTicks<ticks || row.LegacyKills<kills ||
                    time && (row.LegacyTicks!=ticks || ticks==0) || bestKills && (row.LegacyKills!=kills || kills==0) ||
                    unlock && (tier!=1 || !time || ticks<1200 || !record.Tiers[LastStandTierCatalog.Get(2).Key].Unlocked))
                    throw new FormatException("Legacy result does not match retained history.");
            }
            return new PendingDefeat(run,ticks,kills,reward,tier,version,limit,time,bestKills,unlock);
        }
        static object CheckpointJson(LastStandRunCheckpoint checkpoint)
        {
            if(checkpoint==null)return null;
            var e=checkpoint.Encounter;var s=checkpoint.Shop;
            return Map("runId",checkpoint.RunId,"encounter",Map(
                "version",EncounterCheckpoint.Version,"rulesVersion",e.RulesVersion,"tier",e.Tier,"fitting",e.Fitting,
                "wave",e.Wave,"completedWave",e.CompletedWave,"tick",e.Tick,"hull",e.Hull,"maximumHull",e.MaximumHull,
                "spawned",e.Spawned,"kills",e.Kills,"cannonShots",e.CannonShots,"launcherShots",e.LauncherShots,
                "scattergunShots",e.ScattergunShots,"restored",e.Restored,"closeHits",e.CloseHits,"rangedHits",e.RangedHits,
                "nextSpawnTick",e.NextSpawnTick,"nextCannonTick",e.NextCannonTick,"nextLauncherTick",e.NextLauncherTick,
                "nextRepairTick",e.NextRepairTick,"nextScattergunTick",e.NextScattergunTick,"lastCannonShotTick",e.LastCannonShotTick,
                "cannonDamage",e.CannonDamage,"launcherDamage",e.LauncherDamage,"scattergunDamage",e.ScattergunDamage,
                "cannonPeriod",e.CannonPeriod,"repairAmount",e.RepairAmount,"armorLevel",e.ArmorLevel,"committedCannonDamage",e.CommittedCannonDamage),
                "shop",Map("version",LastStandShopCheckpoint.Version,"economyVersion",s.EconomyVersion,
                    "baseEarnedScrap",s.BaseEarnedScrap,"bonusEarnedScrap",s.BonusEarnedScrap,"incomeRemainder",s.IncomeRemainder,
                    "runId",s.RunId,"fitting",s.Fitting,
                    "purchaseSequence",s.PurchaseSequence,"uniqueKills",s.UniqueKills,"earnedScrap",s.EarnedScrap,
                    "spentScrap",s.SpentScrap,"scrap",s.Scrap,"permanentLevels",LevelsJson(s.PermanentLevels,s.EconomyVersion),"runPurchases",LevelsJson(s.RunPurchases,s.EconomyVersion)));
        }
        static LastStandRunCheckpoint ReadCheckpoint(object value)
        {
            if(value==null)return null;
            var p=LastStandSaveJson.Object(value);LastStandSaveJson.Fields(p,"runId","encounter","shop");
            var e=LastStandSaveJson.Object(p["encounter"]);var s=LastStandSaveJson.Object(p["shop"]);
            LastStandSaveJson.Fields(e,"version","rulesVersion","tier","fitting","wave","completedWave","tick","hull","maximumHull",
                "spawned","kills","cannonShots","launcherShots","scattergunShots","restored","closeHits","rangedHits",
                "nextSpawnTick","nextCannonTick","nextLauncherTick","nextRepairTick","nextScattergunTick","lastCannonShotTick",
                "cannonDamage","launcherDamage","scattergunDamage","cannonPeriod","repairAmount","armorLevel","committedCannonDamage");
            int schema=Number(s,"version");
            var shopFields=new List<string>{"version","runId","fitting","purchaseSequence","uniqueKills","earnedScrap","spentScrap","scrap","permanentLevels","runPurchases"};
            if(schema==LastStandShopCheckpoint.Version)shopFields.AddRange(new[]{"economyVersion","baseEarnedScrap","bonusEarnedScrap","incomeRemainder"});
            LastStandSaveJson.Fields(s,shopFields.ToArray());
            if(Number(e,"version")!=EncounterCheckpoint.Version || schema!=LastStandShopCheckpoint.Version && schema!=LastStandShopCheckpoint.LegacyVersion)
                throw new FormatException("Unsupported checkpoint schema.");
            var encounter=new EncounterCheckpoint(Text(e,"rulesVersion"),Number(e,"tier"),Number(e,"fitting"),Number(e,"wave"),Number(e,"completedWave"),Number(e,"tick"),
                Number(e,"hull"),Number(e,"maximumHull"),Number(e,"spawned"),Number(e,"kills"),Number(e,"cannonShots"),Number(e,"launcherShots"),Number(e,"scattergunShots"),
                Number(e,"restored"),Number(e,"closeHits"),Number(e,"rangedHits"),Number(e,"nextSpawnTick"),Number(e,"nextCannonTick"),Number(e,"nextLauncherTick"),
                Number(e,"nextRepairTick"),Number(e,"nextScattergunTick"),Number(e,"lastCannonShotTick"),Number(e,"cannonDamage"),Number(e,"launcherDamage"),
                Number(e,"scattergunDamage"),Number(e,"cannonPeriod"),Number(e,"repairAmount"),Number(e,"armorLevel"),Number(e,"committedCannonDamage"));
            string economy=schema==LastStandShopCheckpoint.LegacyVersion?LastStandUpgradeCatalog.LegacyEconomyVersion:Text(s,"economyVersion");
            var shop=new LastStandShopCheckpoint(Number(s,"runId"),Number(s,"fitting"),Number(s,"purchaseSequence"),Number(s,"uniqueKills"),
                Number(s,"earnedScrap"),Number(s,"spentScrap"),Number(s,"scrap"),ReadLevels(s["permanentLevels"],true,economy),ReadLevels(s["runPurchases"],false,economy),
                economy,schema==1?Number(s,"earnedScrap"):Number(s,"baseEarnedScrap"),schema==1?0:Number(s,"bonusEarnedScrap"),schema==1?0:Number(s,"incomeRemainder"),schema);
            return new LastStandRunCheckpoint(Number(p,"runId"),encounter,shop);
        }
    }
}
