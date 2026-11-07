using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace SingedTerra.LastStand
{
    // Strict historical schemas. These checks intentionally use historical bounds.
    public sealed partial class LastStandProgression
    {
        private const int MaximumLevel = 3;
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
            JsonField("tierRecords", @"\{" + JsonField(LastStandTierCatalog.LegacyProfileVersion, @"\{" +
                IntegerField("bestTicks1") + "," + IntegerField("bestKills1") + "," +
                IntegerField("bestTicks2") + "," + IntegerField("bestKills2") + "," +
                BooleanField("tierTwoUnlocked") + @"\}") + @"\}") + "," +
            JsonField("pendingDefeat", @"(?:null|\{" + IntegerField("runId") + "," +
                IntegerField("elapsedTicks") + "," + IntegerField("kills") + "," + IntegerField("reward") + "," +
                IntegerField("tier") + "," + JsonField("profileVersion", "\"(?<profileVersion>[a-zA-Z0-9-]*)\"") + "," +
                BooleanField("isLimit") + "," + BooleanField("newBestTime") + "," +
                BooleanField("newBestKills") + "," + BooleanField("unlockedTierTwo") + @"\})") +
            @"\}" + JsonSpace + @"\z", RegexOptions.CultureInvariant);

        private static bool TryParseLegacyVersions(string json, out Record record, out bool requiresMigration)
        {
            record = null;
            requiresMigration = true;
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
            if (version != 3 || nextRun < 1 || finalized >= nextRun || selectedTier<1 || selectedTier>2)
                return false;
            int[] levels;
            if (!TryParseLevels(match.Groups["levels"].Value, out levels)) return false;
            int[] ticks = { Value(match, "bestTicks1"), Value(match, "bestTicks2") };
            int[] kills = { Value(match, "bestKills1"), Value(match, "bestKills2") };
            bool unlocked = Flag(match, "tierTwoUnlocked");
            if (ticks[0] > LastStandTierCatalog.LegacyHorizonTicks || ticks[1] > LastStandTierCatalog.LegacyHorizonTicks ||
                unlocked != (ticks[0] >= 1200) ||
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
                    if (tier<1 || tier>2 || profile != LastStandTierCatalog.LegacyProfileVersion ||
                        selectedTier != tier || tier == 2 && !unlocked || elapsed > LastStandTierCatalog.LegacyHorizonTicks ||
                        reward != (limit ? 0 : 1) || limit && elapsed != LastStandTierCatalog.LegacyHorizonTicks) return false;
                    int index = tier - 1;
                    if (ticks[index] < elapsed || kills[index] < disabled ||
                        bestTime && (ticks[index] != elapsed || elapsed == 0) ||
                        bestKills && (kills[index] != disabled || disabled == 0) ||
                        justUnlocked && (tier != 1 || !unlocked || !bestTime || elapsed < 1200)) return false;
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
            if (tracks.Count != 6) return false;
            foreach (Match track in tracks)
            {
                LastStandUpgradeDefinition definition;
                int level;
                if (!LastStandUpgradeCatalog.ForEconomy(LastStandUpgradeCatalog.LegacyEconomyVersion).TryGet(track.Groups["key"].Value, out definition) ||
                    (int)definition.Id >= 6 || seen[(int)definition.Id] || !TryInteger(track.Groups["level"].Value, out level) || level > MaximumLevel)
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
                if (tracks.Count != 6) return false;
                foreach (Match track in tracks)
                {
                    LastStandUpgradeDefinition definition;
                    int level;
                    if (!LastStandUpgradeCatalog.ForEconomy(LastStandUpgradeCatalog.LegacyEconomyVersion).TryGet(track.Groups["key"].Value, out definition) ||
                        (int)definition.Id >= 6 || seen[(int)definition.Id] || !TryInteger(track.Groups["level"].Value, out level) || level > MaximumLevel)
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
