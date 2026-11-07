using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace SingedTerra.LastStand
{
    public enum LastStandQuality { Current, Performance }

    // Settings are local presentation choices, never progression or speed-unlock
    // authority. Active pause and fullscreen deliberately have no saved fields.
    public sealed class LastStandPreferenceValues
    {
        public int MasterVolume { get; }
        public int EffectsVolume { get; }
        public int MusicVolume { get; }
        public bool Muted { get; }
        public bool MusicEnabled { get; }
        public bool ReducedEffects { get; }
        public LastStandQuality Quality { get; }
        public bool TutorialTips { get; }
        public bool PurchaseSuggestions { get; }
        public double LastPositiveSpeed { get; }
        public string PinnedGoal { get; }
        public static LastStandPreferenceValues Defaults { get; } = new LastStandPreferenceValues(
            100, 100, 20, false, true, false, LastStandQuality.Current, true, true, 1);

        private LastStandPreferenceValues(int masterVolume, int effectsVolume, int musicVolume,
            bool muted, bool musicEnabled, bool reducedEffects, LastStandQuality quality,
            bool tutorialTips, bool purchaseSuggestions, double lastPositiveSpeed, string pinnedGoal = "")
        {
            ValidateVolume(masterVolume, nameof(masterVolume));
            ValidateVolume(effectsVolume, nameof(effectsVolume));
            ValidateVolume(musicVolume, nameof(musicVolume));
            if (quality != LastStandQuality.Current && quality != LastStandQuality.Performance)
                throw new ArgumentOutOfRangeException(nameof(quality));
            if (double.IsNaN(lastPositiveSpeed) || double.IsInfinity(lastPositiveSpeed) ||
                lastPositiveSpeed < .5 || lastPositiveSpeed > 5 || lastPositiveSpeed * 2 % 1 != 0)
                throw new ArgumentOutOfRangeException(nameof(lastPositiveSpeed));
            if (pinnedGoal == null || !Regex.IsMatch(pinnedGoal, @"\A[A-Za-z0-9:_-]{0,100}\z", RegexOptions.CultureInvariant))
                throw new ArgumentOutOfRangeException(nameof(pinnedGoal));
            MasterVolume = masterVolume; EffectsVolume = effectsVolume; MusicVolume = musicVolume;
            Muted = muted; MusicEnabled = musicEnabled; ReducedEffects = reducedEffects; Quality = quality;
            TutorialTips = tutorialTips; PurchaseSuggestions = purchaseSuggestions;
            LastPositiveSpeed = lastPositiveSpeed;
            PinnedGoal = pinnedGoal;
        }

        private static void ValidateVolume(int value, string name)
        {
            if (value < 0 || value > 100) throw new ArgumentOutOfRangeException(name);
        }

        public LastStandPreferenceValues With(int? masterVolume = null, int? effectsVolume = null,
            int? musicVolume = null, bool? muted = null, bool? musicEnabled = null,
            bool? reducedEffects = null, LastStandQuality? quality = null, bool? tutorialTips = null,
            bool? purchaseSuggestions = null, double? lastPositiveSpeed = null, string pinnedGoal = null) =>
            new LastStandPreferenceValues(masterVolume ?? MasterVolume, effectsVolume ?? EffectsVolume,
                musicVolume ?? MusicVolume, muted ?? Muted, musicEnabled ?? MusicEnabled,
                reducedEffects ?? ReducedEffects, quality ?? Quality, tutorialTips ?? TutorialTips,
                purchaseSuggestions ?? PurchaseSuggestions, lastPositiveSpeed ?? LastPositiveSpeed, pinnedGoal ?? PinnedGoal);
    }

    public sealed class LastStandPreferences
    {
        public const string StorageKey = "singedTerra.lastStand.preferences.v1";
        private const int MaximumRecordLength = 2048;
        private const string Space = @"[\x20\t\r\n]*";
        private const string Integer = @"(?:0|[1-9][0-9]*)";
        private static string Field(string name, string pattern) => Space + "\"" + name + "\"" +
            Space + ":" + Space + "(?<" + name + ">" + pattern + ")" + Space;
        // Exact schema: unknown, repeated, missing and incorrectly typed fields
        // are protected rather than silently normalized or written over.
        private static readonly Regex Pattern = new Regex(@"\A" + Space + @"\{" +
            Field("version", "1") + "," + Field("masterVolume", Integer) + "," +
            Field("effectsVolume", Integer) + "," + Field("musicVolume", Integer) + "," +
            Field("muted", "true|false") + "," + Field("musicEnabled", "true|false") + "," +
            Field("reducedEffects", "true|false") + "," + Field("quality", "\"(?:current|performance)\"") + "," +
            Field("tutorialTips", "true|false") + "," + Field("purchaseSuggestions", "true|false") + "," +
            Field("lastPositiveSpeed", Integer + @"(?:\.[0-9]+)?") +
            "(?:," + Field("pinnedGoal", "\"[A-Za-z0-9:_-]{0,100}\"") + ")?" + @"\}" + Space + @"\z",
            RegexOptions.CultureInvariant);

        private readonly ILastStandStorage storage;
        private string basis;
        private string attempted;
        private bool basisKnown;
        private bool pending;
        public LastStandPreferenceValues Current { get; private set; } = LastStandPreferenceValues.Defaults;
        public string SaveState { get; private set; } = "not-saved";
        public string Status { get; private set; } = "Settings not saved.";
        public bool RequiresReset { get; private set; }
        public bool CanRetry => SaveState == "not-saved" && !RequiresReset;

        private LastStandPreferences(ILastStandStorage storage)
        {
            this.storage = storage ?? throw new ArgumentNullException(nameof(storage));
        }

        public static LastStandPreferences Load(ILastStandStorage storage)
        {
            var preferences = new LastStandPreferences(storage);
            preferences.LoadCurrent();
            return preferences;
        }

        private bool LoadCurrent()
        {
            try
            {
                string raw = storage.Read();
                if (raw == null)
                {
                    Current = LastStandPreferenceValues.Defaults;
                    Saved(null, "Default settings. Changes save on this device.");
                    return true;
                }
                LastStandPreferenceValues parsed;
                if (!TryParse(raw, out parsed))
                    return Protect("Saved settings are invalid or from a newer version. Changes apply this session only. Restore settings defaults to replace them.");
                Current = parsed;
                Saved(raw, "Settings saved on this device.");
                return true;
            }
            catch (Exception)
            {
                return NotSaved("Settings could not be read. Session settings remain available. Retry to read them again.");
            }
        }

        // A failed persistence attempt does not roll back the player's current
        // volume, accessibility or guidance choice.
        public bool Apply(LastStandPreferenceValues values)
        {
            Current = values ?? throw new ArgumentNullException(nameof(values));
            pending = true;
            return Persist();
        }

        public bool Retry()
        {
            if (RequiresReset) return false;
            return pending ? Persist() : LoadCurrent();
        }

        // Only the confirmed Settings reset flow may replace an unsupported or
        // externally changed preference record. It cannot reach gameplay data.
        public bool ResetDefaults(bool confirmed = false)
        {
            if (!confirmed) return false;
            Current = LastStandPreferenceValues.Defaults;
            pending = true;
            try
            {
                basis = storage.Read();
                basisKnown = true;
                attempted = null;
                RequiresReset = false;
                return Persist();
            }
            catch (Exception)
            {
                // A denied read cannot establish which saved record the player
                // is replacing. A later ordinary retry must not assume a basis.
                basisKnown = false;
                RequiresReset = false;
                return NotSaved("Default settings apply this session. The saved settings could not be read or replaced.");
            }
        }

        private bool Persist()
        {
            if (RequiresReset) return false;
            string desired = Serialize(Current);
            try
            {
                string observed = storage.Read();
                // Also recovers an uncertain prior write without another write.
                if (observed == desired)
                {
                    Saved(observed, "Settings saved on this device.");
                    return true;
                }
                bool isOwnAttempt = attempted != null && observed == attempted;
                if (!isOwnAttempt && (basisKnown ? observed != basis : observed != null))
                    return Protect("Settings changed elsewhere or could not be safely loaded. Your changes apply this session only. Reload to use saved settings, or restore settings defaults.");
                // Synchronous optimistic conflict check plus exact readback,
                // matching the existing local-save boundary. localStorage does
                // not provide an atomic transaction spanning multiple tabs.
                attempted = desired;
                storage.Write(desired);
                if (storage.Read() != desired)
                    return Protect("Settings changed while saving. Your changes apply this session only. Reload to use saved settings, or restore settings defaults.");
                Saved(desired, "Settings saved on this device.");
                return true;
            }
            catch (Exception)
            {
                return NotSaved("Settings not saved. Changes apply this session only; retry when device storage is available.");
            }
        }

        private void Saved(string raw, string status)
        {
            basis = raw; basisKnown = true; attempted = null; pending = false;
            RequiresReset = false; SaveState = "ready"; Status = status;
        }
        private bool NotSaved(string status)
        {
            SaveState = "not-saved"; Status = status;
            return false;
        }
        private bool Protect(string status)
        {
            RequiresReset = true; SaveState = "blocked"; Status = status;
            return false;
        }

        private static string Boolean(bool value) => value ? "true" : "false";
        private static string Serialize(LastStandPreferenceValues values) =>
            "{\"version\":1,\"masterVolume\":" + values.MasterVolume.ToString(CultureInfo.InvariantCulture) +
            ",\"effectsVolume\":" + values.EffectsVolume.ToString(CultureInfo.InvariantCulture) +
            ",\"musicVolume\":" + values.MusicVolume.ToString(CultureInfo.InvariantCulture) +
            ",\"muted\":" + Boolean(values.Muted) + ",\"musicEnabled\":" + Boolean(values.MusicEnabled) +
            ",\"reducedEffects\":" + Boolean(values.ReducedEffects) + ",\"quality\":\"" +
            (values.Quality == LastStandQuality.Current ? "current" : "performance") +
            "\",\"tutorialTips\":" + Boolean(values.TutorialTips) +
            ",\"purchaseSuggestions\":" + Boolean(values.PurchaseSuggestions) +
            ",\"lastPositiveSpeed\":" + values.LastPositiveSpeed.ToString("0.0#", CultureInfo.InvariantCulture).TrimEnd('0').TrimEnd('.') +
            (values.PinnedGoal.Length == 0 ? "" : ",\"pinnedGoal\":\"" + values.PinnedGoal + "\"") + "}";

        private static bool TryParse(string raw, out LastStandPreferenceValues values)
        {
            values = null;
            if (raw == null || raw.Length > MaximumRecordLength) return false;
            var match = Pattern.Match(raw);
            if (!match.Success) return false;
            int master, effects, music;
            double speed;
            if (!int.TryParse(match.Groups["masterVolume"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out master) ||
                !int.TryParse(match.Groups["effectsVolume"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out effects) ||
                !int.TryParse(match.Groups["musicVolume"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out music) ||
                !double.TryParse(match.Groups["lastPositiveSpeed"].Value, NumberStyles.AllowDecimalPoint,
                    CultureInfo.InvariantCulture, out speed)) return false;
            try
            {
                values = LastStandPreferenceValues.Defaults.With(masterVolume: master, effectsVolume: effects,
                    musicVolume: music, muted: match.Groups["muted"].Value == "true",
                    musicEnabled: match.Groups["musicEnabled"].Value == "true",
                    reducedEffects: match.Groups["reducedEffects"].Value == "true",
                    quality: match.Groups["quality"].Value == "\"performance\"" ? LastStandQuality.Performance : LastStandQuality.Current,
                    tutorialTips: match.Groups["tutorialTips"].Value == "true",
                    purchaseSuggestions: match.Groups["purchaseSuggestions"].Value == "true", lastPositiveSpeed: speed,
                    pinnedGoal: match.Groups["pinnedGoal"].Success ? match.Groups["pinnedGoal"].Value.Trim('"') : "");
                return true;
            }
            catch (ArgumentOutOfRangeException) { return false; }
        }
    }
}
