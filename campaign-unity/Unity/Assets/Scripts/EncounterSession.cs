using System;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.LastStand;

namespace SingedTerra.Encounter
{
    // One owner for this transient, non-awarding session and its admitted ticks.
    public sealed class EncounterSession : MonoBehaviour, ILastStandPurchaseSession
    {
        TankPresentation art;
        EncounterModel model;
        SingedTerra.VisualReview.BattlefieldReview review;
        LastStandLoopController loop;
        LastStandRunClock runClock;
        bool reconciling, terminalReported;
        CallbackState audioCallback;
        EncounterModel audioModel;
        LastStandRunClock audioClock;
        int audioOrdinal;
        double accumulated;
        double configuredSpeed = LastStandSpeedPolicy.InitialMaximum;
        int run, callbackSequence, lastReportSecond = -1;
        bool focused = true, applicationPaused;
        public EncounterModel Model => model;
        public LastStandShopState Shop { get; private set; }
        public EncounterView View { get; private set; }
        public bool Paused { get; private set; }
        public string Reason { get; private set; } = "";
        public string Failure { get; private set; } = "";
        public bool CanRun => focused && !applicationPaused;
        public bool BackgroundContinuation => loop && runClock != null;
        public double MaximumSpeed { get; private set; } = LastStandSpeedPolicy.InitialMaximum;
        public double StepWallMilliseconds(int speedIndex)=>runClock?.StepWallMilliseconds(speedIndex)??0;
        public double LastPositiveSpeed => runClock?.LastPositiveSpeed ?? configuredSpeed;
        public double SelectedSpeed => runClock?.SelectedSpeed ?? configuredSpeed;
        public double EffectiveSpeed => Paused ? 0 : runClock?.EffectiveSpeed ?? configuredSpeed;
        public bool ManualPaused => runClock?.ManualPaused ?? Paused;
        public bool MenuPaused => runClock?.MenuPaused ?? false;
        public bool CatchingUp => BackgroundContinuation && model != null &&
            model.Status == EncounterStatus.Running && runClock.CatchingUp;
        public bool CanPresentFeedback => CanRun && !Paused && Failure == "" && !CatchingUp && !reconciling;
        public int StepsThisCallback { get; private set; }
        public double CallbackElapsedSeconds { get; private set; }
        public double TerminalElapsedSeconds { get; private set; }
        public bool CheckpointBlocked { get; private set; }
        public event Action Changed;
        public event Action<EncounterModel> Stepped;
        public event Action<EncounterModel> WaveCleared;
        public Func<bool> BeforeAdvance;
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
        internal void DeployReservedRun(LastStandShopState shop, bool menuPaused = false)
        { StartAt(Time.realtimeSinceStartupAsDouble, shop, menuPaused); }
        internal void RestoreReservedRun(LastStandShopState shop, EncounterModel checkpoint, bool paused)
        { StartAt(Time.realtimeSinceStartupAsDouble, shop, false, checkpoint, paused); }
        void StartAt(double timestamp, LastStandShopState shop, bool menuPaused = false, EncounterModel checkpoint = null, bool startPaused = false)
        {
            if (model != null || !focused || applicationPaused) return;
            bool launcher = art.showingLauncher;
            if (!art.BeginEncounter()) return;
            model = checkpoint ?? (loop && shop != null ? EncounterModel.CreatePlayable(shop.Fitting, loop.Progression.ActiveTier, shop) :
                new EncounterModel(launcher, review ? EncounterProfile.VisualReview : EncounterProfile.Legacy));
            if (model.AwaitingWaveCommit) model.ContinueAfterCheckpoint();
            run++; accumulated = 0; CheckpointBlocked = false;
            Shop = shop;
            if (Shop != null) ApplyShopProjection();
            runClock = loop ? new LastStandRunClock(timestamp, model.Profile.Horizon - model.Tick, configuredSpeed, MaximumSpeed) : null;
            if (menuPaused && runClock != null) runClock.SetMenuPaused(timestamp, true);
            if (startPaused && runClock != null) runClock.Pause(timestamp);
            terminalReported = reconciling = false;
            StepsThisCallback = 0; CallbackElapsedSeconds = TerminalElapsedSeconds = 0;
            Paused = runClock != null && runClock.Paused; Reason = startPaused ? "user" : Paused ? "menu" : ""; Failure = ""; lastReportSecond = -1;
            art.SetEncounterPaused(Paused);
            View.Clear(); View.Render(model); Emit("deploy");
            if (runClock != null && runClock.Failed) Fail("InvalidClock");
        }
        void ILastStandPurchaseSession.ApplyShopProjection() => ApplyShopProjection();
        internal void ApplyShopProjection()
        {
            model.ApplyShopProjection(Shop);
        }
        public void ReturnToInspection()
        {
            if (model == null) return;
            if (runClock != null) configuredSpeed = runClock.LastPositiveSpeed;
            model = null; Shop = null; runClock = null; accumulated = 0; Paused = false; Reason = ""; Failure = "";
            CheckpointBlocked = false;
            terminalReported = reconciling = false;
            StepsThisCallback = 0; CallbackElapsedSeconds = TerminalElapsedSeconds = 0;
            View.Clear(); art.EndEncounter(); Emit("return");
        }
        public void TogglePause() { TogglePauseAt(Time.realtimeSinceStartupAsDouble); }
        public void TogglePauseAt(double timestamp)
        {
            if (BackgroundContinuation)
            {
                if (!PrepareClockAction(timestamp)) return;
                bool accepted = runClock.ManualPaused ? runClock.Resume(timestamp) : runClock.Pause(timestamp);
                if (accepted) PublishClockAction("pause");
                else if (runClock.Failed) Fail("InvalidClock");
                return;
            }
            if (model == null || model.Status != EncounterStatus.Running || Failure != "") return;
            if (Paused && (!focused || applicationPaused)) return;
            Paused = !Paused; Reason = Paused ? "user" : ""; accumulated = 0; art.SetEncounterPaused(Paused); Emit("pause");
        }
        public bool ConfigureSpeed(double speed)
        {
            if (model != null) return false;
            configuredSpeed = LastStandSpeedPolicy.RestorePositive(speed,MaximumSpeed);
            return true;
        }
        public bool TrySetSpeed(double speed) => TrySetSpeedAt(Time.realtimeSinceStartupAsDouble, speed);
        public bool TrySetSpeedAt(double timestamp, double speed)
        {
            if (!LastStandSpeedPolicy.Allows(speed,MaximumSpeed) || !PrepareClockAction(timestamp)) return false;
            if (!runClock.SetSpeed(timestamp, speed))
            { if (runClock.Failed) Fail("InvalidClock"); return false; }
            configuredSpeed = runClock.LastPositiveSpeed;
            PublishClockAction("speed"); return true;
        }
        public bool TrySetMenuPaused(bool paused) => TrySetMenuPausedAt(Time.realtimeSinceStartupAsDouble, paused);
        public bool GrantMaximumSpeed(double maximum)
        {
            if(!LastStandSpeedPolicy.IsValidMaximum(maximum) || maximum<MaximumSpeed)return false;
            if(runClock!=null && !runClock.GrantMaximum(maximum))return false;
            MaximumSpeed=maximum;return true;
        }
        internal bool RestoreProfileSpeed(double maximum,double preferred)
        {
            // A confirmed whole-profile replacement can lower research ranks.
            // Never lower a ceiling on an active run or alter its clock.
            if(model!=null || runClock!=null || !LastStandSpeedPolicy.IsValidMaximum(maximum))return false;
            MaximumSpeed=maximum;configuredSpeed=LastStandSpeedPolicy.RestorePositive(preferred,maximum);return true;
        }
        public bool TrySetMenuPausedAt(double timestamp, bool paused)
        {
            if (!PrepareClockAction(timestamp)) return false;
            if (!runClock.SetMenuPaused(timestamp, paused))
            { if (runClock.Failed) Fail("InvalidClock"); return false; }
            PublishClockAction("menu"); return true;
        }
        bool PrepareClockAction(double timestamp)
        {
            if (CheckpointBlocked || !BackgroundContinuation || model == null || Failure != "" || CatchingUp || !CanRun) return false;
            // An action cannot change the rate of already elapsed simulation.
            // Advance may trigger a terminal/controller transition, so recheck
            // the live owners before changing either pause cause.
            AdvanceAt(timestamp);
            return BackgroundContinuation && model != null && Failure == "" && !CheckpointBlocked && !CatchingUp;
        }
        void PublishClockAction(string action)
        {
            Paused = runClock.Paused;
            Reason = runClock.ManualPaused ? "user" : runClock.MenuPaused ? "menu" : "";
            art.SetEncounterPaused(Paused || model.Status != EncounterStatus.Running);
            Emit(action);
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
            if (CheckpointBlocked || !BackgroundContinuation || model == null || Failure != "") return;
            if(BeforeAdvance!=null && !BeforeAdvance())return;
            double previousTimestamp = runClock.LastTimestamp, priorPending = runClock.PendingSeconds;
            double elapsed = timestamp - previousTimestamp;
            if (!runClock.Observe(timestamp)) { Fail("InvalidClock"); return; }
            if (Paused) return;
            CallbackElapsedSeconds = elapsed;
            var current = model;
            var callbackClock = runClock;
            int callback = ++callbackSequence, fromTick = current.Tick;
            bool reportCallback = current.Status == EncounterStatus.Running && callbackClock.CatchingUp;
            reconciling = !CanRun || runClock.PendingSeconds + 1e-9 >= 2 * LastStandRunClock.StepSeconds;
            if (reportCallback)
            {
                audioCallback = new CallbackState { id=callback, run=run, fromTick=fromTick,
                    timestamp=timestamp, previousTimestamp=previousTimestamp, priorPending=priorPending };
                audioModel=current; audioClock=callbackClock; audioOrdinal=0;
            }
            if (reportCallback) EmitCallback("begin", callback, fromTick, current, callbackClock, timestamp, previousTimestamp, priorPending);
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
                    if (current.AwaitingWaveCommit)
                    {
                        WaveCleared?.Invoke(current);
                        if (current.AwaitingWaveCommit || CheckpointBlocked || model != current) break;
                    }
                }
                if (current.Status != EncounterStatus.Running)
                {
                    runClock.Stop(); art.SetEncounterPaused(true);
                    // Combat debt is in simulation seconds. The clock retains
                    // the wall timestamp of the terminal tick, including delayed
                    // callbacks and the bounded horizon, so cosmetics never
                    // accelerate or slow down with the selected game speed.
                    TerminalElapsedSeconds = Math.Min(.48, Math.Max(0,
                        timestamp - runClock.LastStepTimestamp));
                }
                View.Render(current); View.Advance((float)Math.Min(elapsed, .7));
                if (current.Status != EncounterStatus.Running && !terminalReported)
                { terminalReported = true; Emit("terminal"); }
                else if (current.Tick / 20 != lastReportSecond)
                { lastReportSecond = current.Tick / 20; Emit("tick"); }
                else if (StepsThisCallback > 0) Changed?.Invoke();
            }
            catch (Exception exception) { Fail(exception.GetType().Name); }
            finally
            {
                // This separate observation never invokes Changed or performs
                // presentation work. Its clock belongs to admission, whereas
                // the browser stamps actual cue and HUD emission independently.
                if (reportCallback) EmitCallback("end", callback, fromTick, current, callbackClock, timestamp, previousTimestamp, priorPending);
                audioCallback=null; audioModel=null; audioClock=null;
                reconciling = false;
            }
        }
        public LastStandAudioCue PrepareCombatCue(string cue)
        {
            var context=audioCallback;
            if (context==null) return null;
            return LastStandAudioCue.Prepare(cue, context.id, context.run, context.fromTick, audioModel.Tick,
                audioClock.StepsThisCallback, ++audioOrdinal, context.timestamp, context.previousTimestamp,
                context.priorPending, CanRun && !Paused && Failure=="" && !CheckpointBlocked);
        }
        public void HoldCheckpoint()
        {
            if (model == null) return;
            CheckpointBlocked = true; Paused = true; Reason = "checkpoint-save";
            runClock?.Stop(); art.SetEncounterPaused(true);
        }
        public void ContinueCommittedWave()
        {
            if (model == null) return;
            if (model.Status == EncounterStatus.Running && model.AwaitingWaveCommit) model.ContinueAfterCheckpoint();
            if (!CheckpointBlocked) return;
            // A storage interruption is not offline simulation time. Retry
            // reanchors and leaves an explicit manual pause for the player.
            double now = Time.realtimeSinceStartupAsDouble;
            runClock = new LastStandRunClock(now, model.Profile.Horizon - model.Tick, configuredSpeed, MaximumSpeed);
            runClock.Pause(now); CheckpointBlocked = false; Paused = true; Reason = "user";
            art.SetEncounterPaused(true);
        }
        [Serializable] sealed class CallbackState
        {
            public string action;
            public int id, run, fromTick, tick, steps;
            public double timestamp, previousTimestamp, elapsed, priorPending, pending, speed, age;
            public bool focused, applicationPaused, paused, failed;
        }
        void EmitCallback(string action, int callback, int fromTick, EncounterModel current, LastStandRunClock clock,
            double timestamp, double previousTimestamp, double priorPending)
        {
            Debug.Log("ST_ENC_CALLBACK " + JsonUtility.ToJson(new CallbackState
            {
                action = action, id = callback, run = run, fromTick = fromTick, tick = current.Tick,
                steps = clock.StepsThisCallback, timestamp = timestamp, previousTimestamp = previousTimestamp,
                elapsed = timestamp - previousTimestamp, priorPending = priorPending, pending = clock.PendingSeconds,
                speed = clock.LastPositiveSpeed, age = Math.Max(0, Time.realtimeSinceStartupAsDouble - timestamp),
                focused = focused, applicationPaused = applicationPaused, paused = Paused, failed = Failure != ""
            }));
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
            UpdateNativeSuspension();
            // Idle Last Stand controls also depend on focus. A terminal run
            // releases its clock while hidden, so notify its HUD on return.
            if (loop) Emit("visibility"); else if (!value) Suspend("focus");
        }
        void OnApplicationPause(bool value)
        {
            applicationPaused = value;
            UpdateNativeSuspension();
            if (loop) Emit("visibility"); else if (value) Suspend("application");
        }
        void UpdateNativeSuspension()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (loop && runClock != null)
            {
                runClock.SetHostSuspended(Time.realtimeSinceStartupAsDouble, !focused || applicationPaused);
                Paused = runClock.Paused;
                Reason = runClock.HostSuspended ? "application" : runClock.MenuPaused ? "menu" : runClock.ManualPaused ? "user" : "";
                art.SetEncounterPaused(Paused);
            }
