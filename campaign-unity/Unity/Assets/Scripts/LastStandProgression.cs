using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace SingedTerra.LastStand
{
    public sealed class PendingDefeat
    {
        public int RunId { get; }
        public int ElapsedTicks { get; }
        public int Kills { get; }
        public int Reward => 1;
        public PendingDefeat(int runId, int elapsedTicks, int kills)
        { RunId = runId; ElapsedTicks = elapsedTicks; Kills = kills; }
    }

    // One local prototype record; never account or verified reward authority.
    public sealed class LastStandProgression
    {
        public const string StorageKey = "singedTerra.lastStand.prototype.v1";
        private const int MaximumLevel = 3;
        private static readonly Regex SavePattern = new Regex(
            @"\A[\x20\t\r\n]*\{[\x20\t\r\n]*""version""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""credits""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""permanentLevel""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""nextRunId""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""lastFinalizedRunId""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""pendingDefeat""[\x20\t\r\n]*:[\x20\t\r\n]*(?:null|\{[\x20\t\r\n]*""runId""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""elapsedTicks""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""kills""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""reward""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*\})[\x20\t\r\n]*\}[\x20\t\r\n]*\z",
            RegexOptions.CultureInvariant);

        private sealed class Record
        {
            public int Wallet;
            public int Level;
            public int NextRunId;
            public int FinalizedRunId;
            public PendingDefeat Pending;
            public Record Copy() => new Record { Wallet = Wallet, Level = Level,
                NextRunId = NextRunId, FinalizedRunId = FinalizedRunId, Pending = Pending };
        }

        private readonly ILastStandStorage storage;
        private Record committed;
        private Record candidate;
        private Action afterCommit;
        private int activeRunId;
        private int activeDamage;

        private LastStandProgression(ILastStandStorage storage)
        {
            this.storage = storage ?? throw new ArgumentNullException(nameof(storage));
            SaveState = "blocked";
        }

        public int Wallet => committed == null ? 0 : committed.Wallet;
        public int CannonAttackLevel => committed == null ? 0 : committed.Level;
        public int CannonDamage => activeRunId != 0 ? activeDamage : 20 + 10 * CannonAttackLevel;
        public int NextCost => CannonAttackLevel < MaximumLevel ? CannonAttackLevel + 1 : 0;
        public int NextRunId => committed == null ? 0 : committed.NextRunId;
        public int FinalizedRunId => committed == null ? 0 : committed.FinalizedRunId;
        public PendingDefeat PendingDefeat => committed == null ? null : committed.Pending;
        public int ActiveRunId => activeRunId;
        public string SaveState { get; private set; }
        public string SaveError { get; private set; }

        public static LastStandProgression Load(ILastStandStorage storage)
        {
            var model = new LastStandProgression(storage);
            model.Reload();
            return model;
        }

        private bool Reload()
        {
            try
            {
                var value = storage.Read();
                if (value == null)
                {
                    candidate = new Record { NextRunId = 1 };
                    return Retry();
                }
                Record parsed;
                if (!TryParse(value, out parsed))
                {
                    SaveState = "blocked";
                    SaveError = "Saved Last Stand data is invalid or unsupported. Repair it before retrying.";
                    return false;
                }
                committed = parsed;
                SaveState = "ready";
                SaveError = null;
                return true;
            }
            catch (Exception)
            {
                SaveState = "blocked";
                SaveError = "Local storage could not be read. Retry when available.";
                return false;
            }
        }

        public bool TryDeploy()
        {
            if (!Ready || activeRunId != 0 || committed.Pending != null || committed.NextRunId == int.MaxValue)
                return false;
            var runId = committed.NextRunId;
            var next = committed.Copy();
            next.NextRunId++;
            return Commit(next, () => { activeRunId = runId; activeDamage = 20 + 10 * next.Level; });
        }

        public bool TryStageDefeat(int elapsedTicks, int kills)
        {
            if (!Ready || activeRunId == 0 || elapsedTicks < 0 || kills < 0 || committed.Pending != null)
                return false;
            var next = committed.Copy();
            next.Pending = new PendingDefeat(activeRunId, elapsedTicks, kills);
            return Commit(next, () => { activeRunId = 0; activeDamage = 0; });
        }

        public bool TryStageNonDefeat()
        {
            AbandonRun();
            return false;
        }

        public void AbandonRun()
        {
            if (candidate != null) return;
            activeRunId = 0;
            activeDamage = 0;
        }

        public bool TryClaim()
        {
            if (!Ready || activeRunId != 0 || committed.Pending == null || committed.Wallet == int.MaxValue)
                return false;
            var next = committed.Copy();
            next.Wallet++;
            next.FinalizedRunId = next.Pending.RunId;
            next.Pending = null;
            return Commit(next, null);
        }

        public bool TryPurchase()
        {
            if (!Ready || activeRunId != 0 || committed.Pending != null || committed.Level == MaximumLevel)
                return false;
            var cost = NextCost;
            if (committed.Wallet < cost) return false;
            var next = committed.Copy();
            next.Wallet -= cost;
            next.Level++;
            return Commit(next, null);
        }

        private bool Ready => SaveState == "ready" && committed != null && candidate == null;
        private bool Commit(Record next, Action completion)
        {
            candidate = next;
            afterCommit = completion;
            return Retry();
        }

        public bool Retry()
        {
            if (candidate == null) return Reload();
            try
            {
                var desired = Serialize(candidate);
                var existing = storage.Read();
                if (existing != desired)
                {
                    if (committed != null && existing != Serialize(committed) ||
                        committed == null && existing != null)
                    {
                        SaveState = "blocked";
                        SaveError = "The saved record changed unexpectedly. Review it before retrying.";
                        return false;
                    }
                    storage.Write(desired);
                    if (storage.Read() != desired)
                        throw new InvalidOperationException("Saved data did not match the requested record.");
                }
                committed = candidate;
                candidate = null;
                var completion = afterCommit;
                afterCommit = null;
                completion?.Invoke();
                SaveState = "ready";
                SaveError = null;
                return true;
            }
            catch (Exception)
            {
                SaveState = "retry";
                SaveError = "The save was not confirmed. Retry to reconcile local storage.";
                return false;
            }
        }

        private static string Serialize(Record record)
        {
            var pending = record.Pending;
            var pendingJson = pending == null ? "null" : "{\"runId\":" + pending.RunId +
                ",\"elapsedTicks\":" + pending.ElapsedTicks + ",\"kills\":" + pending.Kills +
                ",\"reward\":1}";
            return "{\"version\":1,\"credits\":" + record.Wallet +
                ",\"permanentLevel\":" + record.Level +
                ",\"nextRunId\":" + record.NextRunId +
                ",\"lastFinalizedRunId\":" + record.FinalizedRunId +
                ",\"pendingDefeat\":" + pendingJson + "}";
        }

        private static bool TryParse(string json, out Record record)
        {
            record = null;
            if (json == null || json.Length > 2048) return false;
            var match = SavePattern.Match(json);
            if (!match.Success) return false;
            var values = new int[10];
            for (var i = 1; i <= 9; i++)
            {
                if (match.Groups[i].Success &&
                    !int.TryParse(match.Groups[i].Value, NumberStyles.None, CultureInfo.InvariantCulture, out values[i]))
                    return false;
            }
            if (values[1] != 1 || values[3] > MaximumLevel || values[4] < 1 || values[5] >= values[4])
                return false;
            PendingDefeat pending = null;
            if (match.Groups[6].Success)
            {
                if (values[6] < 1 || values[6] != values[4] - 1 || values[6] <= values[5] || values[9] != 1)
                    return false;
                pending = new PendingDefeat(values[6], values[7], values[8]);
            }
            record = new Record { Wallet = values[2], Level = values[3], NextRunId = values[4],
                FinalizedRunId = values[5], Pending = pending };
            return true;
        }
    }
}
