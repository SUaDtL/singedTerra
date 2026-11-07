using System;

namespace SingedTerra.LastStand
{
    // Generated from stable tier/wave identity. No growing roster or mutable PRNG state.
    public readonly struct LastStandWaveDefinition
    {
        public readonly int Wave, EnemyCount, EnemyHull, EnemyDamage, SpawnIntervalTicks;
        internal LastStandWaveDefinition(int wave,int count,int hull,int damage,int interval)
        {Wave=wave;EnemyCount=count;EnemyHull=hull;EnemyDamage=damage;SpawnIntervalTicks=interval;}
    }
    public static class LastStandWaveCatalog
    {
        public const string RulesVersion="last-stand-waves-v1";
        public const int IntermissionTicks=10;
        public const int MaximumEnemyCount=20, MaximumCombatValue=1000000000;
        public static LastStandWaveDefinition ForWave(int tier,int wave)=>ForWave(LastStandTierCatalog.Get(tier),wave);
        public static LastStandWaveDefinition ForWave(LastStandTierDefinition tier,int wave)
            =>ForWave(tier,wave,LastStandRunEdition.Current);
        public static LastStandWaveDefinition ForWave(LastStandTierDefinition tier,int wave,LastStandRunEdition edition)
        {
            if(edition==null)throw new ArgumentNullException(nameof(edition));
            return edition.IsLegacy?LegacyWave(tier,wave):CurrentWave(tier,wave);
        }
        // The new edition starts at the captured baseline. Subsequent authored
        // mechanics extend CurrentWave without reinterpreting retained runs.
        static LastStandWaveDefinition CurrentWave(LastStandTierDefinition tier,int wave)=>LegacyWave(tier,wave);
        static LastStandWaveDefinition LegacyWave(LastStandTierDefinition tier,int wave)
        {
            if(tier==null)throw new ArgumentNullException(nameof(tier));
            if(wave<1)throw new ArgumentOutOfRangeException(nameof(wave));
            // The wave number remains unbounded by content; arithmetic caps before multiplication.
            long depth=Math.Min((long)wave-1,1000000);
            long hull=30+depth*12+depth*depth/60;
            long damage=4+depth/2+depth*depth/20000;
            int tierScale=Math.Min(tier.Id,1000);
            long multiplier=1L+(tierScale-1)*2L;
            return new LastStandWaveDefinition(wave,Math.Min(MaximumEnemyCount,6+(wave-1)/20),
                (int)Math.Min(MaximumCombatValue,hull*multiplier),
                (int)Math.Min(MaximumCombatValue,damage*multiplier),wave<100?28:36);
        }
        public static int Lane(int wave,int ordinal)=> (int)(((long)wave*3+ordinal*5)%8);
        public static int Lane(int wave,int ordinal,LastStandRunEdition edition)=>Lane(wave,ordinal);
        public static bool IsRanged(int wave,int ordinal)=>((long)wave+ordinal)%3==0;
        public static bool IsRanged(int wave,int ordinal,LastStandRunEdition edition)=>IsRanged(wave,ordinal);
        public static int Intermission(LastStandRunEdition edition)=>IntermissionTicks;
        public static int TotalEnemiesThroughWave(int completedWave,LastStandRunEdition edition)=>TotalEnemiesThroughWave(completedWave);
        public static int TotalEnemiesThroughWave(int completedWave)
        {
            if(completedWave<0)throw new ArgumentOutOfRangeException(nameof(completedWave));
            long remaining=completedWave,total=0;
            for(int count=6;count<MaximumEnemyCount && remaining>0;count++) {
                long band=Math.Min(remaining,20);total+=band*count;remaining-=band;
            }
            return (int)Math.Min(int.MaxValue,total+remaining*MaximumEnemyCount);
        }
    }
}
