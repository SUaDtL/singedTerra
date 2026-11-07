using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // Run identity owns immutable prices, effects, roster and base income.
    // Research is a prospective modifier supplied by the authoritative caller.
    public sealed class LastStandEconomyDefinition
    {
        bool RetainsPreviousIncome => Version==LastStandUpgradeCatalog.PreviousEconomyVersion;
        public string Version { get; }
        public bool IsLegacy => Version==LastStandUpgradeCatalog.LegacyEconomyVersion;
        public IReadOnlyList<LastStandUpgradeDefinition> Tracks { get; }
        internal LastStandEconomyDefinition(string version)
        { Version=version;Tracks=LastStandUpgradeCatalog.BuildTracks(version); }
        public LastStandUpgradeDefinition Get(LastStandUpgradeTrackId id)
        {
            foreach(var row in Tracks)if(row.Id==id)return row;
            throw new ArgumentOutOfRangeException(nameof(id));
        }
        public bool TryGet(string key,out LastStandUpgradeDefinition definition)
        {
            foreach(var row in Tracks)if(String.Equals(row.Key,key,StringComparison.Ordinal)){definition=row;return true;}
            definition=null;return false;
        }
        public int BaseScrapPerKill(int wave)
        {
            if(wave<1)throw new ArgumentOutOfRangeException(nameof(wave));
            if(IsLegacy)return 3;
            if(RetainsPreviousIncome)return checked(3+(wave-1)/250);
            return checked(3+Math.Min(wave,200)/10+Math.Max(wave-200,0)/20);
        }
        public int BaseScrapForEnemy(LastStandTierDefinition tier,int wave,int ordinal,LastStandRunEdition edition)
        {
            if(edition==null||edition.EconomyVersion!=Version)throw new ArgumentException("Enemy income edition mismatch.");
            return checked(BaseScrapPerKill(wave)*LastStandEnemyCatalog.For(tier,wave,ordinal,edition).RewardMultiplier);
        }
        public long BaseScrapForMask(LastStandTierDefinition tier,int wave,int mask,LastStandRunEdition edition)
        {
            if(edition==null||edition.EconomyVersion!=Version)throw new ArgumentException("Enemy income edition mismatch.");
            int count=LastStandWaveCatalog.ForWave(tier,wave,edition).EnemyCount;
            if(mask<0||(mask&~((1<<count)-1))!=0)throw new ArgumentException("Enemy mask is outside its cohort.");
            long total=0;for(int ordinal=0;ordinal<count;ordinal++)if((mask&(1<<ordinal))!=0)
                total=checked(total+BaseScrapForEnemy(tier,wave,ordinal,edition));
            return total;
        }
        // Restore proves the entire completed ledger. The first280 waves are
        // bounded bands; thereafter the20-slot recipe/elite pattern repeats
        // every100 waves while each enemy's base bounty increases by5.
        public long BaseScrapThroughCohorts(LastStandTierDefinition tier,int completedWave,LastStandRunEdition edition)
        {
            if(completedWave<0||edition==null||edition.EconomyVersion!=Version)throw new ArgumentException("Invalid completed income identity.");
            if(edition.IsLegacy)
                return BaseScrapThroughKills(LastStandWaveCatalog.TotalEnemiesThroughWave(completedWave,edition));
            long total=0;
            for(int wave=1;wave<=Math.Min(completedWave,280);wave++){
                int count=LastStandWaveCatalog.ForWave(tier,wave,edition).EnemyCount;
                total=checked(total+BaseScrapForMask(tier,wave,(1<<count)-1,edition));
            }
            for(int offset=0;offset<100&&281+offset<=completedWave;offset++){
                int first=281+offset;long repetitions=((long)completedWave-first)/100+1;
                int multiplier=0;for(int ordinal=0;ordinal<20;ordinal++)
                    multiplier+=LastStandEnemyCatalog.For(tier,first,ordinal,edition).RewardMultiplier;
                total=checked(total+multiplier*(repetitions*BaseScrapPerKill(first)+5*repetitions*(repetitions-1)/2));
            }
            return total;
        }
        // Every prior cohort is defeated before a later wave can pay kills.
        // Fourteen short roster bands plus one closed-form tail keep recovery
        // bounded even for very large valid cumulative kill counts.
        public long BaseScrapThroughKills(int kills)
        {
            if(kills<0)throw new ArgumentOutOfRangeException(nameof(kills));
            if(IsLegacy)return 3L*kills;
            long remaining=kills,total=0;int wave=1;
            while(wave<=280 && remaining>0) {
                int count=6+(wave-1)/20;
                long paid=Math.Min(remaining,count);total+=paid*BaseScrapPerKill(wave);
                remaining-=paid;wave++;
            }
            if(remaining==0)return total;
            long full=remaining/20,partial=remaining%20;
            total+=20*(BaseScrapThroughWaves(wave+full-1)-BaseScrapThroughWaves(wave-1));
            if(partial>0)total+=partial*BaseScrapPerKill(checked(wave+(int)full));
            return total;
        }
        long BaseScrapThroughWaves(long wave)
        {
            if(RetainsPreviousIncome)return 3*wave+FloorIncomeBandsSum(wave-1,250);
            long tail=Math.Max(wave-200,0);
            return 3*wave+FloorIncomeBandsSum(Math.Min(wave,200),10)+20*tail+FloorIncomeBandsSum(tail,20);
        }
        static long FloorIncomeBandsSum(long inclusive,int band)
        {
            if(inclusive<0)return 0;
            long blocks=inclusive/band,remainder=inclusive%band;
            return band*blocks*(blocks-1)/2+blocks*(remainder+1);
        }
        public int WaveForKill(int ordinal)
        {
            if(ordinal<1)throw new ArgumentOutOfRangeException(nameof(ordinal));
            long remaining=ordinal;int wave=1;
            for(int count=6;count<20;count++) {
                int band=count*20;
                if(remaining<=band)return wave+(int)((remaining-1)/count);
                remaining-=band;wave+=20;
            }
            return checked(wave+(int)((remaining-1)/20));
        }
    }
    public static class LastStandEconomyCatalog
    {
        static readonly LastStandEconomyDefinition legacy=new LastStandEconomyDefinition(LastStandUpgradeCatalog.LegacyEconomyVersion);
        static readonly LastStandEconomyDefinition previous=new LastStandEconomyDefinition(LastStandUpgradeCatalog.PreviousEconomyVersion);
        static readonly LastStandEconomyDefinition retained=new LastStandEconomyDefinition(LastStandUpgradeCatalog.RetainedEconomyVersion);
        static readonly LastStandEconomyDefinition current=new LastStandEconomyDefinition(LastStandUpgradeCatalog.EconomyVersion);
        public static IReadOnlyList<LastStandEconomyDefinition> All { get; } = Array.AsReadOnly(new[]{legacy,previous,retained,current});
        public static LastStandEconomyDefinition Get(string version)
        {
            foreach(var definition in All)if(version==definition.Version)return definition;
            throw new ArgumentException("Unsupported Last Stand economy.",nameof(version));
        }
    }
}
