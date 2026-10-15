using System;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Imported scene/session/view checks. The baseline adapter invokes the original
// scheduling owner; it does not replace the model or the candidate behavior.
public static class LastStandBackgroundChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    const string Playable = "Assets/Scenes/LastStandPrototype.unity";
    sealed class MemoryStorage : ILastStandStorage
    {
        string value;
        public string Read() => value;
        public void Write(string next) { value = next; }
    }
    sealed class Fixture
    {
        public readonly EncounterSession Session;
        public readonly TankPresentation Art;
        public readonly LastStandLoopController Loop;
        double timestamp;
        public Fixture(string scene, bool launcher, double start = 100)
        {
            EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
            Art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Invoke(Art, "Start"); Invoke(Art.GetComponent<ArtHud>(), "Start");
            Session = UnityEngine.Object.FindFirstObjectByType<EncounterSession>();
            Loop = Art.GetComponent<LastStandLoopController>();
            if (Loop)
            {
                // Session-only checks must not let controller staging/return
                // consume the transient model being asserted here.
                Session.Changed -= (Action)Delegate.CreateDelegate(typeof(Action), Loop, "OnSessionChanged");
                Session.Stepped -= (Action<EncounterModel>)Delegate.CreateDelegate(typeof(Action<EncounterModel>), Loop, "OnSessionStepped");
            }
            Field(Session, "focused", true);
            if (Art.showingLauncher != launcher) Art.ToggleAttachment();
            timestamp = start;
            var deploy = Session.GetType().GetMethod("DeployAt");
            if (deploy != null) deploy.Invoke(Session, new object[] { start }); else Session.Deploy();
            Require(Session.Model != null && Session.Model.HasLauncher == launcher, "actual scene deployment and fitting");
        }
        public void Advance(double next)
        {
            var advance = Session.GetType().GetMethod("AdvanceAt");
            if (advance != null && Session.Model.Profile.IsPlayable) advance.Invoke(Session, new object[] { next });
            else
            {
                // Honest old scheduling seam: the original Update consumes its
                // accumulator and real Editor delta under its existing guards.
                if (!Session.Paused)
                {
                    double pending = (double)Session.GetType().GetField("accumulated", Private).GetValue(Session);
                    Field(Session, "accumulated", pending + next - timestamp - Time.unscaledDeltaTime);
                }
                Invoke(Session, "Update");
            }
            timestamp = next;
        }
        public void Pause(double next)
        {
            var pause = Session.GetType().GetMethod("TogglePauseAt");
            if (pause != null) pause.Invoke(Session, new object[] { next });
            else { if (!Session.Paused) Advance(next); Session.TogglePause(); }
            timestamp = next;
        }
        public bool CatchingUp => (bool?)Session.GetType().GetProperty("CatchingUp")?.GetValue(Session) ?? false;
        public double TerminalElapsed => (double?)Session.GetType().GetProperty("TerminalElapsedSeconds")?.GetValue(Session) ?? 0;
        public void Focus(bool value) { Invoke(Session, "OnApplicationFocus", value); Invoke(Art, "OnApplicationFocus", value); }
        public void ApplicationPause(bool value) { Invoke(Session, "OnApplicationPause", value); Invoke(Art, "OnApplicationPause", value); }
    }
    static void Require(bool value, string label)
    { if (!value) throw new InvalidOperationException("Last Stand background check failed: " + label); }
    static void Field(object owner, string name, object value) => owner.GetType().GetField(name, Private).SetValue(owner, value);
    static void Invoke(object owner, string name, params object[] args) =>
        owner.GetType().GetMethod(name, Private | BindingFlags.DeclaredOnly).Invoke(owner, args);
    static void ModelParity(Fixture fixture, int ticks)
    {
        var actual = fixture.Session.Model;
        var expected = new EncounterModel(actual.HasLauncher, actual.Profile, actual.CommittedCannonDamage);
        while (expected.Tick < ticks && expected.Status == EncounterStatus.Running) expected.Step();
        Require(actual.Snapshot() == expected.Snapshot(), "unchanged model parity at " + ticks + " ticks");
        Require(fixture.Session.View.VisibleUnits == actual.ActiveCount, "latest imported view matches actual model");
    }
    static void PlayableBlurAndDelayedCallbacksContinue()
    {
        foreach (bool launcher in new[] { false, true })
        {
            var f = new Fixture(Playable, launcher);
            f.Advance(100); f.Advance(100.049); Require(f.Session.Model.Tick == 0, "fraction below step");
            f.Advance(100.05); Require(f.Session.Model.Tick == 1, "inclusive fixed-step boundary");
            f.Advance(100.05); Require(f.Session.Model.Tick == 1, "duplicate timestamp adds no tick");
            f.Focus(false); f.ApplicationPause(true); f.Advance(101);
            Require(!f.Session.Paused && f.Session.Model.Tick == 20, "playable blur/application callback continues 20Hz model");
            f.Advance(110); Require(f.Session.Model.Tick == 148 && f.CatchingUp, "128-step callback budget retains debt");
            f.Pause(110); Require(!f.Session.Paused && f.Session.Model.Tick == 148 && f.CatchingUp,
                "conflicting pause control is gated while reconciling debt");
            f.Advance(110); Require(f.Session.Model.Tick == 200 && !f.CatchingUp, "duplicate callback drains only retained debt");
            ModelParity(f, 200);
            f.ApplicationPause(false); f.Focus(true);
            f.Pause(110.049); Require(f.Session.Paused && f.Session.Model.Tick == 200, "pause preserves admitted fraction");
            string paused = f.Session.Model.Snapshot();
            f.Focus(false); f.ApplicationPause(true); f.Advance(121);
            f.ApplicationPause(false); f.Focus(true);
            Require(f.Session.Paused && f.Session.Model.Snapshot() == paused, "hidden time and focus return preserve explicit pause");
            f.Pause(130); f.Advance(130.001);
            Require(!f.Session.Paused && f.Session.Model.Tick == 201, "resume excludes paused interval and retains fraction");
            f.Pause(130.001); f.Pause(150); f.Advance(150.05);
            Require(f.Session.Model.Tick == 202, "resume anchors even without a paused callback");
            ModelParity(f, 202);
            var dense = new Fixture(Playable, launcher);
            for (int i = 1; i <= 200; i++) dense.Advance(100 + i * .05);
            ModelParity(dense, 200);

            // A long missed interval ends on the real first cannon shot. The
            // final step has empty clock debt but is still reconciling old cues.
            var missed = new Fixture(Playable, launcher);
            int callbacks = 0, feedbackAllowed = 0;
            bool finalCannonObserved = false, finalFeedbackAllowed = false;
            missed.Session.Stepped += model =>
            {
                callbacks++;
                bool allowed = missed.Session.CanPresentFeedback;
                if (allowed) feedbackAllowed++;
                if (model.Tick == 60)
                {
                    foreach (var e in model.Events)
                        if (e.Kind == EncounterEventKind.Cannon) finalCannonObserved = true;
                    finalFeedbackAllowed = allowed;
                }
            };
            Require((float)typeof(TankPresentation).GetField("recoilTime", Private).GetValue(missed.Art) == 0 &&
                (float)typeof(TankPresentation).GetField("flashTime", Private).GetValue(missed.Art) == 0 && !missed.Art.flash.activeSelf,
                "missed-shot fixture begins without a shot transient");
            missed.Advance(103);
            float recoil = (float)typeof(TankPresentation).GetField("recoilTime", Private).GetValue(missed.Art);
            float flash = (float)typeof(TankPresentation).GetField("flashTime", Private).GetValue(missed.Art);
            Debug.Log("ST_LS_BACKGROUND_OBSERVATION fitting=" + launcher + " tick=" + missed.Session.Model.Tick +
                " callbacks=" + callbacks + " feedbackAllowed=" + feedbackAllowed + " finalFeedbackAllowed=" + finalFeedbackAllowed +
                " recoilTime=" + recoil + " flashTime=" + flash + " cannonShots=" + missed.Session.Model.CannonShots);
            Require(missed.Session.Model.Tick == 60 && callbacks == 60 && missed.Session.Model.CannonShots == 1 && finalCannonObserved,
                "actual long catch-up ends on the real tick-60 cannon shot");
            Require(feedbackAllowed == 0 && !finalFeedbackAllowed,
                "long catch-up forbids feedback admission through its final shot step");
            Require(recoil == 0 && flash == 0 && !missed.Art.flash.activeSelf,
                "long catch-up does not start missed shot recoil or flash");
            ModelParity(missed, 60);
        }
    }
    static void LegacyReviewRetainSuspension()
    {
        foreach (string scene in new[] { "Assets/Scenes/FieldAssembly.unity", "Assets/Scenes/BattlefieldReview.unity" })
        foreach (bool launcher in new[] { false, true })
        {
            var f = new Fixture(scene, launcher);
            string initial = f.Session.Model.Snapshot();
            f.Focus(false); f.Advance(110); f.Focus(true);
            Require(f.Session.Paused && f.Session.Reason == "focus" && f.Session.Model.Snapshot() == initial,
                "legacy/review focus suspension requires explicit resume");
            f.Pause(110); Require(!f.Session.Paused, "legacy/review explicit resume");
            f.ApplicationPause(true); f.Advance(120); f.Focus(true);
            Require(f.Session.Paused && f.Session.Reason == "application" && f.Session.Model.Snapshot() == initial,
                "legacy/review application suspension survives focus return");
            f.ApplicationPause(false); f.Pause(120); f.Advance(120.6);
            Require(f.Session.Paused && f.Session.Reason == "frame-gap" && f.Session.Model.Snapshot() == initial,
                "legacy/review valid long gaps retain original safety suspension");
        }
        EditorSceneManager.OpenScene("Assets/Scenes/FieldAssembly.unity", OpenSceneMode.Single);
        Invoke(UnityEngine.Object.FindFirstObjectByType<TankPresentation>(), "Start");
        EncounterChecks.Run();
        EncounterPoseChecks.CheckTerminalFeedback();
    }
    static void TerminalAndFailureDoNotRepeat()
    {
        foreach (bool launcher in new[] { false, true })
        {
            var f = new Fixture(Playable, launcher);
            int terminals = 0;
            double firstTerminalElapsed = double.NaN;
            Action observeTerminal = () =>
            {
                if (f.Session.Model.Status != EncounterStatus.Running && double.IsNaN(firstTerminalElapsed))
                    firstTerminalElapsed = f.TerminalElapsed;
            };
            f.Session.Changed += observeTerminal;
            Application.LogCallback observe = (message, stack, type) =>
            { if (message.StartsWith("ST_ENC_STATE ") && message.Contains("\"action\":\"terminal\"")) terminals++; };
            Application.logMessageReceived += observe;
            try
            {
                for (int i = 0; i < 30 && f.Session.Model.Status == EncounterStatus.Running; i++) f.Advance(300);
                Debug.Log("ST_LS_BACKGROUND_OBSERVATION terminal fitting=" + launcher + " tick=" + f.Session.Model.Tick +
                    " firstChangedElapsed=" + firstTerminalElapsed + " terminalElapsed=" + f.TerminalElapsed);
                Require(firstTerminalElapsed >= 0 && firstTerminalElapsed <= .48,
                    "first terminal Changed exposes only bounded .48-second lifecycle elapsed");
                Require(f.TerminalElapsed >= 0 && f.TerminalElapsed <= .48,
                    "first terminal transition admits only bounded .48-second lifecycle elapsed");
                Require(f.Session.Model.Status == EncounterStatus.Defeated, "actual playable natural defeat");
                ModelParity(f, 3600);
                string terminal = f.Session.Model.Snapshot();
                for (int i = 0; i < 4; i++) f.Advance(300);
                Require(terminals == 1 && f.Session.Model.Snapshot() == terminal, "terminal emitted once and combat remains frozen");
                Require(f.TerminalElapsed == .48, "terminal retains only bounded .48-second lifecycle elapsed");
                Require(f.Loop.Progression.PendingDefeat == null && f.Loop.Progression.Wallet == 0,
                    "session never stages or claims an award");
            }
            finally { Application.logMessageReceived -= observe; f.Session.Changed -= observeTerminal; }
            foreach (double invalid in new[] { double.NaN, double.PositiveInfinity, -1d, 99d })
            {
                var bad = new Fixture(Playable, launcher);
                string initial = bad.Session.Model.Snapshot();
                bad.Advance(invalid);
                Require(bad.Session.Failure != "" && bad.Session.Paused && bad.Session.Reason == "technical-failure",
                    "invalid/backward timestamp becomes technical failure");
                bad.Advance(200); bad.Focus(false); bad.Focus(true);
                Require(bad.Session.Model.Snapshot() == initial && bad.Loop.Progression.PendingDefeat == null,
                    "failed timestamp cannot step or award on a later callback");
            }
            var thrown = new Fixture(Playable, launcher);
            int callbacks = 0;
            thrown.Session.Stepped += model => { callbacks++; throw new InvalidOperationException("deliberate step-observer failure"); };
            thrown.Advance(101);
            int tick = thrown.Session.Model.Tick;
            thrown.Advance(110);
            Require(thrown.Session.Failure == "InvalidOperationException" && callbacks == 1 && thrown.Session.Model.Tick == tick &&
                thrown.Loop.Progression.PendingDefeat == null, "actual step callback failure freezes once without an award");

            var settle = new Fixture(Playable, launcher);
            var terminalModel = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            while (terminalModel.Status == EncounterStatus.Running) terminalModel.Step();
            double end = 100 + terminalModel.Tick * .05;
            for (int i = 0; i < 30 && settle.Session.Model.Tick < terminalModel.Tick - 1; i++) settle.Advance(end - .05);
            settle.Advance(end);
            Require(settle.Session.Model.Status == EncounterStatus.Defeated && Math.Abs(settle.TerminalElapsed) < 1e-8,
                "terminal boundary retains fractional lifecycle elapsed");
            settle.Pause(end); settle.Focus(false); settle.Advance(end + 10); settle.Focus(true);
            Require(settle.Session.Paused && Math.Abs(settle.TerminalElapsed) < 1e-8,
                "explicit terminal pause freezes settling across hidden time");
            settle.Pause(end + 20); settle.Advance(end + 20.25);
            Require(!settle.Session.Paused && Math.Abs(settle.TerminalElapsed - .25) < 1e-8,
                "terminal resume excludes paused time and admits new settling elapsed");

            var limit = new Fixture(Playable, launcher);
            // An explicit surviving pre-limit boundary fixture exercises the
            // actual model's limit branch; natural defeat normally precedes it.
            typeof(EncounterModel).GetProperty(nameof(EncounterModel.Tick)).SetValue(limit.Session.Model, 3599);
            limit.Advance(100.05);
            Require(limit.Session.Model.Tick == 3600 && limit.Session.Model.Status == EncounterStatus.Limit,
                "actual model horizon ends the session");
            string limited = limit.Session.Model.Snapshot();
            limit.Advance(300);
            Require(limit.Session.Model.Snapshot() == limited && limit.Loop.Progression.PendingDefeat == null &&
                limit.Loop.Progression.Wallet == 0, "limit callback cannot continue combat or award");
        }
    }
    public static void Run()
    {
        var factory = LastStandLoopController.StorageFactory;
        bool failed = false;
        LastStandLoopController.StorageFactory = () => new MemoryStorage();
        try
        {
            Check("test_playable_blur_and_delayed_callbacks_continue", PlayableBlurAndDelayedCallbacksContinue, ref failed);
            Check("test_legacy_review_retain_suspension", LegacyReviewRetainSuspension, ref failed);
            Check("test_terminal_and_failure_do_not_repeat", TerminalAndFailureDoNotRepeat, ref failed);
        }
        finally
        {
            LastStandLoopController.StorageFactory = factory;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
        if (failed) EditorApplication.Exit(1);
    }
    static void Check(string name, Action check, ref bool failed)
    {
        try { check(); Debug.Log("ST_LS_BACKGROUND_PASS " + name); }
        catch (Exception exception)
        { failed = true; Debug.LogError("ST_LS_BACKGROUND_FAIL " + name + " " + exception); }
    }

    // T-03 keeps controller observers attached and uses only disposable storage.
    // AdvanceAt remains the real session/model owner. Invoking controller Update
    // exposes the existing timer honestly on RED and the same candidate on GREEN.
    sealed class FeedbackStorage : ILastStandStorage
    {
        public string Value;
        public int Writes;
        public bool FailWrite;
        public string Read() => Value;
        public void Write(string value)
        {
            Writes++;
            if (FailWrite) throw new InvalidOperationException("deliberate disposable storage failure");
            Value = value;
        }
    }
    sealed class FeedbackFixture
    {
        public readonly TankPresentation Art;
        public readonly LastStandLoopController Loop;
        public EncounterSession Session => Loop.Session;
        public readonly FeedbackStorage Storage;
        public FeedbackFixture(bool launcher = false, FeedbackStorage storage = null)
        {
            Storage = storage ?? new FeedbackStorage();
            LastStandLoopController.StorageFactory = () => Storage;
            EditorSceneManager.OpenScene(Playable, OpenSceneMode.Single);
            Art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Invoke(Art, "Start"); Invoke(Art.GetComponent<ArtHud>(), "Start");
            Loop = Art.GetComponent<LastStandLoopController>();
            Field(Session, "focused", true);
            Invoke(Loop.Audio, "OnApplicationFocus", true);
            if (Art.showingLauncher != launcher) Art.ToggleAttachment();
        }
        public void Deploy(double start = 100)
        {
            Loop.Deploy();
            Require(Session.Model != null && Loop.Progression.ActiveRunId > 0, "real reserved deployment");
            Field(Session, "runClock", new LastStandRunClock(start, Session.Model.Profile.Horizon));
        }
        public void Advance(double timestamp)
        {
            if (Session.Model != null) Session.AdvanceAt(timestamp);
            Invoke(Loop, "Update");
        }
        public void Focus(bool value)
        {
            Invoke(Session, "OnApplicationFocus", value); Invoke(Art, "OnApplicationFocus", value);
            Invoke(Loop, "OnApplicationFocus", value); Invoke(Loop.Audio, "OnApplicationFocus", value);
        }
        public void Hidden(bool value)
        {
            Invoke(Session, "OnApplicationPause", value); Invoke(Art, "OnApplicationPause", value);
            Invoke(Loop, "OnApplicationPause", value); Invoke(Loop.Audio, "OnApplicationPause", value);
        }
        public void Defeat(double timestamp)
        {
            for (int i = 0; i < 40 && Loop.Phase == "battle"; i++) Advance(timestamp);
            Require(Loop.Progression.PendingDefeat != null || Loop.Phase == "save-error", "actual natural defeat reached controller");
        }
    }
    static string WorkshopSave => "{\"version\":2,\"credits\":1,\"permanentLevels\":{\"cannonAttack\":0,\"launcherAttack\":0,\"hullCapacity\":0,\"armor\":0,\"cannonCycle\":0,\"fieldRepair\":0},\"nextRunId\":2,\"lastFinalizedRunId\":1,\"pendingDefeat\":null}";
    static void BackgroundDefeatSettlesOnce()
    {
        foreach (bool launcher in new[] { false, true })
        {
            var f = new FeedbackFixture(launcher); f.Deploy(); f.Focus(false); f.Hidden(true); f.Defeat(300);
            Require(f.Loop.Phase == "result" && f.Session.Model == null,
                "background active .48 settling exposes persisted manual result on callback");
            int writes = f.Storage.Writes, runId = f.Loop.Progression.PendingDefeat.RunId;
            Require(writes == 3 && f.Loop.Progression.Wallet == 0 && f.Loop.Progression.CannonAttackLevel == 0 &&
                f.Loop.Progression.ActiveRunId == 0 && f.Loop.Progression.NextRunId == 2,
                "one initial save, reservation and stage; no automatic claim purchase or redeploy");
            f.Advance(300); f.Hidden(false); f.Focus(true); f.Advance(301);
            Require(f.Storage.Writes == writes && f.Loop.Progression.PendingDefeat.RunId == runId,
                "duplicate callback and repeated return cannot stage twice");
            var reloaded = new FeedbackFixture(launcher, f.Storage);
            Require(reloaded.Loop.Phase == "result" && reloaded.Loop.Progression.PendingDefeat.RunId == runId,
                "persisted pending result reloads without an award");
            reloaded.Loop.Claim(); reloaded.Loop.Claim();
            Require(reloaded.Loop.Progression.Wallet == 1 && reloaded.Storage.Writes == writes + 1 &&
                reloaded.Loop.Progression.PendingDefeat == null && reloaded.Session.Model == null,
                "manual claim remains exactly once and no automatic redeploy");

            var denied = new FeedbackFixture(launcher); denied.Deploy(); denied.Storage.FailWrite = true;
            denied.Focus(false); denied.Defeat(300);
            Require(denied.Loop.Phase == "save-error" && denied.Loop.Progression.PendingDefeat == null &&
                denied.Loop.Progression.Wallet == 0 && denied.Loop.Progression.SaveState == "retry",
                "failed staging cannot expose successful result or award");
            int deniedWrites = denied.Storage.Writes;
            denied.Advance(300); denied.Advance(310);
            Require(denied.Storage.Writes == deniedWrites && denied.Loop.Progression.PendingDefeat == null,
                "failed storage waits for existing manual recovery owner");
            denied.Storage.FailWrite = false; denied.Focus(true); denied.Loop.RetrySave();
            Require(denied.Loop.Phase == "result" && denied.Loop.Progression.PendingDefeat != null &&
                denied.Loop.Progression.Wallet == 0, "manual retry confirms one pending defeat without claim");

            var limit = new FeedbackFixture(launcher); limit.Deploy();
            typeof(EncounterModel).GetProperty(nameof(EncounterModel.Tick)).SetValue(limit.Session.Model, 3599);
            limit.Advance(100.05);
            Require(limit.Loop.Phase == "garage" && limit.Loop.Progression.PendingDefeat == null &&
                limit.Loop.Progression.Wallet == 0, "run limit remains non-awarding");
            var failure = new FeedbackFixture(launcher); failure.Deploy(); failure.Advance(double.NaN);
            Require(failure.Loop.Phase == "garage" && failure.Loop.Progression.PendingDefeat == null &&
                failure.Loop.Progression.Wallet == 0 && failure.Session.Model == null && failure.Loop.Audio.Suspended,
                "technical failure returns without award or feedback admission");
            var unfinished = new FeedbackFixture(launcher); unfinished.Deploy();
            var abandoned = new FeedbackFixture(launcher, unfinished.Storage);
            Require(abandoned.Loop.Progression.Wallet == 0 && abandoned.Loop.Progression.PendingDefeat == null,
                "unfinished same-record reload cannot earn an award");
        }
    }
    static void PauseExcludesSettlingTime()
    {
        foreach (bool launcher in new[] { false, true })
        {
            var oracle = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            while (oracle.Status == EncounterStatus.Running) oracle.Step();
            double end = 100 + oracle.Tick * .05;
            var f = new FeedbackFixture(launcher); f.Deploy();
            for (int i = 0; i < 40 && f.Loop.Phase == "battle"; i++) f.Advance(end);
            Require(f.Loop.Phase == "settling" && f.Session.TerminalElapsedSeconds < .01, "exact natural terminal boundary");
            // Editor uptime can be shorter than a full natural run. Anchor the
            // already-terminal session at the real controller action boundary.
            end = Time.realtimeSinceStartupAsDouble;
            Field(f.Session, "runClock", new LastStandRunClock(end, oracle.Profile.Horizon));
            f.Loop.TogglePause();
            Require(f.Session.Paused && f.Loop.Audio.Suspended, "actual settling Pause action freezes lifecycle and audio");
            int writes = f.Storage.Writes;
            f.Focus(false); f.Hidden(true); f.Advance(end + 10); f.Hidden(false); f.Focus(true);
            Require(f.Session.Paused && f.Loop.Phase == "settling" && f.Session.TerminalElapsedSeconds < .1 &&
                f.Storage.Writes == writes, "ten seconds away and focus return cannot clear explicit settling Pause");
            f.Session.TogglePauseAt(end + 20);
            f.Advance(end + 20.25); f.Advance(end + 20.25);
            Require(f.Loop.Phase == "settling" && f.Session.TerminalElapsedSeconds < .35,
                "resume excludes paused wall time; duplicate cumulative elapsed is not charged twice");
            f.Advance(end + 20.49);
            Require(f.Loop.Phase == "result" && f.Session.Model == null && f.Storage.Writes == writes,
                "only new active elapsed completes original .48 settling interval");
        }
    }
    static void FocusRestoresCurrentCuesWithoutReplay()
    {
        var events = new System.Collections.Generic.List<string>();
        int combatDispatches = 0;
        Application.LogCallback observe = (message, stack, type) =>
        {
            if (message.StartsWith("ST_LS_AUDIO event=")) events.Add(message);
            if (message.StartsWith("ST_LS_HIT ")) combatDispatches++;
        };
        Application.logMessageReceived += observe;
        try
        {
            var f = new FeedbackFixture(); f.Deploy(); events.Clear(); f.Advance(103);
            Require(f.Session.Model.Tick == 60 && f.Session.Model.CannonShots == 1, "actual long catch-up first cannon boundary");
            Require(events.Count == 0 && combatDispatches == 0,
                "long catch-up cannon and impact cues never enter controller audio dispatch or voices");
            Require((float)typeof(TankPresentation).GetField("recoilTime", Private).GetValue(f.Art) == 0 &&
                !f.Art.flash.activeSelf, "missed shot has no replay recoil or flash");
            f.Advance(103); Require(events.Count == 0, "duplicate return callback replays no cue");
            for (int i = 61; i <= 120; i++) f.Advance(100 + i * .05);
            Require(events.Contains("ST_LS_AUDIO event=cannon"), "next current foreground cannon reaches actual audio voice admission");
            var debt = new FeedbackFixture(); debt.Deploy(); events.Clear(); int beforeDebt = combatDispatches;
            debt.Advance(110);
            Require(debt.Session.Model.Tick == 128 && debt.Session.CatchingUp && events.Count == 0 && combatDispatches == beforeDebt,
                "first bounded catch-up callback retains debt without old audio dispatch");
            debt.Advance(110);
            Require(debt.Session.Model.Tick == 200 && !debt.Session.CatchingUp && events.Count == 0 && combatDispatches == beforeDebt,
                "final duplicate debt-draining callback remains silent through its final shot");
            debt.Advance(110);
            Require(events.Count == 0 && combatDispatches == beforeDebt, "zero-debt duplicate callback cannot replay a cue");
            for (int i = 201; i <= 240; i++) debt.Advance(100 + i * .05);
            Require(events.Contains("ST_LS_AUDIO event=cannon"), "new foreground cannon after debt reconciliation is admitted");
            events.Clear();
            debt.Art.PlayEncounterShot(debt.Art.tank.position + Vector3.forward * 10); Invoke(debt.Art, "Update");
            Require((float)typeof(TankPresentation).GetField("recoilTime", Private).GetValue(debt.Art) > 0,
                "real current foreground recoil exists before focus loss");
            debt.Focus(false); debt.Hidden(true); debt.Advance(120); debt.Hidden(false); debt.Focus(true);
            Require(events.Count == 0 && (float)typeof(TankPresentation).GetField("recoilTime", Private).GetValue(debt.Art) == 0 &&
                (float)typeof(TankPresentation).GetField("flashTime", Private).GetValue(debt.Art) == 0 && !debt.Art.flash.activeSelf,
                "background callback and return discard prior recoil flash and cues");

            var terminal = new FeedbackFixture(); terminal.Deploy(); events.Clear();
            terminal.Focus(false); terminal.Hidden(true); terminal.Defeat(300); terminal.Hidden(false); terminal.Focus(true);
            Require(events.Count == 0 && terminal.Loop.Phase == "result",
                "background defeat and foreground result never replay terminal sound");

            var workshop = new FeedbackFixture(false, new FeedbackStorage { Value = WorkshopSave });
            workshop.Loop.Audio.UnlockFromGesture("test-real-workshop-gesture"); workshop.Focus(false); workshop.Hidden(true);
            workshop.Loop.Audio.PlayPurchase(); Require(events.Count == 0, "hidden purchase cue cannot enter audio voices");
            // Audio callbacks can arrive before the controller/session visibility callback.
            Invoke(workshop.Loop.Audio, "OnApplicationPause", false); Invoke(workshop.Loop.Audio, "OnApplicationFocus", true);
            Field(workshop.Session, "focused", true); Field(workshop.Session, "applicationPaused", false);
            workshop.Loop.Purchase();
            Require(workshop.Loop.Progression.CannonAttackLevel == 1 && events.Count == 1 &&
                events[0] == "ST_LS_AUDIO event=purchase" && !workshop.Loop.Audio.Suspended,
                "next actual foreground purchase clears only stale focus suspension before playing");
            RetryPurchaseAndFailedSaveAdmission();
            LiveTracerVisibilityAdmission();
        }
        finally { Application.logMessageReceived -= observe; }
    }
    static void RetryPurchaseAndFailedSaveAdmission()
    {
        var cues = new System.Collections.Generic.List<string>();
        Application.LogCallback observe = (message, stack, type) =>
        { if (message.StartsWith("ST_LS_AUDIO event=")) cues.Add(message); };
        Application.logMessageReceived += observe;
        try
        {
            var store = new FeedbackStorage { Value = WorkshopSave, FailWrite = true };
            var f = new FeedbackFixture(false, store);
            f.Loop.Audio.UnlockFromGesture("test-current-failed-purchase");
            // A ready current controller action reconciles the edit-mode
            // fixture's initial focus suspension without touching storage.
            f.Loop.ToggleMute(); f.Loop.ToggleMute();
            Require(f.Loop.Audio.CanPlay && f.Session.CanRun && !f.Session.Paused && !f.Loop.Muted,
                "failed-purchase fixture begins with actual eligible focused unlocked audio");
            string committed = store.Value;
            f.Loop.Purchase();
            Require(f.Loop.Progression.SaveState == "retry" && store.Value == committed && store.Writes == 1 &&
                f.Loop.Progression.CannonAttackLevel == 0 && f.Loop.Progression.Wallet == 1 &&
                f.Loop.Progression.PendingDefeat == null && f.Loop.Progression.ActiveRunId == 0 &&
                f.Session.Model == null && cues.Count == 0,
                "actual failed purchase preserves committed wallet level and record without cue award or redeploy");
            Require(f.Session.CanRun && !f.Session.Paused && !f.Loop.Muted && f.Loop.Audio.Suspended && !f.Loop.Audio.CanPlay,
                "focused unconfirmed purchase save refuses audio before recovery independently of visibility mute or Pause");
            f.Loop.Audio.PlayPurchase();
            Require(cues.Count == 0 && store.Value == committed,
                "focused retry save cannot admit a purchase cue or confirm an award");
            f.Focus(false); f.Hidden(true);
            // The browser can deliver audio callbacks before the current action's
            // session/controller callback. Preserve that real owner ordering.
            Invoke(f.Loop.Audio, "OnApplicationPause", false); Invoke(f.Loop.Audio, "OnApplicationFocus", true);
            Field(f.Session, "focused", true); Field(f.Session, "applicationPaused", false);
            f.Advance(110);
            Require(f.Loop.Progression.SaveState == "retry" && f.Loop.Audio.Suspended && cues.Count == 0 &&
                store.Writes == 1 && store.Value == committed,
                "foreground return alone neither retries unconfirmed purchase nor replays its cue");
            store.FailWrite = false;
            f.Loop.RetrySave();
            Require(f.Loop.Progression.SaveState == "ready" && f.Loop.Progression.CannonAttackLevel == 1 &&
                f.Loop.Progression.Wallet == 0 && f.Loop.Progression.PendingDefeat == null &&
                f.Loop.Progression.ActiveRunId == 0 && f.Session.Model == null && store.Writes == 2,
                "manual retry confirms exactly one purchase transaction without automatic award or redeploy");
            Require(cues.Count == 1 && cues[0] == "ST_LS_AUDIO event=purchase" &&
                f.Loop.Audio.CanPlay && !f.Loop.Audio.Suspended,
                "confirmed current foreground retry purchase synchronizes admission before its one cue");
            string purchased = store.Value;
            var loaded = LastStandProgression.Load(store);
            Require(loaded.CannonAttackLevel == 1 && loaded.Wallet == 0 && loaded.PendingDefeat == null,
                "confirmed manual retry purchase persists the exact upgraded level and cost");
            f.Loop.RetrySave();
            Require(cues.Count == 1 && store.Writes == 2 && store.Value == purchased &&
                f.Loop.Progression.CannonAttackLevel == 1 && f.Loop.Progression.Wallet == 0 && f.Session.Model == null,
                "duplicate manual retry cannot replay a cue buy another level or start a run");

            var blockedStore = new FeedbackStorage { Value = WorkshopSave, FailWrite = true };
            var blocked = new FeedbackFixture(false, blockedStore);
            blocked.Loop.Audio.UnlockFromGesture("test-current-conflicting-save");
            blocked.Loop.Purchase();
            blockedStore.Value = WorkshopSave.Replace("\"credits\":1", "\"credits\":2");
            int priorCues = cues.Count;
            blocked.Loop.RetrySave();
            Require(blocked.Loop.Progression.SaveState == "blocked" && blocked.Session.CanRun &&
                !blocked.Session.Paused && !blocked.Loop.Muted && blocked.Loop.Audio.Suspended && !blocked.Loop.Audio.CanPlay &&
                blocked.Loop.Progression.Wallet == 1 && blocked.Loop.Progression.CannonAttackLevel == 0 &&
                blocked.Loop.Progression.PendingDefeat == null && blocked.Session.Model == null && cues.Count == priorCues,
                "actual conflicting purchase save stays focused blocked silent and non-awarding");
            blocked.Loop.Audio.PlayPurchase();
            Require(cues.Count == priorCues && blockedStore.Writes == 1,
                "blocked save refuses purchase audio without overwriting its conflicting record");
        }
        finally { Application.logMessageReceived -= observe; }
    }
    static void LiveTracerVisibilityAdmission()
    {
        foreach (bool launcher in new[] { false, true })
        foreach (bool hidden in new[] { false, true })
        {
            var f = new FeedbackFixture(launcher); f.Deploy();
            for (int i = 1; i <= 60; i++) f.Advance(100 + i * .05);
            var life = (float[])typeof(EncounterView).GetField("life", Private).GetValue(f.Session.View);
            var trails = (LineRenderer[])typeof(EncounterView).GetField("trails", Private).GetValue(f.Session.View);
            bool live = false;
            for (int i = 0; i < life.Length; i++) if (life[i] > 0 && trails[i].enabled) live = true;
            Require(f.Session.Model.Tick == 60 && f.Session.Model.CannonShots == 1 && live,
                "actual current session cannon event produces a live view tracer before visibility loss");
            string snapshot = f.Session.Model.Snapshot();
            if (hidden) f.Hidden(true); else f.Focus(false);
            bool cleared = true;
            for (int i = 0; i < life.Length; i++) cleared &= life[i] == 0 && !trails[i].enabled;
            Require(cleared && f.Session.Model.Snapshot() == snapshot &&
                f.Session.View.VisibleUnits == f.Session.Model.ActiveCount,
                "immediate visibility loss discards live tracer lifetimes and renderers before any elapsed callback");
            if (hidden) f.Hidden(false); else f.Focus(true);
            cleared = true;
            for (int i = 0; i < life.Length; i++) cleared &= life[i] == 0 && !trails[i].enabled;
            Require(cleared && f.Session.Model.Snapshot() == snapshot,
                "immediate foreground return cannot replay stale view tracers");
            var cues = new System.Collections.Generic.List<string>();
            Application.LogCallback observe = (message, stack, type) =>
            { if (message.StartsWith("ST_LS_AUDIO event=")) cues.Add(message); };
            Application.logMessageReceived += observe;
            try
            {
                f.Advance(110); f.Advance(110);
                cleared = true;
                for (int i = 0; i < life.Length; i++) cleared &= life[i] == 0 && !trails[i].enabled;
                Require(cleared && f.Session.Model.Tick == 200 && !f.Session.CatchingUp && cues.Count == 0,
                    "later debt reconciliation stays silent and cannot restore discarded tracers");
                int priorShots = f.Session.Model.CannonShots;
                for (int i = 201; i <= 240 && f.Session.Model.CannonShots == priorShots; i++)
                    f.Advance(100 + i * .05);
                live = false;
                for (int i = 0; i < life.Length; i++) if (life[i] > 0 && trails[i].enabled) live = true;
                Require(live && cues.Contains("ST_LS_AUDIO event=cannon"),
                    "next current foreground cannon creates new tracer and cue after visibility reconciliation");
            }
            finally { Application.logMessageReceived -= observe; }
        }
    }
    static void MuteAndProfileLifecycleRemainIsolated()
    {
        bool prior = Application.runInBackground;
        try
        {
            foreach (bool previous in new[] { false, true })
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                Application.runInBackground = previous;
                var f = new FeedbackFixture();
                Require(Application.runInBackground, "dedicated lifecycle alone enables background operation");
                f.Deploy(); f.Loop.ToggleMute(); f.Focus(false); f.Hidden(true); f.Advance(101);
                f.Hidden(false); f.Focus(true);
                Require(f.Loop.Muted && !f.Loop.Audio.CanPlay, "focus return preserves mute despite active background ticks");
                f.Session.TogglePauseAt(101); f.Focus(false); f.Advance(111); f.Focus(true);
                Require(f.Session.Paused && f.Loop.Audio.Suspended && !f.Loop.Audio.CanPlay,
                    "focus return preserves explicit Pause and all feedback guards");
                // Edit-mode scene loading does not deliver player OnDestroy.
                // Invoke the actual lifecycle owner, then discard this fixture.
                Invoke(f.Loop, "OnDestroy");
                UnityEngine.Object.DestroyImmediate(f.Loop);
                Require(Application.runInBackground == previous, "leaving dedicated controller restores exact previous background value");
            }
            foreach (string scene in new[] { "Assets/Scenes/FieldAssembly.unity", "Assets/Scenes/BattlefieldReview.unity" })
            {
                Application.runInBackground = true;
                var legacy = new Fixture(scene, false);
                Require(!Application.runInBackground, "legacy/review retain original background setting");
                legacy.Focus(false); legacy.Focus(true);
                Require(legacy.Session.Paused && legacy.Session.Reason == "focus", "legacy/review still require explicit Resume");
            }
        }
        finally { Application.runInBackground = prior; }
    }
    public static void RunFeedback()
    {
        var factory = LastStandLoopController.StorageFactory;
        bool background = Application.runInBackground, failed = false;
        try
        {
            Check("test_background_defeat_settles_once", BackgroundDefeatSettlesOnce, ref failed);
            Check("test_pause_excludes_settling_time", PauseExcludesSettlingTime, ref failed);
            Check("test_focus_restores_current_cues_without_replay", FocusRestoresCurrentCuesWithoutReplay, ref failed);
            Check("test_mute_and_profile_lifecycle_remain_isolated", MuteAndProfileLifecycleRemainIsolated, ref failed);
        }
        finally
        {
            LastStandLoopController.StorageFactory = factory;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Application.runInBackground = background;
        }
        if (failed) EditorApplication.Exit(1);
    }
}