#endif
        }
        [Serializable] sealed class State
        {
            public string action, rules, status, fitting, reason, summary,contentVersion,economyVersion;
            public int run, tick, hp, maxHp, spawned, kills, cannon, launcher, scattergun,mortar,railgun,healed, closeHits, rangedHits;
            public int mortarDamage,railgunDamage;
            public int alive, visibleUnits, pool;
            public int wave,completedWave,remainingWaveEnemies;
            public bool awaitingWaveCommit,checkpointBlocked;
            public bool paused, focused, applicationPaused, locked, fullEffects, failed, catchingUp;
            public int callbackSteps;
            public double terminalElapsed;
            public double selectedSpeed, effectiveSpeed, maximumSpeed;
            public double clockTimestamp, clockPending;
            public bool manualPaused, menuPaused;
        }
        void Emit(string action)
        {
            Debug.Log("ST_ENC_STATE " + JsonUtility.ToJson(new State
            {
                action = action, rules = model?.Profile.Id ?? (loop ? EncounterProfile.PlayablePrototype.Id : review ? EncounterProfile.VisualReview.Id : EncounterModel.RulesVersion), run = run,
                contentVersion=model?.Profile.Edition.ContentVersion??"",economyVersion=model?.Profile.Edition.EconomyVersion??"",
                status = model == null ? "Fitting" : model.Status.ToString(),
                fitting = model == null ? art.FittingId : LastStandFittingCatalog.Id(model.Fitting),
                reason = Reason, paused = Paused, focused = focused, applicationPaused = applicationPaused,
                locked = art.EncounterActive, fullEffects = View.FullEffects, failed = Failure != "",
                catchingUp = CatchingUp, callbackSteps = StepsThisCallback, terminalElapsed = TerminalElapsedSeconds,
                selectedSpeed = SelectedSpeed, effectiveSpeed = EffectiveSpeed, maximumSpeed = MaximumSpeed,
                manualPaused = ManualPaused, menuPaused = MenuPaused,
                // Passive admission observations; -1 means no playable clock.
                clockTimestamp = runClock?.LastTimestamp ?? -1, clockPending = runClock?.PendingSeconds ?? -1,
                tick = model?.Tick ?? 0, hp = model?.Hull ?? 120, maxHp = model?.CurrentMaximumHull ?? 120,
                spawned = model?.Spawned ?? 0, kills = model?.Kills ?? 0,
                cannon = model?.CannonShots ?? 0, launcher = model?.LauncherShots ?? 0,
                scattergun=model?.ScattergunShots??0,mortar=model?.MortarShots??0,railgun=model?.RailgunShots??0,
                mortarDamage=model?.CurrentMortarDamage??LastStandUpgradeCatalog.BaseMortarDamage,
                railgunDamage=model?.CurrentRailgunDamage??LastStandUpgradeCatalog.BaseRailgunDamage,
                healed = model?.Restored ?? 0, closeHits = model?.CloseHits ?? 0, rangedHits = model?.RangedHits ?? 0,
                alive = model?.ActiveCount ?? 0, visibleUnits = View.VisibleUnits, pool = View.PoolSize,
                wave=model?.Wave??0,completedWave=model?.CompletedWave??0,remainingWaveEnemies=model?.RemainingWaveEnemies??0,
                awaitingWaveCommit=model?.AwaitingWaveCommit??false,checkpointBlocked=CheckpointBlocked,
                summary = model != null && model.Status != EncounterStatus.Running ? model.Summary : ""
            }));
            if (review) review.Report(action);
            Changed?.Invoke();
        }
        void OnDestroy() { if (View) Destroy(View.gameObject); }
    }
}
