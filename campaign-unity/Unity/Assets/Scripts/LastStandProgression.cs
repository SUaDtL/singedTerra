using System;
using System.Globalization;
using System.Text;
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
        private const int MaximumLevel = LastStandUpgradeCatalog.PermanentCap;
        private static readonly Regex SavePattern = new Regex(
            @"\A[\x20\t\r\n]*\{[\x20\t\r\n]*""version""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""credits""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""permanentLevel""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""nextRunId""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""lastFinalizedRunId""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""pendingDefeat""[\x20\t\r\n]*:[\x20\t\r\n]*(?:null|\{[\x20\t\r\n]*""runId""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""elapsedTicks""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""kills""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*,[\x20\t\r\n]*""reward""[\x20\t\r\n]*:[\x20\t\r\n]*((?:0|[1-9][0-9]*))[\x20\t\r\n]*\})[\x20\t\r\n]*\}[\x20\t\r\n]*\z",
            RegexOptions.CultureInvariant);

        private const string JsonSpace = @"[\x20\t\r\n]*";
        private const string JsonInteger = @"(?:0|[1-9][0-9]*)";
        private static string JsonField(string name, string value) => JsonSpace + "\"" + name + "\"" +
            JsonSpace + ":" + JsonSpace + value + JsonSpace;
        private static string IntegerField(string name) => JsonField(name, "(?<" + name + ">" + JsonInteger + ")");
        private static readonly string TrackField = "\"[A-Za-z]+\"" + JsonSpace + ":" + JsonSpace + JsonInteger + JsonSpace;
        private static readonly Regex V2SavePattern = new Regex(@"\A" + JsonSpace + @"\{" +
            IntegerField("version") + "," + IntegerField("credits") + "," +
            JsonField("permanentLevels", @"\{(?<levels>" + JsonSpace + "(?:" + TrackField + "(?:," +
                JsonSpace + TrackField + ")*)?)" + @"\}") + "," +
            IntegerField("nextRunId") + "," + IntegerField("lastFinalizedRunId") + "," +
            JsonField("pendingDefeat", @"(?:null|\{" + IntegerField("runId") + "," +
                IntegerField("elapsedTicks") + "," + IntegerField("kills") + "," + IntegerField("reward") + @"\})") +
            @"\}" + JsonSpace + @"\z", RegexOptions.CultureInvariant);
        private static readonly Regex TrackValuePattern = new Regex("\"(?<key>[A-Za-z]+)\"" +
            JsonSpace + ":" + JsonSpace + "(?<level>" + JsonInteger + ")", RegexOptions.CultureInvariant);

        private sealed class Record
        {
            public int Wallet;
            public int[] Levels = new int[LastStandUpgradeCatalog.Tracks.Count];
            public int Level
            {
                get => Levels[(int)LastStandUpgradeTrackId.CannonAttack];
                set => Levels[(int)LastStandUpgradeTrackId.CannonAttack] = value;
            }
            public int NextRunId;
            public int FinalizedRunId;
            public PendingDefeat Pending;
            public Record Copy() => new Record { Wallet = Wallet, Levels = (int[])Levels.Clone(),
                NextRunId = NextRunId, FinalizedRunId = FinalizedRunId, Pending = Pending };
        }

        private readonly ILastStandStorage storage;
        private Record committed;
        // Original storage bytes, including v1 schema/whitespace, are the
        // conflict basis until the staged v2 candidate is confirmed.
        private string committedRaw;
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

        public int GetPermanentLevel(LastStandUpgradeTrackId id)
        {
            var definition = LastStandUpgradeCatalog.Get(id);
            return committed == null ? 0 : committed.Levels[(int)definition.Id];
        }

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
                bool requiresMigration;
                if (!TryParse(value, out parsed, out requiresMigration))
                {
                    SaveState = "blocked";
                    SaveError = "Saved Last Stand data is invalid or unsupported. Repair it before retrying.";
                    return false;
                }
                committed = parsed;
                committedRaw = value;
                if (requiresMigration) return Commit(parsed.Copy(), null);
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

        public bool TryPurchase() => TryPurchase(LastStandUpgradeTrackId.CannonAttack);

        public bool TryPurchase(LastStandUpgradeTrackId id)
        {
            int index = (int)id;
            if (index < 0 || index >= LastStandUpgradeCatalog.Tracks.Count) return false;
            if (!Ready || activeRunId != 0 || committed.Pending != null || committed.Levels[index] == MaximumLevel)
                return false;
            int cost = committed.Levels[index] + 1;
            if (committed.Wallet < cost) return false;
            var next = committed.Copy();
            next.Wallet -= cost;
            next.Levels[index]++;
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
                    if (committed != null && existing != committedRaw ||
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
                committedRaw = desired;
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
            var levels = new StringBuilder();
            foreach (var track in LastStandUpgradeCatalog.Tracks)
            {
                if (levels.Length != 0) levels.Append(',');
                levels.Append('"').Append(track.Key).Append("\":")
                    .Append(record.Levels[(int)track.Id].ToString(CultureInfo.InvariantCulture));
            }
            return "{\"version\":2,\"credits\":" + record.Wallet +
                ",\"permanentLevels\":{" + levels + "}" +
                ",\"nextRunId\":" + record.NextRunId +
                ",\"lastFinalizedRunId\":" + record.FinalizedRunId +
                ",\"pendingDefeat\":" + pendingJson + "}";
        }

        private static bool TryParse(string json, out Record record, out bool requiresMigration)
        {
            record = null;
            requiresMigration = false;
            if (json == null || json.Length > 2048) return false;
            var match = SavePattern.Match(json);
            var values = new int[10];
            var levels = new int[LastStandUpgradeCatalog.Tracks.Count];
            if (match.Success)
            {
                for (var i = 1; i <= 9; i++)
                {
                    if (match.Groups[i].Success && !TryInteger(match.Groups[i].Value, out values[i]))
                        return false;
                }
                if (values[1] != 1 || values[3] > MaximumLevel) return false;
                levels[(int)LastStandUpgradeTrackId.CannonAttack] = values[3];
                requiresMigration = true;
            }
            else
            {
                match = V2SavePattern.Match(json);
                if (!match.Success) return false;
                string[] names = { "", "version", "credits", "", "nextRunId", "lastFinalizedRunId",
                    "runId", "elapsedTicks", "kills", "reward" };
                for (var i = 1; i <= 9; i++)
                {
                    if (i != 3 && match.Groups[names[i]].Success && !TryInteger(match.Groups[names[i]].Value, out values[i]))
                        return false;
                }
                if (values[1] != 2) return false;
                var seen = new bool[levels.Length];
                var tracks = TrackValuePattern.Matches(match.Groups["levels"].Value);
                if (tracks.Count != levels.Length) return false;
                foreach (Match track in tracks)
                {
                    LastStandUpgradeDefinition definition;
                    int level;
                    if (!LastStandUpgradeCatalog.TryGet(track.Groups["key"].Value, out definition) ||
                        seen[(int)definition.Id] || !TryInteger(track.Groups["level"].Value, out level) || level > MaximumLevel)
                        return false;
                    seen[(int)definition.Id] = true;
                    levels[(int)definition.Id] = level;
                }
            }
            if (values[4] < 1 || values[5] >= values[4]) return false;
            PendingDefeat pending = null;
            if (requiresMigration ? match.Groups[6].Success : match.Groups["runId"].Success)
            {
                if (values[6] < 1 || values[6] != values[4] - 1 || values[6] <= values[5] || values[9] != 1)
                    return false;
                pending = new PendingDefeat(values[6], values[7], values[8]);
            }
            record = new Record { Wallet = values[2], Levels = levels, NextRunId = values[4],
                FinalizedRunId = values[5], Pending = pending };
            return true;
        }

        private static bool TryInteger(string value, out int number) =>
            int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out number);
    }
}
