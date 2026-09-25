using System;
using System.Collections.Generic;
using System.Globalization;

namespace SingedTerra.Encounter
{
    // Deliberately bounded, non-awarding fixture. Not the production number system.
    public enum EncounterStatus { Running, Defeated, Limit }
    public enum FoeKind { Close, Ranged }
    public enum EncounterEventKind { Cannon, Launcher, Repair, CloseHit, RangedHit }
    public sealed class EncounterFoe
    {
        public int Id { get; internal set; }
        public int Lane { get; internal set; }
        public int Distance { get; internal set; }
        public int Hull { get; internal set; }
        public int MaximumHull { get; internal set; }
        public int Damage { get; internal set; }
        public FoeKind Kind { get; internal set; }
        internal int NextAttack;
        public bool Alive => Hull > 0;
    }
    public readonly struct EncounterEvent
    {
        public readonly EncounterEventKind Kind;
        public readonly int Slot, Amount;
        public EncounterEvent(EncounterEventKind kind, int slot, int amount)
        { Kind = kind; Slot = slot; Amount = amount; }
    }
    public sealed class EncounterModel
    {
        public const string RulesVersion = "encounter-fixture-v1";
        public const int TicksPerSecond = 20, Capacity = 32, TickLimit = 2400;
        public const int MaximumHull = 120, SpawnPeriod = 16, SpawnDistance = 16000;
        public const int CannonPeriod = 20, CannonRange = 14000, CannonDamage = 20;
        public const int LauncherPeriod = 30, LauncherRange = 18000, LauncherDamage = 12;
        public const int RepairPeriod = 20, RepairAmount = 3;
        readonly EncounterFoe[] foes = new EncounterFoe[Capacity];
        readonly List<EncounterEvent> events = new List<EncounterEvent>(64);
        int nextSpawn = 1, nextCannon = 1, nextLauncher = 1, nextRepair = RepairPeriod;
        public bool HasLauncher { get; }
        public int Tick { get; private set; }
        public int Hull { get; private set; } = MaximumHull;
        public int Spawned { get; private set; }
        public int Kills { get; private set; }
        public int CannonShots { get; private set; }
        public int LauncherShots { get; private set; }
        public int Restored { get; private set; }
        public int CloseHits { get; private set; }
        public int RangedHits { get; private set; }
        public EncounterStatus Status { get; private set; }
        public IReadOnlyList<EncounterFoe> Foes => foes;
        public IReadOnlyList<EncounterEvent> Events => events;
        public EncounterModel(bool launcher)
        {
            HasLauncher = launcher;
            for (int i = 0; i < Capacity; i++) foes[i] = new EncounterFoe();
        }
        public void Step()
        {
            if (Status != EncounterStatus.Running) return;
            Tick++;
            events.Clear();
            if (Tick >= nextSpawn) Spawn();
            foreach (var foe in foes)
                if (foe.Alive)
                    foe.Distance = Math.Max(StopDistance(foe), foe.Distance -
                        (foe.Kind == FoeKind.Close ? 110 : 70));
            if (Tick >= nextCannon && Shoot(CannonRange, CannonDamage, EncounterEventKind.Cannon))
            { CannonShots++; nextCannon = Tick + CannonPeriod; }
            if (HasLauncher)
            {
                if (Tick >= nextLauncher && Shoot(LauncherRange, LauncherDamage, EncounterEventKind.Launcher))
                { LauncherShots++; nextLauncher = Tick + LauncherPeriod; }
            }
            else if (Tick >= nextRepair)
            {
                int amount = Math.Min(RepairAmount, MaximumHull - Hull);
                Hull += amount; Restored += amount; nextRepair = Tick + RepairPeriod;
                if (amount > 0) events.Add(new EncounterEvent(EncounterEventKind.Repair, -1, amount));
            }
            AttackTank();
            if (Hull == 0) Status = EncounterStatus.Defeated;
            else if (Tick >= TickLimit) Status = EncounterStatus.Limit;
        }
        static int StopDistance(EncounterFoe foe) => foe.Kind == FoeKind.Close ? 3400 : 10000;
        void Spawn()
        {
            foreach (var foe in foes)
            {
                if (foe.Alive) continue;
                int group = Spawned / 8;
                foe.Id = Spawned + 1; foe.Lane = Spawned * 3 % 8;
                foe.Kind = Spawned % 3 == 2 ? FoeKind.Ranged : FoeKind.Close;
                foe.Hull = foe.MaximumHull = 30 + group * 10;
                foe.Distance = SpawnDistance; foe.Damage = 4 + group * 2;
                foe.NextAttack = 0; Spawned++; nextSpawn = Tick + SpawnPeriod;
                return;
            }
        }
        bool Shoot(int range, int damage, EncounterEventKind kind)
        {
            int selected = -1;
            for (int i = 0; i < Capacity; i++)
            {
                var foe = foes[i];
                if (!foe.Alive || foe.Distance > range) continue;
                if (selected < 0 || foe.Distance < foes[selected].Distance ||
                    (foe.Distance == foes[selected].Distance && foe.Id < foes[selected].Id)) selected = i;
            }
            if (selected < 0) return false;
            var target = foes[selected]; int amount = Math.Min(target.Hull, damage);
            target.Hull -= amount; if (!target.Alive) Kills++;
            events.Add(new EncounterEvent(kind, selected, amount)); return true;
        }
        void AttackTank()
        {
            for (int i = 0; i < Capacity && Hull > 0; i++)
            {
                var foe = foes[i];
                if (!foe.Alive || foe.Distance > StopDistance(foe) || Tick < foe.NextAttack) continue;
                int damage = Math.Min(Hull, foe.Damage); Hull -= damage;
                bool close = foe.Kind == FoeKind.Close;
                if (close) CloseHits++; else RangedHits++;
                foe.NextAttack = Tick + (close ? 20 : 30);
                events.Add(new EncounterEvent(close ? EncounterEventKind.CloseHit : EncounterEventKind.RangedHit, i, damage));
            }
        }
        public int ActiveCount
        {
            get { int count = 0; foreach (var foe in foes) if (foe.Alive) count++; return count; }
        }
        public string Summary => string.Format(CultureInfo.InvariantCulture,
            "{0}|{1}|{2}|{3}|{4}|{5}|{6}|{7}|{8}|{9}",
            HasLauncher, Status, Tick, Hull, Spawned, Kills, CannonShots, LauncherShots, Restored, CloseHits + RangedHits);
        public string Snapshot()
        {
            var result = new System.Text.StringBuilder(Summary);
            result.Append('|').Append(nextSpawn).Append('|').Append(nextCannon).Append('|').Append(nextLauncher).Append('|').Append(nextRepair);
            foreach (var f in foes)
                result.Append(';').Append(f.Id).Append(',').Append(f.Hull).Append(',').Append(f.Distance).Append(',').Append(f.NextAttack);
            return result.ToString();
        }
    }
}
