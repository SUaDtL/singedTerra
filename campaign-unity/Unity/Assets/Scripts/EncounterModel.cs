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
        public readonly bool Killed;
        public EncounterEvent(EncounterEventKind kind, int slot, int amount, bool killed = false)
        { Kind = kind; Slot = slot; Amount = amount; Killed = killed; }
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
        Func<int, int> incomingHitProjection = rawHit => rawHit;
        int nextSpawn = 1, nextCannon = 1, nextLauncher = 1, nextRepair = RepairPeriod;
        int lastCannonShot;
        public bool HasLauncher { get; }
        public EncounterProfile Profile { get; }
        public int CommittedCannonDamage { get; }
        public int CurrentCannonDamage { get; private set; }
        public int CurrentLauncherDamage { get; private set; } = LauncherDamage;
        public int CurrentMaximumHull { get; private set; } = MaximumHull;
        public int CurrentCannonPeriod { get; private set; } = CannonPeriod;
        public int CurrentRepairAmount { get; private set; } = RepairAmount;
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
        public EncounterModel(bool launcher) : this(launcher, EncounterProfile.Legacy) { }
        public EncounterModel(bool launcher, EncounterProfile profile, int cannonDamage = CannonDamage)
        {
            Profile = profile ?? throw new ArgumentNullException(nameof(profile));
            if (cannonDamage < CannonDamage || cannonDamage > 50) throw new ArgumentOutOfRangeException(nameof(cannonDamage));
            CommittedCannonDamage = cannonDamage;
            CurrentCannonDamage = cannonDamage;
            HasLauncher = launcher;
            for (int i = 0; i < Capacity; i++) foes[i] = new EncounterFoe();
        }
        // Consume validated catalog projections without owning shop levels or formulas.
        public bool TryApplyPlayableAttackProjection(int cannonDamage, int launcherDamage)
        {
            if (!Profile.IsPlayable || Status != EncounterStatus.Running ||
                cannonDamage < CannonDamage || launcherDamage < LauncherDamage) return false;
            CurrentCannonDamage = cannonDamage;
            CurrentLauncherDamage = launcherDamage;
            return true;
        }
        // The catalog supplies immutable numeric capacity and a captured pure hit
        // projection. This model owns only their applied combat state.
        public bool TryApplyPlayableDefenseProjection(int maximumHull, Func<int, int> incomingHit)
        {
            if (!Profile.IsPlayable || Status != EncounterStatus.Running ||
                maximumHull < CurrentMaximumHull || incomingHit == null || incomingHit(1) != 1) return false;
            int nextHull = (int)Math.Min((long)maximumHull, Hull + (long)maximumHull - CurrentMaximumHull);
            CurrentMaximumHull = maximumHull;
            incomingHitProjection = incomingHit;
            Hull = nextHull;
            return true;
        }
        // The catalog owns levels and the formula; only actual shots anchor cadence.
        public bool TryApplyPlayableCannonPeriodProjection(int period)
        {
            if (!Profile.IsPlayable || Status != EncounterStatus.Running ||
                period < 1 || period > CannonPeriod) return false;
            if (period == CurrentCannonPeriod) return true;
            CurrentCannonPeriod = period;
            if (lastCannonShot > 0) nextCannon = Math.Max(Tick + 1, lastCannonShot + period);
            return true;
        }
        // The catalog supplies the amount; the repair fitting retains its fixed cadence.
        public bool TryApplyPlayableRepairProjection(int amount)
        {
            if (!Profile.IsPlayable || Status != EncounterStatus.Running ||
                HasLauncher || amount < RepairAmount) return false;
            CurrentRepairAmount = amount;
            return true;
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
                        Profile.Speed(foe.Kind));
            if (Tick >= nextCannon && Shoot(Profile.MainRange, CurrentCannonDamage, EncounterEventKind.Cannon))
            { CannonShots++; lastCannonShot = Tick; nextCannon = Tick + CurrentCannonPeriod; }
            if (HasLauncher)
            {
                if (Tick >= nextLauncher && Shoot(Profile.AuxiliaryRange, CurrentLauncherDamage, EncounterEventKind.Launcher))
                { LauncherShots++; nextLauncher = Tick + LauncherPeriod; }
            }
            else if (Tick >= nextRepair)
            {
                int amount = Math.Min(CurrentRepairAmount, CurrentMaximumHull - Hull);
                Hull += amount; Restored += amount; nextRepair = Tick + RepairPeriod;
                if (amount > 0) events.Add(new EncounterEvent(EncounterEventKind.Repair, -1, amount));
            }
            AttackTank();
            if (Hull == 0) Status = EncounterStatus.Defeated;
            else if (Tick >= Profile.Horizon) Status = EncounterStatus.Limit;
        }
        int StopDistance(EncounterFoe foe) => Profile.Stop(foe.Kind);
        void Spawn()
        {
            foreach (var foe in foes)
            {
                if (foe.Alive) continue;
                int group = Spawned / 8;
                foe.Id = Spawned + 1; foe.Lane = Profile.Lane(Spawned);
                foe.Kind = Spawned % 3 == 2 ? FoeKind.Ranged : FoeKind.Close;
                foe.Hull = foe.MaximumHull = 30 + group * 10;
                foe.Distance = Profile.SpawnRadius; foe.Damage = 4 + group * 2;
                foe.NextAttack = 0; nextSpawn = Tick + Profile.Interval(Spawned); Spawned++;
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
            events.Add(new EncounterEvent(kind, selected, amount, !target.Alive)); return true;
        }
        void AttackTank()
        {
            for (int i = 0; i < Capacity && Hull > 0; i++)
            {
                var foe = foes[i];
                if (!foe.Alive || foe.Distance > StopDistance(foe) || Tick < foe.NextAttack) continue;
                int projectedHit = incomingHitProjection(foe.Damage);
                int damage = Math.Min(Hull, Math.Max(1, Math.Min(foe.Damage, projectedHit))); Hull -= damage;
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
