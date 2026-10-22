using System;
using System.Collections.Generic;
using SingedTerra.LastStand;

// Only platform persistence is substituted. Values, parser, state owner and
// storage adapters below are the actual shipped source files.
namespace UnityEngine
{
    public static class PlayerPrefs
    {
        public static readonly Dictionary<string, string> Data = new Dictionary<string, string>();
        public static bool HasKey(string key) => Data.ContainsKey(key);
        public static string GetString(string key) => Data[key];
        public static void SetString(string key, string value) { Data[key] = value; }
        public static void Save() { }
    }
}

namespace SingedTerra.LastStand
{
    // LastStandStore references this constant only; gameplay parsing is not
    // substituted and claimed tested by this preference-specific harness.
    public static class LastStandProgression
    {
        public const string StorageKey = "singedTerra.lastStand.prototype.v1";
    }
}

internal static class PreferencesChecks
{
    private sealed class Storage : ILastStandStorage
    {
        public string Value;
        public bool DenyRead, DenyWrite, ThrowAfterWrite, BreakReadback;
        public int Writes;
        public string Read()
        {
            if (DenyRead) throw new InvalidOperationException("denied");
            return Value;
        }
        public void Write(string value)
        {
            Writes++;
            if (DenyWrite) throw new InvalidOperationException("denied");
            Value = BreakReadback ? "external-write" : value;
            if (ThrowAfterWrite) throw new InvalidOperationException("uncertain");
        }
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
    private static void Reject(Action action, string name)
    {
        try { action(); }
        catch (ArgumentOutOfRangeException) { return; }
        throw new Exception("Accepted invalid " + name);
    }
    private static string Encoded(LastStandPreferenceValues values)
    {
        var storage = new Storage();
        Check(LastStandPreferences.Load(storage).Apply(values), "fixture persist");
        return storage.Value;
    }
    private static LastStandPreferenceValues Customized() => LastStandPreferenceValues.Defaults.With(
        masterVolume: 70, effectsVolume: 30, musicVolume: 15, muted: true,
        musicEnabled: false, reducedEffects: true, quality: LastStandQuality.Performance,
        tutorialTips: false, purchaseSuggestions: false, lastPositiveSpeed: .5);

