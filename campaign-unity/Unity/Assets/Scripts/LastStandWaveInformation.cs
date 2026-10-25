using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    // A disposable read model of the current encounter. It owns no progression
    // state and reads the same combat/reward owners that resolve actual hits.
    public sealed class LastStandWaveInformation
    {
        public sealed class Enemy
        {
            public FoeKind Kind { get; }
            public int Count { get; }
            public int Hull { get; }
            public int Armor => 0;
            public int RawDamage { get; }
            public int DamageAfterArmor { get; }
            public decimal AttackSeconds { get; }
            public decimal MovementUnitsPerSecond { get; }
            internal Enemy(FoeKind kind,int count,LastStandWaveDefinition wave,EncounterModel model)
            {
                Kind=kind;Count=count;Hull=wave.EnemyHull;RawDamage=wave.EnemyDamage;
                DamageAfterArmor=model.IncomingDamagePerHit(RawDamage);
                AttackSeconds=(decimal)EncounterModel.AttackIntervalTicks(kind)/EncounterModel.TicksPerSecond;
                // EncounterView uses one world unit per 1,000 model distance units.
                MovementUnitsPerSecond=(decimal)model.Profile.Speed(kind)*EncounterModel.TicksPerSecond/1000;
            }
        }
        public int Tier { get; }
        public int Wave { get; }
        public int TotalEnemies { get; }
        public int RemainingEnemies { get; }
        public bool RetainedEconomy { get; }
        public LastStandKillReward Reward { get; }
        public IReadOnlyList<Enemy> Enemies { get; }
        public LastStandWaveInformation(EncounterModel model,LastStandShopState shop,int logisticsRank)
        {
            if(model==null)throw new ArgumentNullException(nameof(model));
            if(shop==null)throw new ArgumentNullException(nameof(shop));
            if(!model.Profile.IsWaveBased)throw new ArgumentException("A wave encounter is required.",nameof(model));
            Tier=model.Profile.Tier;Wave=model.Wave;RemainingEnemies=model.RemainingWaveEnemies;
            var wave=LastStandWaveCatalog.ForWave(model.Profile.TierDefinition,Wave);TotalEnemies=wave.EnemyCount;
            Reward=shop.ProjectKillReward(Wave,logisticsRank);
            RetainedEconomy=shop.EconomyVersion!=LastStandUpgradeCatalog.EconomyVersion;
            var counts=new Dictionary<FoeKind,int>();
            for(int i=0;i<TotalEnemies;i++)
            {
                var kind=LastStandWaveCatalog.IsRanged(Wave,i)?FoeKind.Ranged:FoeKind.Close;
                counts[kind]=counts.TryGetValue(kind,out var count)?count+1:1;
            }
            var enemies=new List<Enemy>();
            foreach(FoeKind kind in Enum.GetValues(typeof(FoeKind)))
                if(counts.TryGetValue(kind,out var count))enemies.Add(new Enemy(kind,count,wave,model));
            Enemies=enemies.AsReadOnly();
        }
        static string Number(decimal value)=>value.ToString("0.####",CultureInfo.InvariantCulture);
        public string Describe()
        {
            var text=new StringBuilder("TIER ").Append(Tier).Append(" / WAVE ").Append(Wave)
                .Append("\nENEMIES LEFT: ").Append(RemainingEnemies).Append(" / ").Append(TotalEnemies)
                .Append("\nFull spawn stats. Timing and movement are at 1x speed.\n");
            foreach(var enemy in Enemies)
            {
                text.Append('\n').Append(enemy.Kind.ToString().ToUpperInvariant()).Append(" / ").Append(enemy.Count).Append(" THIS WAVE")
                    .Append("\nHP: ").Append(enemy.Hull).Append("\nArmor: none")
                    .Append("\nDamage: ").Append(enemy.RawDamage).Append(" / ").Append(enemy.DamageAfterArmor).Append(" after your armor")
                    .Append("\nAttack interval: ").Append(Number(enemy.AttackSeconds)).Append(" s")
                    .Append("\nMovement: ").Append(Number(enemy.MovementUnitsPerSecond)).Append(" world units/s\n");
            }
            text.Append("\nVALUE / EACH ENEMY TYPE")
                .Append("\nBase: ").Append(Reward.BaseScrap).Append(" Scrap")
                .Append("\nScrap Yield: ").Append(Number(Reward.YieldPercent/100m)).Append("x")
                .Append("\nScrap Logistics: ").Append(Number(Reward.LogisticsPercent/100m)).Append("x")
                .Append("\nEffective value: ").Append(Number(Reward.EffectiveScrap)).Append(" Scrap per kill");
            if(RemainingEnemies>0)text.Append("\nNext kill pays: ").Append(Reward.NextKillScrap).Append(" Scrap");
            else text.Append("\nWave cleared; values shown are for this wave.");
            text.Append("\nFractional value carries forward; individual whole-Scrap payouts can differ.");
            if(RetainedEconomy)text.Append("\n\nThis run keeps its saved income and upgrade rules. The new income curve starts with your next run.");
            return text.ToString();
        }
    }
}
