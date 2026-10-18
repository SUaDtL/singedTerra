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
        public int Reward { get; }
        // Tier zero is a migrated pre-goal result. It remains claimable without
        // pretending its old simulation was admitted under the new rules.
        public int Tier { get; }
        public string ProfileVersion { get; }
        public bool IsLimit { get; }
        public bool NewBestTime { get; }
        public bool NewBestKills { get; }
        public bool UnlockedTierTwo { get; }
        public PendingDefeat(int runId, int elapsedTicks, int kills)
            : this(runId, elapsedTicks, kills, 1, 0, "", false, false, false, false) { }
        internal PendingDefeat(int runId, int elapsedTicks, int kills, int reward,
            int tier, string profile, bool isLimit, bool bestTime, bool bestKills, bool unlocked)
        {
            RunId = runId; ElapsedTicks = elapsedTicks; Kills = kills; Reward = reward;
            Tier = tier; ProfileVersion = profile; IsLimit = isLimit;
            NewBestTime = bestTime; NewBestKills = bestKills; UnlockedTierTwo = unlocked;
        }
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
        private static string BooleanField(string name) => JsonField(name, "(?<" + name + ">true|false)");
        private static readonly Regex V3SavePattern = new Regex(@"\A" + JsonSpace + @"\{" +
            IntegerField("version") + "," + IntegerField("credits") + "," +
            JsonField("permanentLevels", @"\{(?<levels>" + JsonSpace + "(?:" + TrackField + "(?:," +
                JsonSpace + TrackField + ")*)?)" + @"\}") + "," +
            IntegerField("nextRunId") + "," + IntegerField("lastFinalizedRunId") + "," +
            IntegerField("selectedTier") + "," +
            JsonField("tierRecords", @"\{" + JsonField(LastStandTierCatalog.ProfileVersion, @"\{" +
                IntegerField("bestTicks1") + "," + IntegerField("bestKills1") + "," +
                IntegerField("bestTicks2") + "," + IntegerField("bestKills2") + "," +
                BooleanField("tierTwoUnlocked") + @"\}") + @"\}") + "," +
            JsonField("pendingDefeat", @"(?:null|\{" + IntegerField("runId") + "," +
                IntegerField("elapsedTicks") + "," + IntegerField("kills") + "," + IntegerField("reward") + "," +
                IntegerField("tier") + "," + JsonField("profileVersion", "\"(?<profileVersion>[a-zA-Z0-9-]*)\"") + "," +
                BooleanField("isLimit") + "," + BooleanField("newBestTime") + "," +
                BooleanField("newBestKills") + "," + BooleanField("unlockedTierTwo") + @"\})") +
            @"\}" + JsonSpace + @"\z", RegexOptions.CultureInvariant);

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
            public int SelectedTier = 1;
            public int[] BestTicks = new int[2];
            public int[] BestKills = new int[2];
            public bool TierTwoUnlocked;
            public Record Copy() => new Record { Wallet = Wallet, Levels = (int[])Levels.Clone(),
                NextRunId = NextRunId, FinalizedRunId = FinalizedRunId, Pending = Pending,
                SelectedTier = SelectedTier, BestTicks = (int[])BestTicks.Clone(),
                BestKills = (int[])BestKills.Clone(), TierTwoUnlocked = TierTwoUnlocked };
        }

        private readonly ILastStandStorage storage;
        private Record committed;
        // Original storage bytes, including v1 schema/whitespace, are the
        // conflict basis until the staged v3 candidate is confirmed.
        private string committedRaw;
        private Record candidate;
        private Action afterCommit;
        private int activeRunId;
        private int activeDamage;
        private int activeTier;
        private string activeProfileVersion;

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
        public int SelectedTier => committed == null ? 1 : committed.SelectedTier;
        public int ActiveTier => activeTier;
        public string ActiveProfileVersion => activeProfileVersion;
        public bool TierTwoUnlocked => committed != null && committed.TierTwoUnlocked;
        public string SaveState { get; private set; }
        public string SaveError { get; private set; }

        public int GetBestTicks(int tier) => committed != null && LastStandTierCatalog.IsValid(tier)
            ? committed.BestTicks[tier - 1] : 0;
        public int GetBestKills(int tier) => committed != null && LastStandTierCatalog.IsValid(tier)
            ? committed.BestKills[tier - 1] : 0;

        public bool TrySelectTier(int tier)
        {
            if (!Ready || activeRunId != 0 || committed.Pending != null || !LastStandTierCatalog.IsValid(tier) ||
                tier == 2 && !committed.TierTwoUnlocked) return false;
            if (tier == committed.SelectedTier) return true;
            var next = committed.Copy();
            next.SelectedTier = tier;
            return Commit(next, null);
        }

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
            if (!Ready || activeRunId != 0 || committed.Pending != null || committed.NextRunId == int.MaxValue ||
                !LastStandTierCatalog.IsValid(committed.SelectedTier) || committed.SelectedTier == 2 && !committed.TierTwoUnlocked)
                return false;
            var runId = committed.NextRunId;
            var next = committed.Copy();
            next.NextRunId++;
            return Commit(next, () => {
                activeRunId = runId; activeDamage = 20 + 10 * next.Level;
                activeTier = next.SelectedTier; activeProfileVersion = LastStandTierCatalog.ProfileVersion;
            });
        }

        public bool TryStageDefeat(int elapsedTicks, int kills)
            => TryStageTerminal(elapsedTicks, kills, false);

        public bool TryStageLimit(int elapsedTicks, int kills)
            => TryStageTerminal(elapsedTicks, kills, true);

        private bool TryStageTerminal(int elapsedTicks, int kills, bool isLimit)
        {
            if (!Ready || activeRunId == 0 || elapsedTicks < 0 || elapsedTicks > LastStandTierCatalog.HorizonTicks ||
                kills < 0 || committed.Pending != null || !LastStandTierCatalog.IsValid(activeTier) ||
                activeProfileVersion != LastStandTierCatalog.ProfileVersion ||
                isLimit && elapsedTicks != LastStandTierCatalog.HorizonTicks)
                return false;
            var next = committed.Copy();
            int index = activeTier - 1;
            bool bestTime = elapsedTicks > next.BestTicks[index], bestKills = kills > next.BestKills[index];
            bool unlocked = activeTier == 1 && !next.TierTwoUnlocked &&
                elapsedTicks >= LastStandTierCatalog.Get(activeTier).GoalTicks;
            if (bestTime) next.BestTicks[index] = elapsedTicks;
            if (bestKills) next.BestKills[index] = kills;
            next.TierTwoUnlocked |= unlocked;
            next.Pending = new PendingDefeat(activeRunId, elapsedTicks, kills, isLimit ? 0 : 1,
                activeTier, activeProfileVersion, isLimit, bestTime, bestKills, unlocked);
            return Commit(next, ClearActiveRun);
        }

        public bool TryStageNonDefeat()
        {
            AbandonRun();
            return false;
        }

        public void AbandonRun()
        {
            if (candidate != null) return;
            ClearActiveRun();
        }

        private void ClearActiveRun()
        {
            activeRunId = 0;
            activeDamage = 0;
            activeTier = 0;
            activeProfileVersion = null;
        }

        public bool TryClaim()
        {
            if (!Ready || activeRunId != 0 || committed.Pending == null ||
                committed.Pending.Reward > int.MaxValue - committed.Wallet)
                return false;
            var next = committed.Copy();
            next.Wallet += next.Pending.Reward;
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
                ",\"reward\":" + pending.Reward + ",\"tier\":" + pending.Tier +
                ",\"profileVersion\":\"" + pending.ProfileVersion + "\",\"isLimit\":" + JsonBoolean(pending.IsLimit) +
                ",\"newBestTime\":" + JsonBoolean(pending.NewBestTime) +
                ",\"newBestKills\":" + JsonBoolean(pending.NewBestKills) +
                ",\"unlockedTierTwo\":" + JsonBoolean(pending.UnlockedTierTwo) + "}";
            var levels = new StringBuilder();
            foreach (var track in LastStandUpgradeCatalog.Tracks)
            {
                if (levels.Length != 0) levels.Append(',');
                levels.Append('"').Append(track.Key).Append("\":")
                    .Append(record.Levels[(int)track.Id].ToString(CultureInfo.InvariantCulture));
            }
            return "{\"version\":3,\"credits\":" + record.Wallet +
                ",\"permanentLevels\":{" + levels + "}" +
                ",\"nextRunId\":" + record.NextRunId +
                ",\"lastFinalizedRunId\":" + record.FinalizedRunId +
                ",\"selectedTier\":" + record.SelectedTier +
                ",\"tierRecords\":{\"" + LastStandTierCatalog.ProfileVersion + "\":{" +
                "\"bestTicks1\":" + record.BestTicks[0] + ",\"bestKills1\":" + record.BestKills[0] +
                ",\"bestTicks2\":" + record.BestTicks[1] + ",\"bestKills2\":" + record.BestKills[1] +
                ",\"tierTwoUnlocked\":" + JsonBoolean(record.TierTwoUnlocked) + "}}" +
                ",\"pendingDefeat\":" + pendingJson + "}";
        }

        private static string JsonBoolean(bool value) => value ? "true" : "false";

        private static bool TryParse(string json, out Record record, out bool requiresMigration)
        {
            record = null;
            requiresMigration = false;
            if (json == null || json.Length > 4096) return false;
            var match = V3SavePattern.Match(json);
            if (!match.Success)
            {
                // Strict legacy parsing cannot credit records or unlocks. Preserve
                // its exact original bytes as Retry's conflict basis.
                bool legacyV1;
                if (!TryParseLegacy(json, out record, out legacyV1)) return false;
                requiresMigration = true;
                return true;
            }
            string[] integerNames = { "version", "credits", "nextRunId", "lastFinalizedRunId", "selectedTier",
                "bestTicks1", "bestKills1", "bestTicks2", "bestKills2", "runId", "elapsedTicks", "kills", "reward", "tier" };
            foreach (string name in integerNames)
            {
                int ignored;
                if (match.Groups[name].Success && !TryInteger(match.Groups[name].Value, out ignored)) return false;
            }
            int version = Value(match, "version"), nextRun = Value(match, "nextRunId");
            int finalized = Value(match, "lastFinalizedRunId"), selectedTier = Value(match, "selectedTier");
            if (version != 3 || nextRun < 1 || finalized >= nextRun || !LastStandTierCatalog.IsValid(selectedTier))
                return false;
            int[] levels;
            if (!TryParseLevels(match.Groups["levels"].Value, out levels)) return false;
            int[] ticks = { Value(match, "bestTicks1"), Value(match, "bestTicks2") };
            int[] kills = { Value(match, "bestKills1"), Value(match, "bestKills2") };
            bool unlocked = Flag(match, "tierTwoUnlocked");
            if (ticks[0] > LastStandTierCatalog.HorizonTicks || ticks[1] > LastStandTierCatalog.HorizonTicks ||
                unlocked != (ticks[0] >= LastStandTierCatalog.Get(1).GoalTicks) ||
                !unlocked && (selectedTier != 1 || ticks[1] != 0 || kills[1] != 0)) return false;
            PendingDefeat pending = null;
            if (match.Groups["runId"].Success)
            {
                int run = Value(match, "runId"), elapsed = Value(match, "elapsedTicks"),
                    disabled = Value(match, "kills"), reward = Value(match, "reward"), tier = Value(match, "tier");
                string profile = match.Groups["profileVersion"].Value;
                bool limit = Flag(match, "isLimit"), bestTime = Flag(match, "newBestTime"),
                    bestKills = Flag(match, "newBestKills"), justUnlocked = Flag(match, "unlockedTierTwo");
                if (run < 1 || run != nextRun - 1 || run <= finalized) return false;
                if (tier == 0)
                {
                    if (profile != "" || reward != 1 || limit || bestTime || bestKills || justUnlocked) return false;
                }
                else
                {
                    if (!LastStandTierCatalog.IsValid(tier) || profile != LastStandTierCatalog.ProfileVersion ||
                        selectedTier != tier || tier == 2 && !unlocked || elapsed > LastStandTierCatalog.HorizonTicks ||
                        reward != (limit ? 0 : 1) || limit && elapsed != LastStandTierCatalog.HorizonTicks) return false;
                    int index = tier - 1;
                    if (ticks[index] < elapsed || kills[index] < disabled ||
                        bestTime && (ticks[index] != elapsed || elapsed == 0) ||
                        bestKills && (kills[index] != disabled || disabled == 0) ||
                        justUnlocked && (tier != 1 || !unlocked || !bestTime || elapsed < LastStandTierCatalog.Get(1).GoalTicks)) return false;
                }
                pending = new PendingDefeat(run, elapsed, disabled, reward, tier, profile, limit,
                    bestTime, bestKills, justUnlocked);
            }
            record = new Record { Wallet = Value(match, "credits"), Levels = levels, NextRunId = nextRun,
                FinalizedRunId = finalized, SelectedTier = selectedTier, BestTicks = ticks, BestKills = kills,
                TierTwoUnlocked = unlocked, Pending = pending };
            return true;
        }

        private static int Value(Match match, string name) => int.Parse(match.Groups[name].Value, CultureInfo.InvariantCulture);
        private static bool Flag(Match match, string name) => match.Groups[name].Value == "true";

        private static bool TryParseLevels(string source, out int[] levels)
        {
            levels = new int[LastStandUpgradeCatalog.Tracks.Count];
            var seen = new bool[levels.Length];
            var tracks = TrackValuePattern.Matches(source);
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
            return true;
        }

        private static bool TryParseLegacy(string json, out Record record, out bool requiresMigration)
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