    private static void DefaultsAndImmutableCopy()
    {
        var storage = new Storage();
        var manager = LastStandPreferences.Load(storage);
        var values = manager.Current;
        Check(values.MasterVolume == 100 && values.EffectsVolume == 100 && values.MusicVolume == 20,
            "volume defaults");
        Check(!values.Muted && values.MusicEnabled && !values.ReducedEffects &&
            values.Quality == LastStandQuality.Current && values.TutorialTips &&
            values.PurchaseSuggestions && values.LastPositiveSpeed == 1, "behavior defaults");
        Check(storage.Writes == 0 && manager.SaveState == "ready", "load missing must not write");
        var changed = values.With(masterVolume: 10, tutorialTips: false);
        Check(values.MasterVolume == 100 && values.TutorialTips && changed.MasterVolume == 10 &&
            !changed.TutorialTips && changed.MusicVolume == 20, "copy must not mutate old snapshot");
    }
    private static void RoundtripAllPreferences()
    {
        var storage = new Storage();
        var manager = LastStandPreferences.Load(storage);
        Check(manager.Apply(Customized()), "persist customized");
        var loaded = LastStandPreferences.Load(storage);
        var p = loaded.Current;
        Check(p.MasterVolume == 70 && p.EffectsVolume == 30 && p.MusicVolume == 15 && p.Muted &&
            !p.MusicEnabled && p.ReducedEffects && p.Quality == LastStandQuality.Performance &&
            !p.TutorialTips && !p.PurchaseSuggestions && p.LastPositiveSpeed == .5, "all fields roundtrip");
        Check(loaded.SaveState == "ready" && !loaded.CanRetry && !loaded.RequiresReset, "saved state");
        Check(storage.Value.IndexOf("paused", StringComparison.OrdinalIgnoreCase) < 0 &&
            storage.Value.IndexOf("fullscreen", StringComparison.OrdinalIgnoreCase) < 0, "ephemeral exclusions");
    }
    private static void StrictTypesBoundsAndVersions()
    {
        Reject(() => LastStandPreferenceValues.Defaults.With(masterVolume: -1), "negative volume");
        Reject(() => LastStandPreferenceValues.Defaults.With(effectsVolume: 101), "oversized volume");
        Reject(() => LastStandPreferenceValues.Defaults.With(musicVolume: int.MaxValue), "huge volume");
        foreach (double speed in new[] { 0, -.5, .25, 1.1, 5.5, double.NaN, double.PositiveInfinity })
            Reject(() => LastStandPreferenceValues.Defaults.With(lastPositiveSpeed: speed), "speed");
        Reject(() => LastStandPreferenceValues.Defaults.With(quality: (LastStandQuality)7), "quality");
        string raw = Encoded(LastStandPreferenceValues.Defaults);
        var invalid = new[] {
            raw.Replace("\"version\":1", "\"version\":2"),
            raw.Replace("\"version\":1", "\"version\":0"),
            raw.Replace("\"masterVolume\":100", "\"masterVolume\":100.1"),
            raw.Replace("\"effectsVolume\":100", "\"effectsVolume\":101"),
            raw.Replace("\"musicVolume\":20", "\"musicVolume\":-1"),
            raw.Replace("\"muted\":false", "\"muted\":\"false\""),
            raw.Replace("\"tutorialTips\":true", "\"tutorialTips\":null"),
            raw.Replace("\"lastPositiveSpeed\":1", "\"lastPositiveSpeed\":NaN"),
            raw.Replace("\"lastPositiveSpeed\":1", "\"lastPositiveSpeed\":1e999"),
            raw.Replace("\"lastPositiveSpeed\":1", "\"lastPositiveSpeed\":0.25"),
            raw.Replace("\"quality\":\"current\"", "\"quality\":\"ultra\""),
            raw.Replace("\"musicEnabled\":true,", ""),
            raw.Replace("{", "{\"version\":1,"), raw.TrimEnd('}') + ",\"newSetting\":1}",
            raw + " trailing", "[]", new string(' ', 4096) + raw
        };
        foreach (string value in invalid)
        {
            var storage = new Storage { Value = value };
            var manager = LastStandPreferences.Load(storage);
            Check(manager.RequiresReset && manager.SaveState == "blocked", "invalid record accepted: " + value);
            Check(storage.Value == value && storage.Writes == 0, "invalid record changed during load");
        }
        Check(LastStandPreferenceValues.Defaults.With(lastPositiveSpeed: 5).LastPositiveSpeed == 5,
            "preference can represent future cap but does not grant it");
    }
    private static void DeniedWriteAppliesSessionAndRetry()
    {
        var storage = new Storage { DenyWrite = true };
        var manager = LastStandPreferences.Load(storage);
        Check(!manager.Apply(Customized()) && manager.Current.Muted && !manager.Current.TutorialTips,
            "denied save still applies session choice");
        Check(manager.SaveState == "not-saved" && manager.CanRetry && !manager.RequiresReset, "honest save state");
        storage.DenyWrite = false;
        Check(manager.Retry() && manager.SaveState == "ready", "retry saves session choice");
        Check(!LastStandPreferences.Load(storage).Current.TutorialTips, "retry reload");
    }
    private static void UncertainWriteAndLaterEdits()
    {
        var storage = new Storage { ThrowAfterWrite = true };
        var manager = LastStandPreferences.Load(storage);
        Check(!manager.Apply(Customized()), "uncertain save is not success");
        storage.ThrowAfterWrite = false;
        Check(manager.Retry() && storage.Writes == 1, "readback recovers without repeating write");
        storage.ThrowAfterWrite = true;
        Check(!manager.Apply(manager.Current.With(masterVolume: 80)), "second uncertain save");
        storage.ThrowAfterWrite = false;
        Check(manager.Apply(manager.Current.With(masterVolume: 90)), "new edit recognizes own prior attempt");
        Check(LastStandPreferences.Load(storage).Current.MasterVolume == 90, "latest choice persists");
    }
    private static void ProtectedRecordsNeedConfirmedReset()
    {
        foreach (string original in new[] { "broken", "{\"version\":9,\"future\":true}" })
        {
            var storage = new Storage { Value = original };
            var manager = LastStandPreferences.Load(storage);
            bool applied = manager.Apply(Customized());
            Check(storage.Value == original && storage.Writes == 0, "protected preference record was overwritten");
            Check(!applied && manager.Current.Muted, "protected record permits session choice");
            Check(!manager.Retry() && !manager.ResetDefaults(false), "no unconfirmed replacement");
            Check(storage.Value == original && storage.Writes == 0, "protected original survives");
            Check(manager.ResetDefaults(true), "confirmed defaults replace preferences only");
            Check(!manager.Current.Muted && manager.Current.MusicVolume == 20 && !manager.RequiresReset,
                "default state restored");
        }
    }
    private static void CrossTabConflictDoesNotOverwrite()
    {
        var storage = new Storage { Value = Encoded(LastStandPreferenceValues.Defaults) };
        var first = LastStandPreferences.Load(storage);
        var second = LastStandPreferences.Load(storage);
        Check(second.Apply(second.Current.With(masterVolume: 40)), "other tab saves");
        string external = storage.Value;
        bool applied = first.Apply(first.Current.With(musicVolume: 60));
        Check(storage.Value == external, "external preference record was overwritten");
        Check(!applied, "stale tab must refuse overwrite");
        Check(first.Current.MusicVolume == 60 && first.RequiresReset && !first.CanRetry, "session retains unsaved edit");
        Check(!first.Retry() && storage.Value == external, "retry preserves other tab");
    }
    private static void ReadFailureCannotOverwriteUnseenSettings()
    {
        var storage = new Storage { Value = Encoded(Customized()), DenyRead = true };
        var manager = LastStandPreferences.Load(storage);
        Check(manager.SaveState == "not-saved" && manager.CanRetry, "initial denied read state");
        storage.DenyRead = false;
        Check(manager.Retry() && manager.Current.Muted, "retry before edits reloads existing values");
        storage.DenyRead = true;
        manager = LastStandPreferences.Load(storage);
        Check(!manager.Apply(LastStandPreferenceValues.Defaults.With(masterVolume: 50)), "read denied edit remains local");
        string original = storage.Value;
        storage.DenyRead = false;
        Check(!manager.Retry() && manager.RequiresReset && storage.Value == original, "unseen value is protected");
    }
    private static void ReadbackMismatchIsNotSaved()
    {
        var storage = new Storage { BreakReadback = true };
        var manager = LastStandPreferences.Load(storage);
        Check(!manager.Apply(Customized()) && manager.SaveState != "ready", "readback mismatch cannot claim saved");
        Check(!manager.Retry() && manager.RequiresReset && storage.Value == "external-write", "never overwrite mismatch");
    }
    private static void StoreIsolatesGameplayKey()
    {
        UnityEngine.PlayerPrefs.Data.Clear();
        UnityEngine.PlayerPrefs.Data[LastStandProgression.StorageKey] = "gameplay-wallet-and-pending-claim";
        var adapter = new LastStandPreferencesStore();
        adapter.Write("preference-key-probe");
        Check(UnityEngine.PlayerPrefs.Data[LastStandProgression.StorageKey] == "gameplay-wallet-and-pending-claim",
            "preference adapter touched gameplay key");
        UnityEngine.PlayerPrefs.Data.Remove(LastStandPreferences.StorageKey);
        var manager = LastStandPreferences.Load(adapter);
        Check(manager.Apply(Customized()), "adapter persists");
        Check(manager.ResetDefaults(true), "adapter reset persists");
        Check(LastStandPreferences.StorageKey == "singedTerra.lastStand.preferences.v1", "explicit preference key");
        Check(UnityEngine.PlayerPrefs.Data.Count == 2 &&
            UnityEngine.PlayerPrefs.Data[LastStandProgression.StorageKey] == "gameplay-wallet-and-pending-claim",
            "preferences touched gameplay data");
    }
    public static int Main(string[] args)
    {
        try
        {
            switch (args[0])
            {
                case "defaults_and_immutable_copy": DefaultsAndImmutableCopy(); break;
                case "roundtrip_all_preferences": RoundtripAllPreferences(); break;
                case "strict_types_bounds_and_versions": StrictTypesBoundsAndVersions(); break;
                case "denied_write_applies_session_and_retry": DeniedWriteAppliesSessionAndRetry(); break;
                case "uncertain_write_and_later_edits": UncertainWriteAndLaterEdits(); break;
                case "protected_records_need_confirmed_reset": ProtectedRecordsNeedConfirmedReset(); break;
                case "cross_tab_conflict_does_not_overwrite": CrossTabConflictDoesNotOverwrite(); break;
                case "read_failure_cannot_overwrite_unseen_settings": ReadFailureCannotOverwriteUnseenSettings(); break;
                case "readback_mismatch_is_not_saved": ReadbackMismatchIsNotSaved(); break;
                case "store_isolates_gameplay_key": StoreIsolatesGameplayKey(); break;
                default: throw new Exception("Unknown case " + args[0]);
            }
            Console.WriteLine("PASS " + args[0]); return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }
}
