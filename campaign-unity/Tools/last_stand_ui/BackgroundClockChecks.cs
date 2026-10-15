using System;
using System.Reflection;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Behavioral oracle is shared unchanged by explicit baseline RED and candidate GREEN.
// The candidate compiles the production clock, EncounterModel and EncounterProfile.
static class BackgroundClockChecks
{
    const double StepSeconds = .05;

    static void Check(bool condition, string claim)
    {
        if (!condition) throw new Exception("ASSERT " + claim);
    }

    static void Near(double actual, double expected, string claim)
    {
        Check(Math.Abs(actual - expected) < 1e-8, claim + ": " + actual + " != " + expected);
    }

    sealed class Run
    {
#if ST_CLOCK_BASELINE
        readonly EncounterSession session;
        double anchor;
        static readonly MethodInfo Update = typeof(EncounterSession).GetMethod("Update", BindingFlags.Instance | BindingFlags.NonPublic);
        public EncounterModel Model => session.Model;
        public bool Failed => session.Failure != "";
        public bool Paused => session.Paused;
        public bool Stopped => Model.Status != EncounterStatus.Running;
        public double PendingSeconds => (double)typeof(EncounterSession).GetField("accumulated", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(session);
        public bool CatchingUp => PendingSeconds + 1e-9 >= StepSeconds && !Stopped;
        public int StepsThisCallback { get; private set; }
        public Run(bool launcher = false, int damage = 20)
        {
            session = new EncounterSession();
            var fields = BindingFlags.Instance | BindingFlags.NonPublic;
            typeof(EncounterSession).GetField("art", fields).SetValue(session,
                new SingedTerra.Art.TankPresentation { showingLauncher = launcher });
            typeof(EncounterSession).GetField("loop", fields).SetValue(session,
                new LastStandLoopController { Progression = new CompileOnlyProgression { CannonDamage = damage } });
            typeof(EncounterSession).GetProperty("View").SetValue(session, new EncounterView());
            session.Deploy();
        }
        public bool Advance(double now)
        {
            int before = Model.Tick;
            UnityEngine.Time.unscaledDeltaTime = (float)(now - anchor);
            anchor = now;
            Update.Invoke(session, null);
            StepsThisCallback = Model.Tick - before;
            return !Failed;
        }
        public void Pause(double now) { session.TogglePause(); anchor = now; }
        public void Resume(double now) { session.TogglePause(); anchor = now; }
#else
        public EncounterModel Model { get; }
        public LastStandRunClock Clock { get; }
        public bool Failed => Clock.Failed;
        public bool Paused => Clock.Paused;
        public bool Stopped => Clock.Stopped;
        public double PendingSeconds => Clock.PendingSeconds;
        public bool CatchingUp => Clock.CatchingUp;
        public int StepsThisCallback => Clock.StepsThisCallback;
        public Run(bool launcher = false, int damage = 20)
        {
            Model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype, damage);
            Clock = new LastStandRunClock(0, Model.Profile.Horizon);
        }
        public bool Advance(double now)
        {
            if (!Clock.Observe(now)) return false;
            while (Model.Status == EncounterStatus.Running && Clock.TryTakeStep()) Model.Step();
            if (Model.Status != EncounterStatus.Running) Clock.Stop();
            return true;
        }
        public void Pause(double now)
        {
            // The action first reconciles active time, then sets the player's pause.
            // T-02 must gate this action while more than one callback of debt remains.
            Check(Advance(now) && !CatchingUp, "pause action boundary must be reconciled");
            Check(Clock.Pause(now), "valid pause boundary");
        }
        public void Resume(double now) { Check(Clock.Resume(now), "valid resume boundary"); }
#endif
    }

