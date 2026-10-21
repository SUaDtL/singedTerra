using System;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.LastStand;

namespace SingedTerra.Encounter
{
    // One owner for this transient, non-awarding session and its admitted ticks.
    public sealed class EncounterSession : MonoBehaviour
    {
        TankPresentation art;
        EncounterModel model;
        SingedTerra.VisualReview.BattlefieldReview review;
        LastStandLoopController loop;
        LastStandRunClock runClock;
        bool reconciling, terminalReported;
        double accumulated;
        int run, lastReportSecond = -1;
        bool focused = true, applicationPaused;
        public EncounterModel Model => model;
        public LastStandShopState Shop { get; private set; }
        public EncounterView View { get; private set; }
        public bool Paused { get; private set; }
        public string Reason { get; private set; } = "";
        public string Failure { get; private set; } = "";
        public bool CanRun => focused && !applicationPaused;
        public bool BackgroundContinuation => loop && runClock != null;
        public bool CatchingUp => BackgroundContinuation && model != null &&
            model.Status == EncounterStatus.Running && runClock.CatchingUp;
        public bool CanPresentFeedback => CanRun && !Paused && Failure == "" && !CatchingUp && !reconciling;
        public int StepsThisCallback { get; private set; }
        public double CallbackElapsedSeconds { get; private set; }
        public double TerminalElapsedSeconds { get; private set; }
        public event Action Changed;
        public event Action<EncounterModel> Stepped;
        public void Initialize(TankPresentation presentation, ArtHud hud, Canvas canvas, Font font)
        {
            art = presentation; focused = Application.isFocused;
            review = art.GetComponent<SingedTerra.VisualReview.BattlefieldReview>();
            loop = art.GetComponent<LastStandLoopController>();
            if (review) review.Session = this;
            View = new GameObject("EncounterPresentation").AddComponent<EncounterView>();
            View.transform.SetParent(transform, false); View.Initialize(art);
            gameObject.AddComponent<EncounterHud>().Initialize(this, hud, canvas, font);
            Emit("ready");
        }
        public void Deploy() { DeployAt(Time.realtimeSinceStartupAsDouble); }
        public void DeployAt(double timestamp) { StartAt(timestamp, null); }
        // Only the dedicated controller supplies a freshly reserved ledger.
        // Shared and direct session deployments keep their original defaults.
        internal void DeployReservedRun(LastStandShopState shop)
        { StartAt(Time.realtimeSinceStartupAsDouble, shop); }
        void StartAt(double timestamp, LastStandShopState shop)
        {
            if (model != null || !focused || applicationPaused) return;
            bool launcher = art.showingLauncher;
            if (!art.BeginEncounter()) return;
            model = new EncounterModel(launcher, loop ? EncounterProfile.ForTier(loop.Progression.ActiveTier) : review ? EncounterProfile.VisualReview : EncounterProfile.Legacy,
                loop ? loop.Progression.CannonDamage : EncounterModel.CannonDamage); run++; accumulated = 0;
            Shop = shop;
            if (Shop != null) ApplyShopProjection();
            runClock = loop ? new LastStandRunClock(timestamp, model.Profile.Horizon) : null;
            terminalReported = reconciling = false;
            StepsThisCallback = 0; CallbackElapsedSeconds = TerminalElapsedSeconds = 0;
            Paused = false; Reason = ""; Failure = ""; lastReportSecond = -1;
            View.Clear(); View.Render(model); Emit("deploy");
            if (runClock != null && runClock.Failed) Fail("InvalidClock");
        }
        internal void ApplyShopProjection()
        {
            int Level(LastStandUpgradeTrackId id) => Shop.GetTrack(id).CurrentLevel;
            int Effect(LastStandUpgradeTrackId id) => LastStandUpgradeCatalog.Get(id).EffectAt(Level(id), 1);
            int armorLevel = Level(LastStandUpgradeTrackId.Armor);
            var armor = LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor);
            model.TryApplyPlayableAttackProjection(Effect(LastStandUpgradeTrackId.CannonAttack),
                model.HasLauncher ? Effect(LastStandUpgradeTrackId.LauncherAttack) : EncounterModel.LauncherDamage);
            model.TryApplyPlayableDefenseProjection(Effect(LastStandUpgradeTrackId.HullCapacity),
                rawHit => armor.EffectAt(armorLevel, rawHit));
            model.TryApplyPlayableCannonPeriodProjection(Effect(LastStandUpgradeTrackId.CannonCycle));
            if (!model.HasLauncher) model.TryApplyPlayableRepairProjection(Effect(LastStandUpgradeTrackId.FieldRepair));
        }
        public void ReturnToInspection()
        {
            if (model == null) return;
            model = null; Shop = null; runClock = null; accumulated = 0; Paused = false; Reason = ""; Failure = "";
            terminalReported = reconciling = false;
            StepsThisCallback = 0; CallbackElapsedSeconds = TerminalElapsedSeconds = 0;
            View.Clear(); art.EndEncounter(); Emit("return");
        }
        public void TogglePause() { TogglePauseAt(Time.realtimeSinceStartupAsDouble); }
        public void TogglePauseAt(double timestamp)
        {
            if (BackgroundContinuation)
            {
                if (model == null || Failure != "" || CatchingUp || (Paused && !CanRun)) return;
                if (!Paused)
                {
                    // Reconcile the action boundary before excluding paused time.
                    AdvanceAt(timestamp);
                    if (model == null || Failure != "" || CatchingUp) return;
                    if (!runClock.Pause(timestamp)) { Fail("InvalidClock"); return; }
                }
                else if (!runClock.Resume(timestamp)) { Fail("InvalidClock"); return; }
                Paused = runClock.Paused; Reason = Paused ? "user" : "";
                art.SetEncounterPaused(Paused || model.Status != EncounterStatus.Running); Emit("pause");
                return;
            }
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
            if (BackgroundContinuation) { AdvanceAt(Time.realtimeSinceStartupAsDouble); return; }
            if (model == null || Paused || Failure != "") return;
            if (!focused || applicationPaused) { Suspend("background"); return; }
            double elapsed = Time.unscaledDeltaTime;
            if (model.Status == EncounterStatus.Running && (elapsed > .5 || accumulated + elapsed > .5))
            { Suspend("frame-gap"); return; }
            try
            {
                if (model.Status != EncounterStatus.Running)
                {
                    // The terminal tick has already rendered; only age its remaining feedback.
                    View.Advance((float)Math.Min(elapsed, .1));
                    art.AdvanceTerminalShot((float)Math.Min(elapsed, .1));
                    return;
                }
                accumulated += elapsed;
                int steps = 0;
                while (accumulated + 1e-9 >= .05 && steps < 8 && model.Status == EncounterStatus.Running)
                {
                    model.Step(); Stepped?.Invoke(model); View.Present(model); accumulated -= .05; steps++;
                }
                if(model.Status != EncounterStatus.Running)art.SetEncounterPaused(true);
                View.Render(model); View.Advance((float)Math.Min(elapsed, .1));
                if (model.Status != EncounterStatus.Running || model.Tick / 20 != lastReportSecond)
                { lastReportSecond = model.Tick / 20; Emit(model.Status == EncounterStatus.Running ? "tick" : "terminal"); }
                else if (steps > 0) Changed?.Invoke();
            }
            catch (Exception exception)
            {
                Fail(exception.GetType().Name);
            }
        }
        // Same-document timestamp entry point. Only the dedicated playable
        // lifecycle uses it; this session remains the sole model.Step owner.
        public void AdvanceAt(double timestamp)
        {
            StepsThisCallback = 0; CallbackElapsedSeconds = 0;
            if (!BackgroundContinuation || model == null || Failure != "") return;
            double elapsed = timestamp - runClock.LastTimestamp;
            double pending = runClock.PendingSeconds;
            if (!runClock.Observe(timestamp)) { Fail("InvalidClock"); return; }
            if (Paused) return;
            CallbackElapsedSeconds = elapsed;
            var current = model;
            reconciling = !CanRun || pending + elapsed + 1e-9 >= 2 * LastStandRunClock.StepSeconds;
            try
            {
                if (current.Status != EncounterStatus.Running)
                {
                    runClock.Stop();
                    TerminalElapsedSeconds = Math.Min(.48, TerminalElapsedSeconds + elapsed);
                    View.Advance((float)Math.Min(elapsed, .7));
                    if (CanRun) art.AdvanceTerminalShot((float)Math.Min(elapsed, .1));
                    if (elapsed > 0) Changed?.Invoke();
                    return;
                }
                while (current.Status == EncounterStatus.Running && runClock.TryTakeStep())
                {
                    current.Step(); StepsThisCallback++;
                    Stepped?.Invoke(current);
                    if (model != current || Failure != "") return;
                    if (!reconciling) View.Present(current);
                }
                if (current.Status != EncounterStatus.Running)
                {
                    runClock.Stop(); art.SetEncounterPaused(true);
                    // Keep only the lifecycle interval, including elapsed that
                    // extended past the combat horizon in this callback.
                    TerminalElapsedSeconds = Math.Min(.48, Math.Max(0,
                        pending + elapsed - StepsThisCallback * LastStandRunClock.StepSeconds));
                }
                View.Render(current); View.Advance((float)Math.Min(elapsed, .7));
                if (current.Status != EncounterStatus.Running && !terminalReported)
                { terminalReported = true; Emit("terminal"); }
                else if (current.Tick / 20 != lastReportSecond)
                { lastReportSecond = current.Tick / 20; Emit("tick"); }
                else if (StepsThisCallback > 0) Changed?.Invoke();
            }
            catch (Exception exception) { Fail(exception.GetType().Name); }
            finally { reconciling = false; }
        }
        void Fail(string failure)
        {
            if (Failure != "") return;
            Failure = failure; Paused = true; Reason = "technical-failure";
            runClock?.Stop(); accumulated = 0; art.SetEncounterPaused(true);
            Debug.LogError("ST_ENC_FAILURE " + Failure); Emit("failure");
        }
        void OnApplicationFocus(bool value)
        {
            focused = value;
            if (BackgroundContinuation) Emit("visibility"); else if (!value) Suspend("focus");
        }
        void OnApplicationPause(bool value)
        {
            applicationPaused = value;
            if (BackgroundContinuation) Emit("visibility"); else if (value) Suspend("application");
        }
        [Serializable] sealed class State
        {
            public string action, rules, status, fitting, reason, summary;
            public int run, tick, hp, maxHp, spawned, kills, cannon, launcher, healed, closeHits, rangedHits;
            public int alive, visibleUnits, pool;
            public bool paused, focused, applicationPaused, locked, fullEffects, failed, catchingUp;
            public int callbackSteps;
            public double terminalElapsed;
        }
        void Emit(string action)
        {
            Debug.Log("ST_ENC_STATE " + JsonUtility.ToJson(new State
            {
                action = action, rules = model?.Profile.Id ?? (loop ? EncounterProfile.PlayablePrototype.Id : review ? EncounterProfile.VisualReview.Id : EncounterModel.RulesVersion), run = run,
                status = model == null ? "Fitting" : model.Status.ToString(),
                fitting = (model == null ? art.showingLauncher : model.HasLauncher) ? "launcher" : "repair",
                reason = Reason, paused = Paused, focused = focused, applicationPaused = applicationPaused,
                locked = art.EncounterActive, fullEffects = View.FullEffects, failed = Failure != "",
                catchingUp = CatchingUp, callbackSteps = StepsThisCallback, terminalElapsed = TerminalElapsedSeconds,
                tick = model?.Tick ?? 0, hp = model?.Hull ?? 120, maxHp = model?.CurrentMaximumHull ?? 120,
                spawned = model?.Spawned ?? 0, kills = model?.Kills ?? 0,
                cannon = model?.CannonShots ?? 0, launcher = model?.LauncherShots ?? 0,
                healed = model?.Restored ?? 0, closeHits = model?.CloseHits ?? 0, rangedHits = model?.RangedHits ?? 0,
                alive = model?.ActiveCount ?? 0, visibleUnits = View.VisibleUnits, pool = View.PoolSize,
                summary = model != null && model.Status != EncounterStatus.Running ? model.Summary : ""
            }));
            if (review) review.Report(action);
            Changed?.Invoke();
        }
        void OnDestroy() { if (View) Destroy(View.gameObject); }
    }
}
