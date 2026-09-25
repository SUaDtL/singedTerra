using System;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;

namespace SingedTerra.Encounter
{
    // One owner for this transient, non-awarding session and its admitted ticks.
    public sealed class EncounterSession : MonoBehaviour
    {
        TankPresentation art;
        EncounterModel model;
        double accumulated;
        int run, lastReportSecond = -1;
        bool focused = true, applicationPaused;
        public EncounterModel Model => model;
        public EncounterView View { get; private set; }
        public bool Paused { get; private set; }
        public string Reason { get; private set; } = "";
        public string Failure { get; private set; } = "";
        public event Action Changed;
        public void Initialize(TankPresentation presentation, ArtHud hud, Canvas canvas, Font font)
        {
            art = presentation; focused = Application.isFocused;
            View = new GameObject("EncounterPresentation").AddComponent<EncounterView>();
            View.transform.SetParent(transform, false); View.Initialize(art);
            gameObject.AddComponent<EncounterHud>().Initialize(this, hud, canvas, font);
            Emit("ready");
        }
        public void Deploy()
        {
            if (model != null || !focused || applicationPaused) return;
            bool launcher = art.showingLauncher;
            if (!art.BeginEncounter()) return;
            model = new EncounterModel(launcher); run++; accumulated = 0;
            Paused = false; Reason = ""; Failure = ""; lastReportSecond = -1;
            View.Clear(); View.Render(model); Emit("deploy");
        }
        public void ReturnToInspection()
        {
            if (model == null) return;
            model = null; accumulated = 0; Paused = false; Reason = ""; Failure = "";
            View.Clear(); art.EndEncounter(); Emit("return");
        }
        public void TogglePause()
        {
            if (model == null || model.Status != EncounterStatus.Running || Failure != "") return;
            if (Paused && (!focused || applicationPaused)) return;
            Paused = !Paused; Reason = Paused ? "user" : ""; accumulated = 0; art.SetEncounterPaused(Paused); Emit("pause");
        }
        public void ToggleEffects() { View.ToggleEffects(); Emit("effects"); }
        void Suspend(string reason)
        {
            if (model == null || model.Status != EncounterStatus.Running) return;
            Paused = true; accumulated = 0; Reason = reason; art.SetEncounterPaused(true); Emit("suspend");
        }
        void Update()
        {
            if (model == null || model.Status != EncounterStatus.Running || Paused || Failure != "") return;
            if (!focused || applicationPaused) { Suspend("background"); return; }
            double elapsed = Time.unscaledDeltaTime;
            if (elapsed > .5 || accumulated + elapsed > .5) { Suspend("frame-gap"); return; }
            accumulated += elapsed;
            try
            {
                int steps = 0;
                while (accumulated + 1e-9 >= .05 && steps < 8 && model.Status == EncounterStatus.Running)
                {
                    model.Step(); View.Present(model); accumulated -= .05; steps++;
                }
                if(model.Status != EncounterStatus.Running)art.SetEncounterPaused(true);
                View.Render(model); View.Advance((float)Math.Min(elapsed, .1));
                if (model.Status != EncounterStatus.Running || model.Tick / 20 != lastReportSecond)
                { lastReportSecond = model.Tick / 20; Emit(model.Status == EncounterStatus.Running ? "tick" : "terminal"); }
                else if (steps > 0) Changed?.Invoke();
            }
            catch (Exception exception)
            {
                Failure = exception.GetType().Name; Paused = true; Reason = "technical-failure";
                accumulated = 0; art.SetEncounterPaused(true); Debug.LogError("ST_ENC_FAILURE " + Failure); Emit("failure");
            }
        }
        void OnApplicationFocus(bool value) { focused = value; if (!value) Suspend("focus"); }
        void OnApplicationPause(bool value) { applicationPaused = value; if (value) Suspend("application"); }
        [Serializable] sealed class State
        {
            public string action, rules, status, fitting, reason, summary;
            public int run, tick, hp, maxHp, spawned, kills, cannon, launcher, healed, closeHits, rangedHits;
            public int alive, visibleUnits, pool;
            public bool paused, focused, applicationPaused, locked, fullEffects, failed;
        }
        void Emit(string action)
        {
            Debug.Log("ST_ENC_STATE " + JsonUtility.ToJson(new State
            {
                action = action, rules = EncounterModel.RulesVersion, run = run,
                status = model == null ? "Fitting" : model.Status.ToString(),
                fitting = (model == null ? art.showingLauncher : model.HasLauncher) ? "launcher" : "repair",
                reason = Reason, paused = Paused, focused = focused, applicationPaused = applicationPaused,
                locked = art.EncounterActive, fullEffects = View.FullEffects, failed = Failure != "",
                tick = model?.Tick ?? 0, hp = model?.Hull ?? 120, maxHp = 120,
                spawned = model?.Spawned ?? 0, kills = model?.Kills ?? 0,
                cannon = model?.CannonShots ?? 0, launcher = model?.LauncherShots ?? 0,
                healed = model?.Restored ?? 0, closeHits = model?.CloseHits ?? 0, rangedHits = model?.RangedHits ?? 0,
                alive = model?.ActiveCount ?? 0, visibleUnits = View.VisibleUnits, pool = View.PoolSize,
                summary = model != null && model.Status != EncounterStatus.Running ? model.Summary : ""
            }));
            Changed?.Invoke();
        }
        void OnDestroy() { if (View) Destroy(View.gameObject); }
    }
}
