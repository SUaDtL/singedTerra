using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // Run identity owns immutable prices, effects, roster and base income.
    // Research is a prospective modifier supplied by the authoritative caller.
    public sealed class LastStandEconomyDefinition
    {
        const int IncomeWaveBand=250;
        public string Version { get; }
        public bool IsLegacy => Version==LastStandUpgradeCatalog.LegacyEconomyVersion;
        public IReadOnlyList<LastStandUpgradeDefinition> Tracks { get; }
        internal LastStandEconomyDefinition(string version)
        { Version=version;Tracks=LastStandUpgradeCatalog.BuildTracks(version); }
        public LastStandUpgradeDefinition Get(LastStandUpgradeTrackId id)
        {
            int index=(int)id;
            if(index<0 || index>=Tracks.Count)throw new ArgumentOutOfRangeException(nameof(id));
            return Tracks[index];
        }
        public bool TryGet(string key,out LastStandUpgradeDefinition definition)
        {
            foreach(var row in Tracks)if(String.Equals(row.Key,key,StringComparison.Ordinal)){definition=row;return true;}
            definition=null;return false;
        }
        public int BaseScrapPerKill(int wave)
        {
            if(wave<1)throw new ArgumentOutOfRangeException(nameof(wave));
            return IsLegacy?3:checked(3+(wave-1)/IncomeWaveBand);
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
            total+=20*(3*full+FloorIncomeBandsSum(wave+full-2)-FloorIncomeBandsSum(wave-2));
            if(partial>0)total+=partial*BaseScrapPerKill(checked(wave+(int)full));
            return total;
        }
        static long FloorIncomeBandsSum(long inclusive)
        {
            if(inclusive<0)return 0;
            long blocks=inclusive/IncomeWaveBand,remainder=inclusive%IncomeWaveBand;
            return IncomeWaveBand*blocks*(blocks-1)/2+blocks*(remainder+1);
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
        static readonly LastStandEconomyDefinition current=new LastStandEconomyDefinition(LastStandUpgradeCatalog.EconomyVersion);
        public static LastStandEconomyDefinition Get(string version)
        {
            if(version==legacy.Version)return legacy;
            if(version==current.Version)return current;
            throw new ArgumentException("Unsupported Last Stand economy.",nameof(version));
        }
    }
}
