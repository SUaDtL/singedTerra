using System;
using System.Reflection;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

static class SpeedChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    static void Check(bool value, string claim) { if (!value) throw new Exception("ASSERT " + claim); }
    static void Near(double value, double expected, string claim) =>
        Check(Math.Abs(value - expected) < 1e-7, claim + ": " + value + " != " + expected);
    static void Field(object owner, string name, object value) => owner.GetType().GetField(name, Private).SetValue(owner, value);
    static void Invoke(object owner, string name, params object[] args) => owner.GetType().GetMethod(name, Private).Invoke(owner, args);
    // Missing feature methods are an explicit assertion failure against the
    // compiling baseline, never a replacement implementation of scheduling.
    static bool Change(object owner, string name, params object[] args) =>
        (bool?)owner.GetType().GetMethod(name)?.Invoke(owner, args) ?? false;
    static double Number(object owner, string name) =>
        (double?)owner.GetType().GetProperty(name)?.GetValue(owner) ?? double.NaN;
    static bool Flag(object owner, string name) =>
        (bool?)owner.GetType().GetProperty(name)?.GetValue(owner) ?? false;
    static EncounterSession Session(bool launcher = false, bool playable = true)
    {
        var session = new EncounterSession();
        Field(session, "art", new SingedTerra.Art.TankPresentation { showingLauncher = launcher });
        if (playable) Field(session, "loop", new LastStandLoopController());
        typeof(EncounterSession).GetProperty("View").SetValue(session, new EncounterView());
        if(playable)
        {
            var shop=new LastStandShopState(1,launcher?LastStandFitting.Launcher:LastStandFitting.Repair,
                new int[LastStandUpgradeCatalog.Tracks.Count]);
            // This scheduler fixture assumes an accepted boundary. Faults and
            // durable writes belong to the actual controller integration suite.
            session.WaveCleared+=model=>{shop.ObserveAuthoritativeKills(model.Kills);session.ContinueCommittedWave();};
            UnityEngine.Time.realtimeSinceStartupAsDouble=0;
            session.DeployReservedRun(shop);
        }
        else session.DeployAt(0);
        return session;
    }
    static void Drain(EncounterSession session, double now)
    {
        int callbacks = 0;
        do
        {
            session.AdvanceAt(now);
            Check(session.StepsThisCallback <= 128, "per-callback step budget");
            Check(++callbacks < 10000, "debt drainage terminates");
        } while (session.CatchingUp);
    }
    static EncounterModel Reference(int ticks, bool launcher = false)
    {
        var model = new EncounterModel(launcher, EncounterProfile.ForTier(1), EncounterModel.CannonDamage);
        while (model.Tick < ticks && model.Status == EncounterStatus.Running)
        {model.Step();if(model.AwaitingWaveCommit && model.Status==EncounterStatus.Running)model.ContinueAfterCheckpoint();}
        return model;
    }
    static void HalfSpeed()
    {
        foreach (bool launcher in new[] { false, true })
        foreach (double wall in new[] { .049, .1, 1.0, 10.0, 80.0, 200.0 })
        {
            var session = Session(launcher);
            Check(Change(session, "TrySetSpeedAt", 0.0, .5), "half speed accepted at action boundary");
            Drain(session, wall);
            var expected = Reference((int)Math.Floor(wall * 10 + 1e-8), launcher);
            Check(session.Model.Snapshot() == expected.Snapshot(), "weighted half-speed time preserves full combat state");
            var partitioned = Session(launcher);
            Check(Change(partitioned, "TrySetSpeedAt", 0.0, .5), "partitioned half speed accepted");
            for (int i = 1; i <= Math.Ceiling(wall / .017); i++) partitioned.AdvanceAt(Math.Min(wall, i * .017));
            Check(partitioned.Model.Snapshot() == expected.Snapshot(), "callback partitions preserve weighted combat state");
        }
    }
    static void RateBoundary()
    {
        var session = Session();
        Check(Change(session, "TrySetSpeedAt", .049, .5), "change reconciles .049 seconds at old rate");
        Check(session.Model.Tick == 0, "old fraction below one tick");
        session.AdvanceAt(.051);
        Check(session.Model.Tick == 1, "old fraction not rescaled when new half speed completes tick");
        Check(Change(session, "TrySetSpeedAt", .1, 1.0), "second boundary preserves half-speed fraction");
        session.AdvanceAt(.1255);
        Check(session.Model.Tick == 2, "weighted fraction crosses exact second tick");
        string before = session.Model.Snapshot(); session.AdvanceAt(.1255);
        Check(session.Model.Snapshot() == before, "duplicate timestamp does not repeat combat");
        var delayed = Session(); delayed.AdvanceAt(10);
        Check(delayed.CatchingUp && delayed.Model.Tick == 128, "retained debt remains after budget");
        Check(!Change(delayed, "TrySetSpeedAt", 10.0, .5), "speed change refused during catch-up");
        Check(!Change(delayed, "TrySetMenuPausedAt", 10.0, true), "menu pause refused during catch-up");
        delayed.TogglePauseAt(10);
        Check(!delayed.Paused && delayed.Model.Tick == 128, "blocked controls never claim paused or drain extra ticks");
        Drain(delayed, 10);
        Check(delayed.Model.Snapshot() == Reference(200).Snapshot(), "old debt remains at original rate");
        Check(Change(delayed, "TrySetSpeedAt", 10.0, .5), "speed change after complete reconciliation");
        Drain(delayed, 11);
        Check(delayed.Model.Snapshot() == Reference(210).Snapshot(), "new elapsed alone uses new rate");
    }
    static void Holds()
    {
        var session = Session();
        Check(Change(session, "TrySetSpeedAt", 0.0, .5), "select half speed");
        session.TogglePauseAt(1);
        Check(session.Paused && session.Model.Tick == 10, "manual pause reconciles old speed");
        Check(Change(session, "TrySetMenuPausedAt", 2.0, true), "menu adds independent hold");
        session.TogglePauseAt(3);
        Check(session.Paused && Flag(session, "MenuPaused") && !Flag(session, "ManualPaused"), "manual resume cannot remove menu hold");
        Near(Number(session, "LastPositiveSpeed"), .5, "resume remembers positive speed");
        session.AdvanceAt(30); Check(session.Model.Tick == 10, "combined holds exclude all paused wall time");
        Check(Change(session, "TrySetMenuPausedAt", 30.0, false), "menu closes");
        Check(!session.Paused, "closing final hold resumes");
        session.AdvanceAt(30.1); Check(session.Model.Tick == 11, "resume uses last half speed");
        session.TogglePauseAt(30.1);
        Check(Change(session, "TrySetMenuPausedAt", 31.0, true), "menu opens on manual pause");
        Check(Change(session, "TrySetMenuPausedAt", 32.0, false) && session.Paused, "closing menu preserves prior manual pause");
        Check(Change(session, "TrySetSpeedAt", 33.0, 1.0), "select positive resumes manual pause");
        Check(Change(session, "TrySetSpeedAt", 34.0, 0.0), "zero is manual pause");
        Near(Number(session, "LastPositiveSpeed"), 1, "zero preserves positive selection");
        Check(Change(session, "TrySetSpeedAt", 35.0, .5), "plus from zero selects half speed");
        Near(Number(session, "SelectedSpeed"), .5, "plus differs from remembered one speed");
        session.TogglePauseAt(35); session.TogglePauseAt(40);
        Near(Number(session, "SelectedSpeed"), .5, "resume restores new last-positive selection");
    }
    static void Cap()
    {
        var session = Session();
        foreach (double invalid in new[] { -.5, .25, .75, 1.5, 5, double.NaN, double.PositiveInfinity })
            Check(!Change(session, "TrySetSpeedAt", 0.0, invalid), "production policy rejects unsupported rate " + invalid);
        Near(Number(session, "MaximumSpeed"), 1, "production cap one cannot be raised by preference");
        Check(Change(session, "TrySetSpeedAt", 0.0, .5), "valid half speed remains available after refusal");
        session.AdvanceAt(1); Check(session.Model.Tick == 10 && session.Failure == "", "invalid rate does not poison valid session");
        Check(!Change(session, "TrySetSpeedAt", double.NaN, 1.0) && session.Failure != "", "invalid timestamp still fails closed");
        Check(session.Model.Tick == 10, "invalid timestamp admits no tick");
        Near(Number(session, "EffectiveSpeed"), 0, "technical failure reports no effective simulation speed");
        var undeployed = new EncounterSession();
        Check(Change(undeployed, "ConfigureSpeed", 5.0), "loaded preference sanitized before deployment");
        Near(Number(undeployed, "LastPositiveSpeed"), 1, "future preference never unlocks production speed");
    }
    static void Future()
    {
        var constructor = typeof(LastStandRunClock).GetConstructor(new[] { typeof(double), typeof(int), typeof(double), typeof(double) });
        Check(constructor != null, "isolated future-cap policy fixture available");
        foreach (double rate in new[] { .5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5 })
        {
            var clock = (LastStandRunClock)constructor.Invoke(new object[] { 0.0, 400, rate, 5.0 });
            int ticks = 0;
            Check(clock.Observe(.1), "future valid elapsed");
            while (clock.TryTakeStep()) ticks++;
            Check(ticks == (int)(rate * 2), "future fixture uses exact half-step scaling");
            do
            {
                Check(clock.Observe(double.MaxValue), "large finite elapsed bounded");
                while (clock.TryTakeStep()) ticks++;
                Check(clock.StepsThisCallback <= 128 && !double.IsInfinity(clock.PendingSeconds), "finite horizon and budget");
            } while (clock.CatchingUp);
            Check(ticks == 400 && clock.AtHorizon && !clock.TryTakeStep(), "horizon admits exactly once");
        }
    }
    static void Terminal()
    {
        foreach (bool launcher in new[] { false, true })
        {
            var reference = Reference(24000, launcher);
            Check(reference.Status != EncounterStatus.Running, "reference reaches terminal");
            double terminalWall = reference.Tick * .1;
            var session = Session(launcher);
            Check(Change(session, "TrySetSpeedAt", 0.0, .5), "terminal fixture half speed");
            Drain(session, terminalWall + .2);
            Check(session.Model.Snapshot() == reference.Snapshot(), "same terminal state at half speed");
            Near(session.TerminalElapsedSeconds, .2, "terminal residual uses wall seconds, not simulated seconds");
            session.TogglePauseAt(terminalWall + .2);
            session.AdvanceAt(terminalWall + 5);
            Near(session.TerminalElapsedSeconds, .2, "manual pause holds terminal settling");
            session.TogglePauseAt(terminalWall + 5);
            session.AdvanceAt(terminalWall + 5.1);
            Near(session.TerminalElapsedSeconds, .3, "resumed terminal cosmetics age at wall rate");
            string terminal = session.Model.Snapshot();
            Drain(session, terminalWall + 20);
            Check(session.Model.Snapshot() == terminal, "terminal model never steps again");
            Near(session.TerminalElapsedSeconds, .48, "settling remains bounded");
        }
    }
    static void Legacy()
    {
        var session = Session();
        Check(Change(session, "TrySetSpeedAt", 0.0, .5), "background fixture half speed");
        Invoke(session, "OnApplicationFocus", false); Invoke(session, "OnApplicationPause", true);
        Drain(session, 10);
        Check(session.Model.Snapshot() == Reference(100).Snapshot() && !session.Paused, "background weighted simulation continues");
        Invoke(session, "OnApplicationPause", false); Invoke(session, "OnApplicationFocus", true);
        Check(!session.Paused, "focus return cannot invent pause");
        var legacy = Session(playable: false);
        Check(!Change(legacy, "TrySetSpeedAt", 0.0, .5), "legacy scene rejects Last Stand speed controls");
        Check(!Change(legacy, "TrySetMenuPausedAt", 0.0, true), "legacy pause owner unchanged");
        Invoke(legacy, "OnApplicationFocus", false);
        Check(legacy.Paused && legacy.Reason == "focus", "legacy focus suspension preserved");
        Invoke(legacy, "OnApplicationFocus", true); legacy.TogglePauseAt(10);
        Check(!legacy.Paused, "legacy manual resume retained");
    }
    public static int Main(string[] args)
    {
        try
        {
            switch (args[0])
            {
                case "half_speed_weighted_combat_parity": HalfSpeed(); break;
                case "rate_boundary_fraction_and_retained_debt": RateBoundary(); break;
                case "pause_holds_resume_and_plus_from_zero": Holds(); break;
                case "production_cap_and_invalid_rates": Cap(); break;
                case "future_policy_fixture_and_horizon": Future(); break;
                case "terminal_settling_uses_wall_seconds": Terminal(); break;
                case "focus_background_and_legacy_preserved": Legacy(); break;
                default: throw new Exception("Unknown check");
            }
            Console.WriteLine("PASS " + args[0]); return 0;
        }
        catch (Exception exception) { Console.Error.WriteLine(exception.ToString()); return 1; }
    }
}