    static EncounterModel Reference(double elapsed, bool launcher = false, int damage = 20)
    {
        var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype, damage);
        int ticks = (int)Math.Min(model.Profile.Horizon, Math.Floor(elapsed * EncounterModel.TicksPerSecond + 1e-9));
        for (int i = 0; i < ticks && model.Status == EncounterStatus.Running; i++) model.Step();
        return model;
    }

    static void Drain(Run run, double now)
    {
        int callbacks = 0;
        while (run.CatchingUp)
        {
            Check(++callbacks <= EncounterProfile.PlayablePrototype.Horizon, "debt drainage terminates");
            Check(run.Advance(now), "valid repeated callback");
            Check(run.StepsThisCallback <= 128, "128 step admission per callback");
        }
    }

    static void PartitionEquivalence()
    {
        foreach (double duration in new[] { 0, .049, .05, 1, 10, 200 })
        foreach (bool launcher in new[] { false, true })
        foreach (int damage in new[] { 20, 30, 40, 50 })
        {
            var expected = Reference(duration, launcher, damage);
            var delayed = new Run(launcher, damage);
            Check(delayed.Advance(duration), "valid delayed callback");
            Drain(delayed, duration);
            Check(delayed.Model.Snapshot() == expected.Snapshot(), "partition equivalence at " + duration + " seconds");
            var regular = new Run(launcher, damage);
            int callbacks = (int)Math.Ceiling(duration / StepSeconds);
            for (int i = 1; i <= callbacks; i++)
            {
                double now = Math.Min(duration, i * StepSeconds);
                Check(regular.Advance(now), "valid regular callback");
                Check(regular.StepsThisCallback <= 128, "regular callback admission budget");
            }
            Drain(regular, duration);
            Check(regular.Model.Snapshot() == expected.Snapshot(), "regular partition matches full committed model state");
            Check(!delayed.Paused, "long valid callback never auto-pauses");
        }
    }

    static void FractionalCarry()
    {
        var run = new Run();
        Check(run.Advance(0) && run.Model.Tick == 0, "zero elapsed admits no tick");
        Check(run.Advance(.049) && run.Model.Tick == 0, ".049 remains fractional");
        Near(run.PendingSeconds, .049, "fractional debt retained");
        Check(run.Advance(.05) && run.Model.Tick == 1, ".05 admits exactly one tick");
        string first = run.Model.Snapshot();
        Check(run.Advance(.05) && run.Model.Snapshot() == first, "duplicate timestamp cannot repeat model time");
        Check(run.Advance(.075) && run.Model.Tick == 1, "half-step carried");
        run.Pause(.099);
        Near(run.PendingSeconds, .049, "pause boundary preserves fractional carry");
        string paused = run.Model.Snapshot();
        Check(run.Advance(10.099) && run.Model.Snapshot() == paused, "paused callback excludes ten seconds");
        run.Resume(10.099);
        Check(run.Advance(10.1) && run.Model.Tick == 2, "post-resume fraction completes only the pre-pause tick");
        string second = run.Model.Snapshot();
        for (int i = 0; i < 4; i++)
            Check(run.Advance(10.1) && run.Model.Snapshot() == second, "repeated timestamp is idempotent");
    }

    static void BudgetRetainsDebt()
    {
        var run = new Run();
        Check(run.Advance(10) && run.Model.Tick == 128, "ten-second callback admits exactly bounded 128 ticks");
        Check(run.CatchingUp, "unreconciled debt remains visible to caller controls");
        Near(run.PendingSeconds, 3.6, "over-budget debt retained");
        Check(run.Advance(10) && run.Model.Tick == 200, "duplicate callback drains retained debt without new elapsed");
        Check(!run.CatchingUp, "catch-up indicator clears after drainage");
        Near(run.PendingSeconds, 0, "all ten active seconds accounted");
        Check(run.Model.Snapshot() == Reference(10).Snapshot(), "budget drainage preserves full model state");
        Check(run.Advance(200), "large active interval admitted without pause");
        Drain(run, 200);
        Check(run.Model.Snapshot() == Reference(200).Snapshot(), "terminal state matches unchanged model");
        Check(run.Model.Status == EncounterStatus.Defeated && run.Stopped, "real defeat stops combat clock");
        Check(run.PendingSeconds >= .48, "terminal retains elapsed for existing settling interval");
        string terminal = run.Model.Snapshot();
        Check(run.Advance(201) && run.StepsThisCallback == 0 && run.Model.Snapshot() == terminal,
            "terminal elapsed cannot admit another combat tick");
#if !ST_CLOCK_BASELINE
        Check(!run.Clock.TryTakeStep(), "terminal residual elapsed never admits a combat step after Stop");
        Check(run.Clock.StepsThisCallback == 0, "stopped clock admission remains zero");
        // Exercise the pure horizon admission boundary independently of a defeat.
        // The real model still executes; no replacement model is supplied.
        int horizon = EncounterProfile.PlayablePrototype.Horizon;
        var clock = new LastStandRunClock(0, horizon);
        var model = new EncounterModel(false, EncounterProfile.PlayablePrototype);
        int admitted = 0;
        do
        {
            Check(clock.Observe(double.MaxValue), "large finite timestamp is bounded");
            Check(clock.PendingSeconds <= (horizon - admitted) * StepSeconds + 1e-8, "debt bounded by existing horizon");
            while (clock.TryTakeStep()) { model.Step(); admitted++; }
            Check(clock.StepsThisCallback <= 128, "horizon callbacks remain bounded");
        } while (clock.CatchingUp);
        Check(admitted == horizon && clock.AtHorizon, "horizon exhausted exactly once");
        Check(!clock.TryTakeStep() && clock.Observe(double.MaxValue) && !clock.TryTakeStep(), "no post-horizon admission");
        Near(clock.PendingSeconds, 0, "no debt beyond existing horizon");
#endif
    }

    static void PauseExcludesElapsed()
    {
        var run = new Run();
        for (int i = 1; i <= 20; i++) Check(run.Advance(i * StepSeconds), "regular active time before Pause");
        Check(run.Model.Tick == 20, "one active second before Pause");
        run.Pause(1.049);
        Check(run.Paused, "explicit Pause chosen");
        string paused = run.Model.Snapshot();
        Check(run.Advance(11.049) && run.Paused && run.Model.Snapshot() == paused, "ten paused seconds preserve ticks hull kills and state");
        run.Resume(11.049);
        Check(!run.Paused, "only explicit Resume clears pause");
        Check(run.Advance(11.05) && run.Model.Tick == 21, "Resume anchor excludes paused interval and keeps boundary fraction");
        Check(run.Model.Snapshot() == Reference(1.05).Snapshot(), "Pause/Resume equals admitted active duration");
        run.Pause(11.1);
        Check(run.Model.Tick == 22, "pause action accounts active elapsed since last callback");
        paused = run.Model.Snapshot();
        Check(run.Advance(211.1) && run.Model.Snapshot() == paused, "long paused interval cannot reach terminal");
        run.Resume(211.1);
        Check(run.Advance(211.1) && run.Model.Snapshot() == paused, "resume duplicate anchor admits no elapsed");
        var noPausedCallback = new Run();
        Check(noPausedCallback.Advance(.049) && noPausedCallback.Model.Tick == 0, "pre-pause fraction without a complete tick");
        noPausedCallback.Pause(.049);
        // No hidden/paused callback occurs between these two action boundaries.
        noPausedCallback.Resume(10.049);
        Check(noPausedCallback.Advance(10.05) && noPausedCallback.Model.Snapshot() == Reference(.05).Snapshot(),
            "Resume itself anchors after ten seconds without a paused callback");
        Near(noPausedCallback.PendingSeconds, 0, "Resume preserves only pre-pause fraction and new active time");
        paused = noPausedCallback.Model.Snapshot();
        Check(noPausedCallback.Advance(10.05) && noPausedCallback.Model.Snapshot() == paused,
            "no-callback Resume anchor cannot admit duplicate elapsed");
    }

    static void InvalidClock()
    {
        foreach (double timestamp in new[] { -1, double.NaN, double.PositiveInfinity, double.NegativeInfinity, .999 })
        {
            var run = new Run();
            Check(run.Advance(1), "valid time before invalid callback");
            string before = run.Model.Snapshot();
            Check(!run.Advance(timestamp) && run.Failed, "invalid/backward clock rejected: " + timestamp);
            Check(run.Model.Snapshot() == before, "invalid input admits no reward-bearing model time");
            Near(run.PendingSeconds, 0, "failed clock releases no outstanding time");
            Check(!run.Advance(20) && run.Failed && run.Model.Snapshot() == before, "technical failure stays closed after valid input");
        }
#if !ST_CLOCK_BASELINE
        foreach (double start in new[] { -1, double.NaN, double.PositiveInfinity, double.NegativeInfinity })
        {
            var clock = new LastStandRunClock(start, EncounterProfile.PlayablePrototype.Horizon);
            Check(clock.Failed && !clock.Observe(10) && !clock.TryTakeStep(), "invalid start clock admits no ticks");
        }
        var paused = new LastStandRunClock(1, EncounterProfile.PlayablePrototype.Horizon);
        Check(paused.Pause(1) && !paused.Resume(.5) && paused.Failed && !paused.TryTakeStep(), "backward Resume fails closed");
        var boundary = new LastStandRunClock(1, EncounterProfile.PlayablePrototype.Horizon);
        Check(!boundary.Pause(double.NaN) && boundary.Failed && !boundary.TryTakeStep(), "invalid Pause fails closed");
#endif
    }

    public static int Main(string[] args)
    {
        try
        {
            switch (args[0])
            {
                case "clock_partition_equivalence": PartitionEquivalence(); break;
                case "fractional_carry_and_duplicate_callbacks": FractionalCarry(); break;
                case "budget_retains_debt": BudgetRetainsDebt(); break;
                case "pause_excludes_elapsed_time": PauseExcludesElapsed(); break;
                case "invalid_clock_is_rejected": InvalidClock(); break;
                default: throw new Exception("Unknown check");
            }
            Console.WriteLine("PASS " + args[0]);
            return 0;
        }
        catch (Exception failure) { Console.Error.WriteLine(failure.Message); return 1; }
    }
}

#if ST_CLOCK_BASELINE
// Compile-only Unity/presentation scaffolding lets RED invoke the actual existing
// EncounterSession.Update. Nothing below simulates combat or scheduling. Candidate
// builds omit this entire branch and compile the real pure clock/model/profile.
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
    public static class Time { public static float unscaledDeltaTime; }
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
    public class CompileOnlyProgression { public int CannonDamage; }
    public class LastStandLoopController : UnityEngine.Object { public CompileOnlyProgression Progression; }
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
#endif
