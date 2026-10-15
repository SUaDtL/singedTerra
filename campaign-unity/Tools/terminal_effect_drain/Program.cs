using System;
using System.Reflection;
using SingedTerra.Encounter;

// Run: powershell -File campaign-unity/Tools/terminal_effect_drain/run.ps1 -EditorRoot <Unity 6000.3.24f1 root>
// Exercises the real session and model without opening Unity or changing scene assets.
internal static class Program
{
    static void Main()
    {
        Check(false, "False|Defeated|1557|0|49|28|68|0|33|17");
        Check(true, "True|Defeated|1647|0|53|33|59|55|0|11");
        CheckTerminalGuards();
        Console.WriteLine("Terminal effect drain checks passed");
    }

    static void CheckTerminalGuards()
    {
        var model = new EncounterModel(false, EncounterProfile.VisualReview);
        while (model.Status == EncounterStatus.Running) model.Step();
        var view = new EncounterView { EffectLifetime = .18f };
        var session = new EncounterSession();
        typeof(EncounterSession).GetField("model", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(session, model);
        typeof(EncounterSession).GetProperty(nameof(EncounterSession.View)).SetValue(session, view);
        typeof(EncounterSession).GetField("art", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(session, new SingedTerra.Art.TankPresentation());
        UnityEngine.Time.unscaledDeltaTime = .05f;

        typeof(EncounterSession).GetField("focused", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(session, false);
        Update(session);
        Require(view.AdvanceCalls == 0 && view.EffectLifetime == .18f,
            "terminal effects must hold while unfocused");

        typeof(EncounterSession).GetField("focused", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(session, true);
        typeof(EncounterSession).GetField("applicationPaused", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(session, true);
        Update(session);
        Require(view.AdvanceCalls == 0 && view.EffectLifetime == .18f,
            "terminal effects must hold while application-paused");

        typeof(EncounterSession).GetField("applicationPaused", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(session, false);
        view.ThrowOnAdvance = true;
        Update(session);
        Require(session.Failure == nameof(InvalidOperationException) && session.Paused &&
            session.Reason == "technical-failure", "terminal effect failure must use session failure path");
        Require(view.AdvanceCalls == 1, "terminal effect failure attempted one advance");
        Update(session);
        Require(view.AdvanceCalls == 1, "failed terminal session must not advance effects again");
    }

    static void Update(EncounterSession session) =>
        typeof(EncounterSession).GetMethod("Update", BindingFlags.Instance | BindingFlags.NonPublic)
            .Invoke(session, null);

    static void Check(bool launcher, string expectedSummary)
    {
        var model = new EncounterModel(launcher, EncounterProfile.VisualReview);
        while (model.Status == EncounterStatus.Running) model.Step();
        Require(model.Summary == expectedSummary, "retained terminal output " + launcher);
        string snapshot = model.Snapshot();
        var view = new EncounterView { EffectLifetime = .18f };
        var session = new EncounterSession();
        typeof(EncounterSession).GetField("model", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(session, model);
        typeof(EncounterSession).GetProperty(nameof(EncounterSession.View)).SetValue(session, view);
        UnityEngine.Time.unscaledDeltaTime = .05f;
        typeof(EncounterSession).GetField("art", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(session, new SingedTerra.Art.TankPresentation());

        for (int frame = 0; frame < 4; frame++)
        {
            Update(session);
            Require(model.Snapshot() == snapshot, "terminal model no-op on frame " + frame + " fitting " + launcher);
        }
        Require(view.EffectLifetime == 0, "terminal effect must finish after later frames fitting " + launcher);
        Require(view.PresentCalls == 0 && view.RenderCalls == 0,
            "terminal frames must not replay events or rerender combat fitting " + launcher);
    }

    static void Require(bool condition, string claim)
    {
        if (!condition) throw new Exception("Terminal effect drain check failed: " + claim);
    }
}

namespace UnityEngine
{
    public class MonoBehaviour
    {
        public GameObject gameObject = new GameObject();
        public Transform transform = new Transform();
        public T GetComponent<T>() where T : new() => new T();
        public static void Destroy(object target) { }
        public static implicit operator bool(MonoBehaviour value) => value != null;
    }
    public class GameObject
    {
        public GameObject(string name = "") { }
        public T AddComponent<T>() where T : new() => new T();
    }
    public class Transform { public void SetParent(Transform parent, bool worldPositionStays) { } }
    public class Canvas { }
    public class Font { }
    public static class Application { public static bool isFocused = true; }
    public static class Time { public static float unscaledDeltaTime; }
    public static class Debug
    {
        public static void Log(string text) { }
        public static void LogError(string text) { }
    }
    public static class JsonUtility { public static string ToJson(object value) => "{}"; }
}

namespace UnityEngine.UI { }

namespace SingedTerra.Art
{
    public class ArtHud { }
    public class TankPresentation : UnityEngine.MonoBehaviour
    {
        public bool showingLauncher;
        public bool EncounterActive;
        public bool BeginEncounter() => true;
        public void EndEncounter() { }
        public void SetEncounterPaused(bool value) { }
        public void AdvanceTerminalShot(float elapsed) { }
    }
}

namespace SingedTerra.VisualReview
{
    public class BattlefieldReview : UnityEngine.MonoBehaviour
    {
        public EncounterSession Session;
        public void Report(string action) { }
        public static bool operator true(BattlefieldReview value) => value != null;
        public static bool operator false(BattlefieldReview value) => value == null;
        public static bool operator !(BattlefieldReview value) => value == null;
    }
}

namespace SingedTerra.Encounter
{
    public class EncounterHud
    {
        public void Initialize(EncounterSession session, SingedTerra.Art.ArtHud hud,
            UnityEngine.Canvas canvas, UnityEngine.Font font) { }
    }
    public class EncounterView : UnityEngine.MonoBehaviour
    {
        public bool FullEffects = true;
        public int VisibleUnits, PoolSize, PresentCalls, RenderCalls;
        public float EffectLifetime;
        public int AdvanceCalls;
        public bool ThrowOnAdvance;
        public void Initialize(SingedTerra.Art.TankPresentation art) { }
        public void Clear() { }
        public void ToggleEffects() { }
        public void Present(EncounterModel model) { PresentCalls++; }
        public void Render(EncounterModel model) { RenderCalls++; }
        public void Advance(float elapsed)
        {
            AdvanceCalls++;
            if (ThrowOnAdvance) throw new InvalidOperationException("presentation failed");
            EffectLifetime = Math.Max(0, EffectLifetime - elapsed);
        }
    }
}
