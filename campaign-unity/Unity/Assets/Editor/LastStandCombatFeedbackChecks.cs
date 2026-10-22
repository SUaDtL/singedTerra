using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.VisualReview;

// Actual imported presentation objects and model events. These checks neither
// initialize player storage nor claim browser input or rendered visual approval.
public static class LastStandCombatFeedbackChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    sealed class Fixture : IDisposable
    {
        public readonly TankPresentation Art;
        public readonly EncounterView View;
        public readonly BattlefieldReview Review;
        readonly GameObject host;
        public Fixture(bool launcher = false)
        {
            EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity", OpenSceneMode.Single);
            Art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Review = Art.GetComponent<BattlefieldReview>();
            Require(Review && Review.flashMaterial && Review.scorchMaterial, "saved review assets exist");
            Invoke(Art, "Start");
            if (Art.showingLauncher != launcher) Art.ToggleAttachment();
            host = new GameObject("Combat feedback check");
            View = host.AddComponent<EncounterView>(); View.Initialize(Art);
            Require(Art.BeginEncounter(), "actual presentation starts");
        }
        public Renderer[] Feedback => host.GetComponentsInChildren<Renderer>()
            .Where(r => r.name.StartsWith("Review feedback ")).ToArray();
        public Renderer[] VehiclePaint => host.GetComponentsInChildren<Renderer>()
            .Where(r => !r.name.StartsWith("Review feedback ") && !(r is LineRenderer)).ToArray();
        public LineRenderer[] Trails => host.GetComponentsInChildren<LineRenderer>(true);
        public void ShotFrame(float elapsed) { Invoke(Art, "AdvanceShot", elapsed); View.Advance(elapsed); }
        public void Dispose()
        {
            Art.EndEncounter();
            // Do not save the temporary runtime view into the imported scene.
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }
    static void Invoke(object target, string method, params object[] args) =>
        target.GetType().GetMethod(method, Private | BindingFlags.DeclaredOnly).Invoke(target, args);
    static void Require(bool condition, string description)
    { if (!condition) throw new InvalidOperationException("Combat feedback check failed: " + description); }
    static EncounterModel At(bool launcher, Func<EncounterModel, bool> predicate)
    {
        var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
        while (model.Status == EncounterStatus.Running)
        { model.Step(); if (predicate(model)) return model; }
        throw new InvalidOperationException("Actual model never reaches required feedback boundary");
    }
    static bool Outgoing(EncounterEvent e) => e.Kind == EncounterEventKind.Cannon || e.Kind == EncounterEventKind.Launcher;
    static bool Emitting(Renderer renderer)
    {
        var block = new MaterialPropertyBlock(); renderer.GetPropertyBlock(block);
        Color color = block.GetColor("_EmissionColor");
        return color.r > .001f || color.g > .001f || color.b > .001f;
    }

    static void EventTimeDestruction()
    {
        using (var f = new Fixture(true))
        {
            var model = new EncounterModel(true, EncounterProfile.VisualReview);
            while (model.Tick < 1291) model.Step();
            var original = model.Events.ToArray();
            var shots = original.Where(Outgoing).ToArray();
            Require(shots.Length == 2 && shots[0].Slot == shots[1].Slot && !shots[0].Killed && shots[1].Killed &&
                !model.Foes[shots[0].Slot].Alive, "real same-step nonlethal cannon then lethal launcher");
            var events = (List<EncounterEvent>)model.Events;
            try
            {
                // Explicit event-boundary fixture: retain the real final model,
                // but deliver each genuine event separately to identify its effect.
                events.Clear(); events.Add(shots[0]); f.View.Present(model);
                Require(!f.Feedback.Any(r => r.sharedMaterial == f.Review.scorchMaterial),
                    "nonlethal event must not claim the later event's destruction");
                f.View.Clear(); events.Clear(); events.Add(shots[1]); f.View.Present(model);
                Require(f.Feedback.Count(r => r.sharedMaterial == f.Review.scorchMaterial) == 1,
                    "lethal event owns one destruction");
            }
            finally { events.Clear(); events.AddRange(original); }
            f.View.Clear(); f.View.Present(model);
            Require(f.Feedback.Count(r => r.sharedMaterial == f.Review.scorchMaterial) == 1,
                "complete real event batch has one destruction");
        }
    }

    static void ReducedInformativeFeedback()
    {
        foreach (bool launcher in new[] { false, true }) using (var f = new Fixture(launcher))
        {
            f.View.ToggleEffects();
            foreach (bool killed in new[] { false, true })
            {
                var model = At(launcher, m => m.Events.Any(e => Outgoing(e) && e.Killed == killed));
                string snapshot = model.Snapshot();
                f.View.Clear(); f.View.Render(model); f.View.Present(model); f.ShotFrame(.04f);
                var feedback = f.Feedback;
                Require(feedback.Length > 0, "reduced mode retains visible " + (killed ? "destruction" : "impact"));
                Require(feedback.All(r => r.sharedMaterial == f.Review.flashMaterial &&
                    r.transform.localScale.x <= .65f), "reduced impact/destruction is compact without dust or scorch");
                Require(!feedback.Any(r => Vector3.Distance(r.transform.position, f.Art.muzzle.position) < .01f),
                    "reduced mode emits no decorative muzzle puff");
                Require(!f.Trails.Any(r => r.enabled) && !f.Art.flash.activeSelf && !f.VehiclePaint.Any(Emitting),
                    "reduced future events emit no tracer, tank flash or vehicle flash");
                Require(snapshot == model.Snapshot(), "feedback cannot mutate model state");
            }
            var incoming = At(launcher, m => m.Events.Any(e => e.Kind == EncounterEventKind.CloseHit ||
                e.Kind == EncounterEventKind.RangedHit) && !m.Events.Any(Outgoing));
            f.View.Clear(); f.View.Render(incoming); f.View.Present(incoming); f.ShotFrame(.04f);
            Require(f.Feedback.Length > 0 && f.Feedback.All(r => r.transform.localScale.x <= .65f),
                "reduced incoming damage remains compact and visible");
        }
    }

    static void ToggleClearsPausedFlashes()
    {
        foreach (bool launcher in new[] { false, true }) using (var f = new Fixture(launcher))
        {
            var model = At(launcher, m => m.Events.Any(e => e.Kind == EncounterEventKind.Cannon && !e.Killed));
            f.View.Render(model); f.View.Present(model); f.ShotFrame(.01f);
            Require(f.Art.flash.activeSelf && f.VehiclePaint.Any(Emitting), "full mode has actual tank and enemy flashes");
            f.Art.SetEncounterPaused(true);
            string snapshot = model.Snapshot(); Vector3 barrel = f.Art.barrel.localPosition;
            Quaternion aim = f.Art.turret.rotation; Vector3 camera = f.Art.view.transform.position;
            f.View.ToggleEffects();
            Require(!f.Art.flash.activeSelf && !f.VehiclePaint.Any(Emitting) && f.Feedback.Length == 0 &&
                !f.Trails.Any(r => r.enabled), "paused reduced toggle clears every active flash immediately");
            Require(f.Art.barrel.localPosition == barrel && f.Art.turret.rotation == aim &&
                f.Art.view.transform.position == camera && model.Snapshot() == snapshot,
                "effects toggle preserves recoil pose, aim, camera and model");
            f.ShotFrame(0); f.View.ToggleEffects(); f.ShotFrame(0);
            Require(!f.Art.flash.activeSelf && !f.VehiclePaint.Any(Emitting) && f.Feedback.Length == 0,
                "restoring full mode never replays cleared flashes");
        }
    }

    static void ReducedAimRecoilAndRestore()
    {
        foreach (bool launcher in new[] { false, true }) using (var f = new Fixture(launcher))
        {
            var model = At(launcher, m => m.Events.Any(e => e.Kind == EncounterEventKind.Cannon));
            var cannon = model.Events.First(e => e.Kind == EncounterEventKind.Cannon);
            Vector3 home = f.Art.barrel.localPosition;
            f.View.ToggleEffects(); f.View.Render(model); f.View.Present(model); f.ShotFrame(.04f);
            var direction = Vector3.ProjectOnPlane(f.View.Position(model.Foes[cannon.Slot]) - f.Art.tank.position, Vector3.up).normalized;
            var actual = Vector3.ProjectOnPlane(f.Art.muzzle.position - f.Art.barrel.position, Vector3.up).normalized;
            Require(Vector3.Angle(direction, actual) < .1f && Vector3.Distance(home, f.Art.barrel.localPosition) > .0001f,
                "reduced mode preserves actual cannon aim and recoil");
            Require(!f.Art.flash.activeSelf, "reduced recoil does not require muzzle flash");
            for (int frame = 0; frame < 20; frame++) f.ShotFrame(.05f);
            Require(Vector3.Distance(home, f.Art.barrel.localPosition) < .00001f && f.Feedback.Length == 0,
                "reduced feedback drains to resting pose");
            f.View.ToggleEffects(); f.View.Present(model); f.ShotFrame(.01f);
            Require(f.Art.flash.activeSelf && f.Trails.Any(r => r.enabled), "new full-mode shot restores optional feedback");
            f.Art.EndEncounter(); f.Art.PreviewMotion(); Invoke(f.Art, "AdvanceShot", .01f);
            Require(f.Art.flash.activeSelf, "inspection preview still owns its flash");
        }
    }

    static void ModelAndPoolPreservation()
    {
        foreach (bool launcher in new[] { false, true }) using (var f = new Fixture(launcher))
        {
            var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            while (model.Status == EncounterStatus.Running)
            {
                model.Step(); string snapshot = model.Snapshot();
                if (model.Tick % 100 == 0) f.View.ToggleEffects();
                f.View.Render(model); f.View.Present(model); f.ShotFrame(.05f);
                Require(model.Snapshot() == snapshot && f.View.VisibleUnits == model.ActiveCount,
                    "presentation preserves every real model step and visible population");
            }
            f.View.Clear();
            Require(f.View.VisibleUnits == 0 && f.Feedback.Length == 0 && !f.Trails.Any(r => r.enabled),
                "clear hides bounded feedback pool");
            var fresh = new EncounterModel(launcher, EncounterProfile.PlayablePrototype); fresh.Step(); f.View.Render(fresh);
            Require(f.View.VisibleUnits == fresh.ActiveCount, "cleared pool can display a fresh run");
        }
    }

    public static void Run()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            bool background = Application.runInBackground;
            foreach (var test in new (string, Action)[] {
                ("test_event_time_destruction", EventTimeDestruction),
                ("test_reduced_informative_feedback", ReducedInformativeFeedback),
                ("test_toggle_clears_paused_flashes", ToggleClearsPausedFlashes),
                ("test_reduced_aim_recoil_and_restore", ReducedAimRecoilAndRestore),
                ("test_model_and_pool_preservation", ModelAndPoolPreservation) })
            {
                try { test.Item2(); Debug.Log("ST_LS_COMBAT_PASS " + test.Item1); }
                catch (Exception error) { failed = true; Debug.LogError("ST_LS_COMBAT_FAIL " + test.Item1 + " " + error); }
            }
            Application.runInBackground = background;
        }
        if (failed) EditorApplication.Exit(1);
    }
}
