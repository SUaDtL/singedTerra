using System;
using System.Collections.Generic;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public sealed class LastStandEnemyDefinition
    {
        public FoeKind Kind { get; }
        public string Name { get; }
        public int HullPercent { get; }
        public int DamagePercent { get; }
        public int ArmorScale { get; }
        public int Speed { get; }
        public int StopDistance { get; }
        public int AttackIntervalTicks { get; }
        public int TelegraphTicks { get; }
        public int RewardMultiplier { get; }
        internal LastStandEnemyDefinition(FoeKind kind,string name,int hull,int damage,int armor,
            int speed,int stop,int interval,int telegraph,int reward)
        {
            Kind=kind;Name=name;HullPercent=hull;DamagePercent=damage;ArmorScale=armor;
            Speed=speed;StopDistance=stop;AttackIntervalTicks=interval;TelegraphTicks=telegraph;RewardMultiplier=reward;
        }
    }

    public readonly struct LastStandEnemyStats
    {
        public readonly FoeKind Kind;
        public readonly string Name;
        public readonly int Hull,Armor,Damage,Speed,StopDistance,AttackIntervalTicks,TelegraphTicks,RewardMultiplier;
        internal LastStandEnemyStats(LastStandEnemyDefinition definition,LastStandWaveDefinition wave)
        {
            Kind=definition.Kind;Name=definition.Name;
            Hull=Scale(wave.EnemyHull,definition.HullPercent);Damage=Scale(wave.EnemyDamage,definition.DamagePercent);
            Armor=(int)Math.Min(LastStandWaveCatalog.MaximumCombatValue,(4L+((long)wave.Wave-1)/12)*definition.ArmorScale);
            Speed=definition.Speed;StopDistance=definition.StopDistance;AttackIntervalTicks=definition.AttackIntervalTicks;
            TelegraphTicks=definition.TelegraphTicks;RewardMultiplier=definition.RewardMultiplier;
        }
        static int Scale(int value,int percent)=>(int)Math.Min(LastStandWaveCatalog.MaximumCombatValue,Math.Max(1,((long)value*percent+99)/100));
    }

    // Concrete authored roles and bounded recipes. The same projection supplies
    // spawning, combat information and income; presentation does not recalculate it.
    public static class LastStandEnemyCatalog
    {
        public const string Onboarding="onboarding",Mixed="mixed-pressure",Cinder="cinder-pressure",Foundry="foundry-pressure";
        public static IReadOnlyList<LastStandEnemyDefinition> All { get; }=Array.AsReadOnly(new[]{
            new LastStandEnemyDefinition(FoeKind.Close,"Close",100,100,0,50,4800,20,0,1),
            new LastStandEnemyDefinition(FoeKind.Ranged,"Ranged",100,100,0,40,12000,30,0,1),
            new LastStandEnemyDefinition(FoeKind.Swarmer,"Swarmer",45,50,0,100,4800,15,0,1),
            new LastStandEnemyDefinition(FoeKind.ArmoredBrute,"Armored Brute",240,150,1,25,4800,40,0,2),
            new LastStandEnemyDefinition(FoeKind.SiegeElite,"Siege Elite",800,400,2,20,15000,120,30,8)
        });
        static readonly IReadOnlyDictionary<string,FoeKind[]> recipes=new Dictionary<string,FoeKind[]>(StringComparer.Ordinal){
            {Mixed,new[]{FoeKind.Close,FoeKind.Ranged,FoeKind.Swarmer,FoeKind.ArmoredBrute,FoeKind.Swarmer,
                FoeKind.Close,FoeKind.Ranged,FoeKind.Swarmer,FoeKind.ArmoredBrute,FoeKind.Swarmer}},
            {Cinder,new[]{FoeKind.Close,FoeKind.Ranged,FoeKind.Swarmer,FoeKind.ArmoredBrute,FoeKind.ArmoredBrute,
                FoeKind.Close,FoeKind.Ranged,FoeKind.Swarmer,FoeKind.Swarmer,FoeKind.ArmoredBrute}},
            {Foundry,new[]{FoeKind.Close,FoeKind.Ranged,FoeKind.Swarmer,FoeKind.ArmoredBrute,FoeKind.ArmoredBrute,
                FoeKind.Close,FoeKind.Ranged,FoeKind.Swarmer,FoeKind.ArmoredBrute,FoeKind.ArmoredBrute}}
        };
        public static LastStandEnemyDefinition Get(FoeKind kind)
        {foreach(var definition in All)if(definition.Kind==kind)return definition;throw new ArgumentOutOfRangeException(nameof(kind));}
        public static void ValidateMix(string id)
        {if(id!=Onboarding&&(id==null||!recipes.ContainsKey(id)))throw new ArgumentException("Unknown enemy composition.");}
        public static void Validate()
        {
            var kinds=new HashSet<FoeKind>();var names=new HashSet<string>(StringComparer.Ordinal);
            foreach(var row in All)
                if(row==null||!kinds.Add(row.Kind)||!names.Add(row.Name)||!Enum.IsDefined(typeof(FoeKind),row.Kind)||
                    row.HullPercent<1||row.DamagePercent<1||row.ArmorScale<0||row.Speed<1||row.StopDistance<1||
                    row.AttackIntervalTicks<1||row.TelegraphTicks<0||row.TelegraphTicks>=row.AttackIntervalTicks||row.RewardMultiplier<1)
                    throw new ArgumentException("Invalid enemy definition.");
            foreach(var recipe in recipes.Values) {
                if(recipe.Length!=10)throw new ArgumentException("Enemy recipes must have a bounded ten-slot period.");
                foreach(var kind in recipe)if(!kinds.Contains(kind)||kind==FoeKind.SiegeElite)throw new ArgumentException("Invalid ordinary enemy recipe.");
            }
        }
        public static FoeKind KindFor(LastStandTierDefinition tier,int wave,int ordinal,LastStandRunEdition edition)
        {
            if(tier==null||edition==null)throw new ArgumentNullException(nameof(tier));
            var group=LastStandWaveCatalog.ForWave(tier,wave,edition);
            if(ordinal<0||ordinal>=group.EnemyCount)throw new ArgumentOutOfRangeException(nameof(ordinal));
            if(edition.IsLegacy||tier.EnemyMixId==Onboarding)
                return LastStandWaveCatalog.IsRanged(wave,ordinal,edition)?FoeKind.Ranged:FoeKind.Close;
            ValidateMix(tier.EnemyMixId);
            if(wave%50==0&&ordinal==group.EnemyCount-1)return FoeKind.SiegeElite;
            var recipe=recipes[tier.EnemyMixId];return recipe[(int)(((long)wave-1+ordinal)%recipe.Length)];
        }
        public static LastStandEnemyStats For(LastStandTierDefinition tier,int wave,int ordinal,LastStandRunEdition edition)
            =>ForKind(KindFor(tier,wave,ordinal,edition),LastStandWaveCatalog.ForWave(tier,wave,edition),edition);
        public static LastStandEnemyStats ForKind(FoeKind kind,LastStandWaveDefinition wave,LastStandRunEdition edition)
        {
            if(edition==null)throw new ArgumentNullException(nameof(edition));
            if(edition.IsLegacy&&kind!=FoeKind.Close&&kind!=FoeKind.Ranged)throw new ArgumentException("Enemy is unavailable in this edition.");
            return new LastStandEnemyStats(Get(kind),wave);
        }
    }
}