// Presentation-only scaffolding. Combat, the shop projection and scheduling are
// compiled from production; no tests launch an Editor or recreate model logic.
namespace UnityEngine
{
    public class Object { public static implicit operator bool(Object value) => value != null; }
    public class Transform { public void SetParent(Transform parent, bool worldPositionStays) { } }
    public class MonoBehaviour : Object
    {
        public Transform transform = new Transform();
        public GameObject gameObject = new GameObject();
        public T GetComponent<T>() where T : class => null;
        public void Destroy(Object value) { }
    }
    public class GameObject : Object
    {
        public GameObject(string name = "") { }
        public T AddComponent<T>() where T : new() => new T();
    }
    public class Canvas : Object { }
    public class Font : Object { }
    public static class Time { public static float unscaledDeltaTime; public static double realtimeSinceStartupAsDouble; }
    public static class Application { public static bool isFocused = true; }
    public static class Debug { public static void Log(string value) { } public static void LogError(string value) { } }
    public static class JsonUtility { public static string ToJson(object value) => ""; }
}
namespace UnityEngine.UI { }
namespace SingedTerra.Art
{
    public class TankPresentation : UnityEngine.MonoBehaviour
    {
        public bool showingLauncher;
        public string FittingId=>showingLauncher?"launcher":"repair";
        public bool EncounterActive;
        public bool BeginEncounter() { EncounterActive = true; return true; }
        public void EndEncounter() { EncounterActive = false; }
        public void SetEncounterPaused(bool paused) { }
        public void AdvanceTerminalShot(float elapsed) { }
    }
    public class ArtHud : UnityEngine.Object { }
}
namespace SingedTerra.VisualReview
{
    public class BattlefieldReview : UnityEngine.Object
    {
        public EncounterSession Session;
        public void Report(string value) { }
    }
}
namespace SingedTerra.LastStand
{
    public class CompileOnlyProgression { public int CannonDamage => EncounterModel.CannonDamage; public int ActiveTier => 1; }
    public class LastStandLoopController : UnityEngine.Object { public CompileOnlyProgression Progression = new CompileOnlyProgression(); }
}
namespace SingedTerra.Encounter
{
    public class EncounterView : UnityEngine.MonoBehaviour
    {
        public bool FullEffects => false;
        public int VisibleUnits => 0;
        public int PoolSize => 0;
        public void Initialize(SingedTerra.Art.TankPresentation art) { }
        public void Clear() { }
        public void Render(EncounterModel model) { }
        public void Advance(float seconds) { }
        public void Present(EncounterModel model) { }
        public void ToggleEffects() { }
    }
    public class EncounterHud
    {
        public void Initialize(EncounterSession session, SingedTerra.Art.ArtHud hud, UnityEngine.Canvas canvas, UnityEngine.Font font) { }
    }
}
