using System;
using System.Collections.Generic;
using System.Globalization;
using SingedTerra.LastStand;

namespace SingedTerra.Encounter
{
    // Deliberately bounded, non-awarding fixture. Not the production number system.
    public enum EncounterStatus { Running, Defeated, Limit }
    public enum FoeKind { Close, Ranged }
    public enum EncounterEventKind { Cannon, Launcher, Repair, CloseHit, RangedHit, Scattergun }
    // Scalar boundary data; empty cohorts are regenerated from tier/wave identity.
    public sealed class EncounterCheckpoint
    {
        public const int Version=1;
        public readonly string RulesVersion;
        public readonly int Tier,Fitting,Wave,CompletedWave,Tick,Hull,MaximumHull,Spawned,Kills,
            CannonShots,LauncherShots,ScattergunShots,Restored,CloseHits,RangedHits,
            NextSpawnTick,NextCannonTick,NextLauncherTick,NextRepairTick,NextScattergunTick,LastCannonShotTick,
            CannonDamage,LauncherDamage,ScattergunDamage,CannonPeriod,RepairAmount,ArmorLevel,CommittedCannonDamage;
        public EncounterCheckpoint(string rulesVersion,int tier,int fitting,int wave,int completedWave,int tick,
            int hull,int maximumHull,int spawned,int kills,int cannonShots,int launcherShots,int scattergunShots,
            int restored,int closeHits,int rangedHits,int nextSpawnTick,int nextCannonTick,int nextLauncherTick,
            int nextRepairTick,int nextScattergunTick,int lastCannonShotTick,int cannonDamage,int launcherDamage,
            int scattergunDamage,int cannonPeriod,int repairAmount,int armorLevel,int committedCannonDamage=EncounterModel.CannonDamage)
        {
            RulesVersion=rulesVersion;Tier=tier;Fitting=fitting;Wave=wave;CompletedWave=completedWave;Tick=tick;
            Hull=hull;MaximumHull=maximumHull;Spawned=spawned;Kills=kills;CannonShots=cannonShots;LauncherShots=launcherShots;
            ScattergunShots=scattergunShots;Restored=restored;CloseHits=closeHits;RangedHits=rangedHits;
            NextSpawnTick=nextSpawnTick;NextCannonTick=nextCannonTick;NextLauncherTick=nextLauncherTick;
            NextRepairTick=nextRepairTick;NextScattergunTick=nextScattergunTick;LastCannonShotTick=lastCannonShotTick;
            CannonDamage=cannonDamage;LauncherDamage=launcherDamage;ScattergunDamage=scattergunDamage;
            CannonPeriod=cannonPeriod;RepairAmount=repairAmount;ArmorLevel=armorLevel;
            CommittedCannonDamage=committedCannonDamage;
        }
    }
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
        public const int ScattergunPeriod=30, ScattergunRange=15000, ScattergunTargets=3;
        readonly EncounterFoe[] foes = new EncounterFoe[Capacity];
        readonly List<EncounterEvent> events = new List<EncounterEvent>(64);
        Func<int, int> incomingHitProjection = rawHit => rawHit;
        int nextSpawn = 1, nextCannon = 1, nextLauncher = 1, nextRepair = RepairPeriod;
        int lastCannonShot;
        int nextScattergun=1,waveSpawned;
        readonly int[] pendingHits=new int[Capacity];
        public LastStandFitting Fitting { get; }
        public bool HasLauncher => Fitting==LastStandFitting.Launcher;
        public bool HasRepair => Fitting==LastStandFitting.Repair;
        public bool HasScattergun => Fitting==LastStandFitting.Scattergun;
        public int Wave { get; private set; }=1;
        public int CompletedWave { get; private set; }
        public bool AwaitingWaveCommit { get; private set; }
        public int WaveEnemyCount => Profile.IsWaveBased?LastStandWaveCatalog.ForWave(Profile.TierDefinition,Wave).EnemyCount:0;
        public int RemainingWaveEnemies => Profile.IsWaveBased?WaveEnemyCount-waveSpawned+ActiveCount:ActiveCount;
        public int CurrentScattergunDamage { get; private set; }=LastStandUpgradeCatalog.BaseScattergunDamage;
        public int CurrentArmorLevel { get; private set; }
        public int ScattergunShots { get; private set; }
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
            :this(launcher?LastStandFitting.Launcher:LastStandFitting.Repair,profile,cannonDamage){}
        public EncounterModel(LastStandFitting fitting, EncounterProfile profile, int cannonDamage = CannonDamage)
        {
            Profile = profile ?? throw new ArgumentNullException(nameof(profile));
            if (cannonDamage < CannonDamage || cannonDamage > (Profile.IsWaveBased?LastStandWaveCatalog.MaximumCombatValue:50)) throw new ArgumentOutOfRangeException(nameof(cannonDamage));
            if(!Enum.IsDefined(typeof(LastStandFitting),fitting))throw new ArgumentOutOfRangeException(nameof(fitting));
            CommittedCannonDamage = cannonDamage;
            CurrentCannonDamage = cannonDamage;
            Fitting = fitting;
            for (int i = 0; i < Capacity; i++) foes[i] = new EncounterFoe();
        }
        public static EncounterModel CreatePlayable(LastStandFitting fitting,int tier,LastStandShopState shop)
        {
            if(shop==null)throw new ArgumentNullException(nameof(shop));
            int committed=LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack).EffectAt(shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).PermanentLevel,1);
            var model=new EncounterModel(fitting,EncounterProfile.ForTier(tier),committed);
            model.ApplyShopProjection(shop);return model;
        }
        public void ApplyShopProjection(LastStandShopState shop)
        {
            if(shop==null || shop.Fitting!=Fitting || !Profile.IsPlayable)throw new ArgumentException("Shop/model fitting mismatch.");
            Func<LastStandUpgradeTrackId,int> level=id=>shop.GetTrack(id).CurrentLevel;
            TryApplyPlayableAttackProjection(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack).EffectAt(level(LastStandUpgradeTrackId.CannonAttack),1),
                LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.LauncherAttack).EffectAt(level(LastStandUpgradeTrackId.LauncherAttack),1));
            int armor=level(LastStandUpgradeTrackId.Armor);
            TryApplyPlayableDefenseProjection(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.HullCapacity).EffectAt(level(LastStandUpgradeTrackId.HullCapacity),1),raw=>Math.Max(1,raw-armor));
            TryApplyPlayableArmorProjection(armor);
            TryApplyPlayableCannonPeriodProjection(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonCycle).EffectAt(level(LastStandUpgradeTrackId.CannonCycle),1));
            if(HasRepair)TryApplyPlayableRepairProjection(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.FieldRepair).EffectAt(level(LastStandUpgradeTrackId.FieldRepair),1));
            if(HasScattergun)TryApplyPlayableScattergunProjection(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.ScattergunAttack).EffectAt(level(LastStandUpgradeTrackId.ScattergunAttack),1));
        }
        public bool TryApplyPlayableArmorProjection(int level)
        {
            if(!Profile.IsPlayable || Status!=EncounterStatus.Running || level<0 || level>LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor).TotalCap)return false;
            CurrentArmorLevel=level;incomingHitProjection=raw=>Math.Max(1,raw-level);return true;
        }
        public bool TryApplyPlayableScattergunProjection(int damage)
        {
            if(!Profile.IsPlayable || Status!=EncounterStatus.Running || !HasScattergun || damage<LastStandUpgradeCatalog.BaseScattergunDamage || damage>LastStandWaveCatalog.MaximumCombatValue)return false;
            CurrentScattergunDamage=damage;return true;
        }
        // Consume validated catalog projections without owning shop levels or formulas.
        public bool TryApplyPlayableAttackProjection(int cannonDamage, int launcherDamage)
        {
            if (!Profile.IsPlayable || Status != EncounterStatus.Running ||
                cannonDamage < CannonDamage || launcherDamage < LauncherDamage ||
                cannonDamage>LastStandWaveCatalog.MaximumCombatValue || launcherDamage>LastStandWaveCatalog.MaximumCombatValue) return false;
            CurrentCannonDamage = cannonDamage;
            CurrentLauncherDamage = launcherDamage;
            return true;
        }
        // The catalog supplies immutable numeric capacity and a captured pure hit
        // projection. This model owns only their applied combat state.
        public bool TryApplyPlayableDefenseProjection(int maximumHull, Func<int, int> incomingHit)
        {
            if (!Profile.IsPlayable || Status != EncounterStatus.Running ||
                maximumHull < CurrentMaximumHull || maximumHull>LastStandWaveCatalog.MaximumCombatValue || incomingHit == null || incomingHit(1) != 1) return false;
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
                !HasRepair || amount < RepairAmount || amount>LastStandWaveCatalog.MaximumCombatValue) return false;
            CurrentRepairAmount = amount;
            return true;
        }
        public void Step()
        {
            if (Status != EncounterStatus.Running) return;
            events.Clear();
            if (AwaitingWaveCommit) return;
            // A technical integer ceiling freezes without a clear or reward. Normal
            // play has no fixture horizon; this is years beyond the intended session.
            if(Tick>=int.MaxValue-1024){Status=EncounterStatus.Limit;return;}
            Tick++;
            if (Tick >= nextSpawn && (!Profile.IsWaveBased || waveSpawned<WaveEnemyCount)) Spawn();
            foreach (var foe in foes)
                if (foe.Alive)
                    foe.Distance = Math.Max(StopDistance(foe), foe.Distance -
                        Profile.Speed(foe.Kind));
            if(Profile.IsWaveBased)PrepareIncomingHits();
            if (Tick >= nextCannon && Shoot(Profile.MainRange, CurrentCannonDamage, EncounterEventKind.Cannon))
            { CannonShots++; lastCannonShot = Tick; nextCannon = Tick + CurrentCannonPeriod; }
            if (HasLauncher)
            {
                if (Tick >= nextLauncher && Shoot(Profile.AuxiliaryRange, CurrentLauncherDamage, EncounterEventKind.Launcher))
                { LauncherShots++; nextLauncher = Tick + LauncherPeriod; }
            }
            else if(HasScattergun)
            {
                if(Tick>=nextScattergun && Scatter()) {ScattergunShots=Add(ScattergunShots,1);nextScattergun=Tick+ScattergunPeriod;}
            }
            else if (HasRepair && Tick >= nextRepair)
            {
                int amount = Math.Min(CurrentRepairAmount, CurrentMaximumHull - Hull);
                Hull += amount; Restored = Add(Restored,amount); nextRepair = Tick + RepairPeriod;
                if (amount > 0) events.Add(new EncounterEvent(EncounterEventKind.Repair, -1, amount));
            }
            AttackTank();
            if(Profile.IsWaveBased && waveSpawned==WaveEnemyCount && ActiveCount==0)
            {
                CompletedWave=Wave;AwaitingWaveCommit=true;
            }
            if (Hull == 0) Status = EncounterStatus.Defeated;
            else if (!Profile.IsWaveBased && Tick >= Profile.Horizon) Status = EncounterStatus.Limit;
        }
        public bool ContinueAfterCheckpoint()
        {
            if(!Profile.IsWaveBased || !AwaitingWaveCommit || Status!=EncounterStatus.Running || Wave==int.MaxValue)return false;
            Wave++;waveSpawned=0;AwaitingWaveCommit=false;nextSpawn=Tick+LastStandWaveCatalog.IntermissionTicks;
            return true;
        }
        static int Add(int value,int amount)=>(int)Math.Min(int.MaxValue,(long)value+amount);
        int StopDistance(EncounterFoe foe) => Profile.Stop(foe.Kind);
        void Spawn()
        {
            foreach (var foe in foes)
            {
                if (foe.Alive) continue;
                int group = Spawned / 8;
                foe.Id = Add(Spawned,1);
                if(Profile.IsWaveBased) {
                    var wave=LastStandWaveCatalog.ForWave(Profile.TierDefinition,Wave);
                    foe.Lane=LastStandWaveCatalog.Lane(Wave,waveSpawned);foe.Kind=LastStandWaveCatalog.IsRanged(Wave,waveSpawned)?FoeKind.Ranged:FoeKind.Close;
                    foe.Hull=foe.MaximumHull=wave.EnemyHull;foe.Damage=wave.EnemyDamage;
                    nextSpawn=Tick+wave.SpawnIntervalTicks;waveSpawned++;
                }else {
                    foe.Lane=Profile.Lane(Spawned);foe.Kind=Spawned%3==2?FoeKind.Ranged:FoeKind.Close;
                    foe.Hull=foe.MaximumHull=Profile.EnemyHull(30+group*10);foe.Damage=4+group*2;nextSpawn=Tick+Profile.Interval(Spawned);
                }
                foe.Distance = Profile.SpawnRadius;
                foe.NextAttack = 0; Spawned=Add(Spawned,1);
                return;
            }
        }
        bool Scatter()
        {
            // Each volley selects up to three distinct nearest targets, never
            // concentrating repeated pellets onto the same surviving target.
            int previousDistance=-1,previousId=-1;bool fired=false;
            for(int pellet=0;pellet<ScattergunTargets;pellet++) {
                int selected=-1;
                for(int i=0;i<Capacity;i++) {
                    var foe=foes[i];if(!foe.Alive || foe.Distance>ScattergunRange || foe.Distance<previousDistance || (foe.Distance==previousDistance && foe.Id<=previousId))continue;
                    if(selected<0 || foe.Distance<foes[selected].Distance || foe.Distance==foes[selected].Distance && foe.Id<foes[selected].Id)selected=i;
                }
                if(selected<0)break;
                var target=foes[selected];previousDistance=target.Distance;previousId=target.Id;
                int amount=Math.Min(target.Hull,CurrentScattergunDamage);target.Hull-=amount;if(!target.Alive)Kills=Add(Kills,1);
                events.Add(new EncounterEvent(EncounterEventKind.Scattergun,selected,amount,!target.Alive));fired=true;
            }
            return fired;
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
            target.Hull -= amount; if (!target.Alive) Kills=Add(Kills,1);
            events.Add(new EncounterEvent(kind, selected, amount, !target.Alive)); return true;
        }
        void PrepareIncomingHits()
        {
            for(int i=0;i<Capacity;i++) {
                var foe=foes[i];pendingHits[i]=foe.Alive && foe.Distance<=StopDistance(foe) && Tick>=foe.NextAttack?foe.Damage:0;
            }
        }
        void AttackTank()
        {
            for (int i = 0; i < Capacity && Hull > 0; i++)
            {
                var foe = foes[i];
                int raw=Profile.IsWaveBased?pendingHits[i]:foe.Damage;
                if (Profile.IsWaveBased?raw==0:!foe.Alive || foe.Distance > StopDistance(foe) || Tick < foe.NextAttack) continue;
                int projectedHit = incomingHitProjection(raw);
                int damage = Math.Min(Hull, Math.Max(1, Math.Min(raw, projectedHit))); Hull -= damage;
                bool close = foe.Kind == FoeKind.Close;
                if (close) CloseHits=Add(CloseHits,1); else RangedHits=Add(RangedHits,1);
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
            if(Profile.IsWaveBased)result.Append('|').Append((int)Fitting).Append('|').Append(Wave).Append('|').Append(CompletedWave).Append('|').Append(waveSpawned).Append('|').Append(nextScattergun).Append('|').Append(ScattergunShots)
                .Append('|').Append(CommittedCannonDamage).Append('|').Append(CurrentCannonDamage).Append('|').Append(CurrentLauncherDamage).Append('|').Append(CurrentScattergunDamage)
                .Append('|').Append(CurrentMaximumHull).Append('|').Append(CurrentCannonPeriod).Append('|').Append(CurrentRepairAmount).Append('|').Append(CurrentArmorLevel).Append('|').Append(lastCannonShot);
            foreach (var f in foes)
                if(Profile.IsWaveBased && !f.Alive)result.Append(";0,0,0,0");
                else result.Append(';').Append(f.Id).Append(',').Append(f.Hull).Append(',').Append(f.Distance).Append(',').Append(f.NextAttack);
            return result.ToString();
        }
        public EncounterCheckpoint CaptureCheckpoint()
        {
            if(!Profile.IsWaveBased || ActiveCount!=0 || !(Tick==0 && waveSpawned==0 || AwaitingWaveCommit))throw new InvalidOperationException("Only a starting or completed empty cohort can checkpoint.");
            return new EncounterCheckpoint(LastStandWaveCatalog.RulesVersion,Profile.Tier,(int)Fitting,Wave,CompletedWave,Tick,Hull,CurrentMaximumHull,Spawned,Kills,
                CannonShots,LauncherShots,ScattergunShots,Restored,CloseHits,RangedHits,nextSpawn,nextCannon,nextLauncher,nextRepair,nextScattergun,lastCannonShot,
                CurrentCannonDamage,CurrentLauncherDamage,CurrentScattergunDamage,CurrentCannonPeriod,CurrentRepairAmount,CurrentArmorLevel,CommittedCannonDamage);
        }
        public static EncounterModel RestoreCheckpoint(EncounterProfile profile,LastStandFitting fitting,EncounterCheckpoint s)
        {
            if(s==null || profile==null || !profile.IsWaveBased || s.RulesVersion!=LastStandWaveCatalog.RulesVersion || s.Tier!=profile.Tier || s.Fitting!=(int)fitting ||
                s.Wave<1 || !(s.CompletedWave==s.Wave || s.CompletedWave==0 && s.Wave==1 && s.Tick==0) || s.Tick<0 || s.Tick>int.MaxValue-1024 ||
                s.Hull<1 || s.MaximumHull<MaximumHull || s.MaximumHull<s.Hull || s.MaximumHull>LastStandWaveCatalog.MaximumCombatValue ||
                s.Spawned!=LastStandWaveCatalog.TotalEnemiesThroughWave(s.CompletedWave) || s.Kills!=s.Spawned ||
                s.CompletedWave==0 && (s.Spawned!=0 || s.CannonShots!=0 || s.LauncherShots!=0 || s.ScattergunShots!=0 || s.Restored!=0 || s.CloseHits!=0 || s.RangedHits!=0) ||
                s.CannonShots<0 || s.LauncherShots<0 || s.ScattergunShots<0 || s.Restored<0 || s.CloseHits<0 || s.RangedHits<0 ||
                s.NextSpawnTick<1 || s.NextCannonTick<1 || s.NextLauncherTick<1 || s.NextRepairTick<1 || s.NextScattergunTick<1 ||
                s.NextSpawnTick>(long)s.Tick+36 || s.NextCannonTick>(long)s.Tick+CannonPeriod || s.NextLauncherTick>(long)s.Tick+LauncherPeriod ||
                s.NextRepairTick>(long)s.Tick+RepairPeriod || s.NextScattergunTick>(long)s.Tick+ScattergunPeriod ||
                s.LastCannonShotTick<0 || s.LastCannonShotTick>s.Tick || s.CannonDamage<CannonDamage || s.CannonDamage>LastStandWaveCatalog.MaximumCombatValue ||
                s.LauncherDamage<LauncherDamage || s.LauncherDamage>LastStandWaveCatalog.MaximumCombatValue ||
                s.ScattergunDamage<LastStandUpgradeCatalog.BaseScattergunDamage || s.ScattergunDamage>LastStandWaveCatalog.MaximumCombatValue ||
                s.CannonPeriod<1 || s.CannonPeriod>CannonPeriod || s.RepairAmount<RepairAmount || s.RepairAmount>LastStandWaveCatalog.MaximumCombatValue ||
                s.ArmorLevel<0 || s.ArmorLevel>LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor).TotalCap ||
                s.CommittedCannonDamage<CannonDamage || s.CommittedCannonDamage>s.CannonDamage)
                throw new ArgumentException("Invalid or incompatible wave checkpoint.");
            var m=new EncounterModel(fitting,profile,s.CommittedCannonDamage) {
                Wave=s.Wave,CompletedWave=s.CompletedWave,Tick=s.Tick,Hull=s.Hull,CurrentMaximumHull=s.MaximumHull,Spawned=s.Spawned,Kills=s.Kills,
                CannonShots=s.CannonShots,LauncherShots=s.LauncherShots,ScattergunShots=s.ScattergunShots,Restored=s.Restored,CloseHits=s.CloseHits,RangedHits=s.RangedHits,
                nextSpawn=s.NextSpawnTick,nextCannon=s.NextCannonTick,nextLauncher=s.NextLauncherTick,nextRepair=s.NextRepairTick,nextScattergun=s.NextScattergunTick,
                lastCannonShot=s.LastCannonShotTick,CurrentCannonDamage=s.CannonDamage,CurrentLauncherDamage=s.LauncherDamage,CurrentScattergunDamage=s.ScattergunDamage,CurrentCannonPeriod=s.CannonPeriod,CurrentRepairAmount=s.RepairAmount,
                AwaitingWaveCommit=s.CompletedWave>0,waveSpawned=s.CompletedWave>0?LastStandWaveCatalog.ForWave(profile.TierDefinition,s.Wave).EnemyCount:0
            };
            m.TryApplyPlayableArmorProjection(s.ArmorLevel);return m;
        }
    }
}
