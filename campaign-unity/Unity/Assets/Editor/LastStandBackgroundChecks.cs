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
                // Reserve a valid active tier through the real progression owner.
                // Controller observers remain detached for session-only assertions.
                Require(Loop.Progression.TryDeploy(), "session-only fixture reserves actual progression tier");
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
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            var factory = LastStandLoopController.StorageFactory;
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
        public Action BeforeWrite;
        public readonly System.Collections.Generic.List<string> Records=new System.Collections.Generic.List<string>();
        public string Read() => Value;
        public void Write(string value)
        {
            Writes++; BeforeWrite?.Invoke();
            if (FailWrite) throw new InvalidOperationException("deliberate disposable storage failure");
            Value = value;
            Records.Add(value);
        }
    }
    static System.Collections.Generic.Dictionary<string,object> SaveFields(string value)
    {
        return (System.Collections.Generic.Dictionary<string,object>)typeof(LastStandProgression).Assembly
            .GetType("SingedTerra.LastStand.LastStandSaveJson").GetMethod("Read",BindingFlags.Static|BindingFlags.NonPublic)
            .Invoke(null,new object[]{value});
    }
    static string SaveFieldsJson(object value)=> (string)typeof(LastStandProgression).Assembly
        .GetType("SingedTerra.LastStand.LastStandSaveJson").GetMethod("Write",BindingFlags.Static|BindingFlags.NonPublic)
        .Invoke(null,new object[]{value});
    static void ResearchOnlyWrites(FeedbackStorage storage,string before,int first,int count)
    {
        Require(storage.Records.Count==first+count,"exact explicit research reconciliation write count");
        var previous=SaveFields(before);
        for(int i=first;i<storage.Records.Count;i++) {
            var next=SaveFields(storage.Records[i]);
            Require(Convert.ToInt64(next["revision"])==Convert.ToInt64(previous["revision"])+1,"research commits advance profile revision once");
            var priorResearch=(System.Collections.Generic.Dictionary<string,object>)previous["research"];
            var nextResearch=(System.Collections.Generic.Dictionary<string,object>)next["research"];
            foreach(string field in new[]{"revision","lastObservedUtcMilliseconds"}) {
                Require(Convert.ToInt64(nextResearch[field])>=Convert.ToInt64(priorResearch[field]),"research clocks/revisions never move backwards");
                priorResearch.Remove(field);nextResearch.Remove(field);
            }
            previous.Remove("revision");next.Remove("revision");
            Require(SaveFieldsJson(previous)==SaveFieldsJson(next),"research-only commits preserve every gameplay and research-benefit field");
            previous=SaveFields(storage.Records[i]);
        }
    }
    sealed class FeedbackResearchTime : ILastStandTime
    {
        public long UtcMilliseconds { get; set; }
        public double MonotonicSeconds => 0;
    }
    sealed class FeedbackFixture
    {
        public readonly TankPresentation Art;
        public readonly LastStandLoopController Loop;
        public EncounterSession Session => Loop.Session;
        public readonly FeedbackStorage Storage;
        readonly bool expectedLauncher;
        public double StartTimestamp { get; private set; } = 100;
        public FeedbackFixture(bool launcher = false, FeedbackStorage storage = null)
        {
            expectedLauncher=launcher; Storage = storage ?? new FeedbackStorage();
            LastStandLoopController.StorageFactory = () => Storage;
            EditorSceneManager.OpenScene(Playable, OpenSceneMode.Single);
            Art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Invoke(Art, "Start"); Invoke(Art.GetComponent<ArtHud>(), "Start");
            Loop = Art.GetComponent<LastStandLoopController>();
            // These checks advance combat time, not wall-time research. Keep
            // the real research coordinator on an independent fixed test clock.
            var research=new LastStandResearchCoordinator(Loop.Progression,new FeedbackResearchTime{
                UtcMilliseconds=Loop.Progression.ResearchSnapshot.lastObservedUtcMilliseconds});
            research.Confirmed+=()=>Session.GrantMaximumSpeed(Loop.Progression.MaximumGameSpeed);
            Field(Loop,"research",research);
            Require(research.Initialize(),"actual research owner initializes the isolated fixed clock");
            Field(Session, "focused", true);
            Invoke(Loop.Audio, "OnApplicationFocus", true);
            if (!Loop.Progression.HasCheckpoint && Loop.Progression.PendingDefeat==null &&
                Loop.Progression.SelectedFitting!=(launcher?"launcher":"repair")) Loop.MoveGarageFitting(1);
        }
        public void Deploy(double start = 100)
        {
            StartTimestamp=start; Loop.Deploy();
            Require(Session.Model != null && Session.Model.HasLauncher==expectedLauncher && Loop.Progression.ActiveRunId > 0, "real reserved deployment and selected fitting");
            Field(Session, "runClock", new LastStandRunClock(start, Session.Model.Profile.Horizon));
        }
        public void Advance(double timestamp)
        {
            // Synthetic model time and cue admission share one explicit test clock.
            Field(Loop.Audio, "CombatClock", (Func<double>)(()=>timestamp));
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
            var oracle=NaturalWaveDefeat(expectedLauncher);
            double target=Math.Max(timestamp,StartTimestamp+oracle.Tick*.05+.6);
            int budget=oracle.Tick/LastStandRunClock.MaximumStepsPerCallback+oracle.CompletedWave+8;
            for(int i=0;i<budget && (Loop.Phase=="battle" || Loop.Phase=="settling");i++)Advance(target);
            Require(Loop.Phase=="result" || Loop.Phase=="save-error", "actual natural wave defeat or durable-save refusal reached controller");
        }
    }
    static string WorkshopSave => "{\"version\":3,\"credits\":2,\"permanentLevels\":{\"cannonAttack\":0,\"launcherAttack\":0,\"hullCapacity\":0,\"armor\":0,\"cannonCycle\":0,\"fieldRepair\":0},\"nextRunId\":2,\"lastFinalizedRunId\":1,\"selectedTier\":1,\"tierRecords\":{\"tier-goals-v1\":{\"bestTicks1\":0,\"bestKills1\":0,\"bestTicks2\":0,\"bestKills2\":0,\"tierTwoUnlocked\":false}},\"pendingDefeat\":null}";
    static EncounterModel NaturalWaveDefeat(bool launcher)
    {
        var model=new EncounterModel(launcher,EncounterProfile.ForTier(1));
        while(model.Status==EncounterStatus.Running && model.Tick<100000) {
            model.Step();
            if(model.AwaitingWaveCommit && model.Status==EncounterStatus.Running)model.ContinueAfterCheckpoint();
        }
        Require(model.Status==EncounterStatus.Defeated,"bounded current authored fitting reaches a natural wave defeat");
        return model;
    }
    static int EarnedWaveSalvage(int completed)
    {
        int result=0;
        for(int wave=1;wave<=completed;wave++) {
            var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),wave);
            result+=reward.RepeatableSalvage+reward.FirstClearSalvage;
        }
        return result;
    }
    static void BackgroundDefeatSettlesOnce()
    {
        foreach(bool launcher in new[]{false,true}) {
            var oracle=NaturalWaveDefeat(launcher);
            var f=new FeedbackFixture(launcher);f.Deploy();int initialWrites=f.Storage.Writes,runId=f.Loop.Progression.ActiveRunId;
            f.Focus(false);f.Hidden(true);f.Defeat(300);
            int earned=EarnedWaveSalvage(oracle.CompletedWave),writes=f.Storage.Writes;
            Require(f.Loop.Phase=="result" && f.Session.Model==null && f.Loop.Progression.PendingDefeat==null &&
                !f.Loop.Progression.HasCheckpoint && f.Loop.Progression.FinalizedRunId==runId,
                "hidden wave defeat settles and invalidates its checkpoint without a new manual payout");
            Require(f.Loop.Progression.Wallet==earned && f.Loop.Progression.GetBestWave(1)==oracle.CompletedWave &&
                writes==initialWrites+oracle.CompletedWave+(oracle.AwaitingWaveCommit?0:1) &&
                f.Loop.Progression.CannonAttackLevel==0 && f.Loop.Progression.NextRunId==2,
                "exact completed-wave rewards and one durable write per boundary/finalization, with no automatic purchase or redeploy");
            string finished=f.Storage.Value;int records=f.Storage.Records.Count;
            f.Advance(1000);f.Hidden(false);f.Focus(true);f.Advance(1001);f.Loop.Claim();f.Loop.Claim();
            ResearchOnlyWrites(f.Storage,finished,records,2);writes+=2;
            Require(f.Storage.Writes==writes && f.Loop.Progression.Wallet==earned && f.Session.Model==null,
                "duplicate callbacks and Continue cannot award or add writes beyond two explicit research reconciliations");
            finished=f.Storage.Value;records=f.Storage.Records.Count;
            var reloaded=new FeedbackFixture(launcher,f.Storage);
            ResearchOnlyWrites(f.Storage,finished,records,2);writes+=2;
            Require(reloaded.Loop.Phase==(earned>0?"workshop":"garage") && reloaded.Session.Model==null &&
                !reloaded.Loop.Progression.HasCheckpoint && reloaded.Loop.Progression.Wallet==earned && reloaded.Storage.Writes==writes,
                "reload keeps earned waves without resurrecting the defeated run or a pending payout");

            var denied=new FeedbackFixture(launcher);denied.Deploy();string starting=denied.Storage.Value;
            denied.Storage.FailWrite=true;denied.Focus(false);denied.Defeat(300);
            Require(denied.Loop.Phase=="save-error" && denied.Session.CheckpointBlocked && denied.Session.Paused &&
                denied.Loop.Progression.HasCheckpoint && denied.Loop.Progression.Checkpoint.CompletedWave==0 &&
                denied.Loop.Progression.PendingDefeat==null && denied.Loop.Progression.Wallet==0 && denied.Storage.Value==starting,
                "failed first-wave checkpoint retains original durable state and exposes no unconfirmed reward");
            int deniedWrites=denied.Storage.Writes;denied.Advance(1000);denied.Advance(1100);
            Require(denied.Storage.Writes==deniedWrites && denied.Loop.Progression.Wallet==0,
                "blocked background callbacks never retry storage or award by themselves");
            denied.Storage.FailWrite=false;denied.Focus(true);denied.Loop.RetrySave();
            Require(denied.Loop.Phase=="battle" && denied.Session.Paused && !denied.Session.CheckpointBlocked &&
                denied.Loop.Progression.Checkpoint.CompletedWave==1 && denied.Loop.Progression.Wallet==EarnedWaveSalvage(1) &&
                denied.Storage.Writes==deniedWrites+1,"manual wave Retry confirms once and leaves an explicit Resume pause");
            string recovered=denied.Storage.Value;denied.Loop.RetrySave();denied.Advance(1200);
            Require(denied.Storage.Value==recovered && denied.Storage.Writes==deniedWrites+1,
                "repeated Retry and paused time cannot duplicate the recovered checkpoint reward");

            var terminalDenied=new FeedbackFixture(launcher);terminalDenied.Deploy();
            terminalDenied.Storage.BeforeWrite=()=>{if(terminalDenied.Session.Model?.Status==EncounterStatus.Defeated)
                terminalDenied.Storage.FailWrite=true;};
            terminalDenied.Focus(false);terminalDenied.Defeat(300);
            Require(terminalDenied.Loop.Phase=="save-error" && terminalDenied.Session.Model.Status==EncounterStatus.Defeated &&
                terminalDenied.Loop.Progression.HasCheckpoint && terminalDenied.Loop.Progression.PendingDefeat==null &&
                terminalDenied.Loop.Progression.Wallet==earned,"failed terminal finalization preserves already earned milestones and checkpoint");
            int terminalWrites=terminalDenied.Storage.Writes;terminalDenied.Advance(1000);
            Require(terminalDenied.Storage.Writes==terminalWrites,"terminal refusal also waits for manual retry");
            terminalDenied.Storage.BeforeWrite=null;terminalDenied.Storage.FailWrite=false;terminalDenied.Focus(true);
            terminalDenied.Loop.RetrySave();terminalDenied.Loop.RetrySave();
            Require(terminalDenied.Loop.Phase=="result" && terminalDenied.Session.Model==null &&
                !terminalDenied.Loop.Progression.HasCheckpoint && terminalDenied.Loop.Progression.PendingDefeat==null &&
                terminalDenied.Loop.Progression.Wallet==earned && terminalDenied.Storage.Writes==terminalWrites+1,
                "terminal Retry finalizes once without a second payout");

            var limit=new FeedbackFixture(launcher);limit.Deploy();int limitRun=limit.Loop.Progression.ActiveRunId;
            string checkpoint=limit.Storage.Value;int limitWrites=limit.Storage.Writes;
            // Explicit technical-ceiling fixture; ordinary waves have no timed horizon.
            typeof(EncounterModel).GetProperty(nameof(EncounterModel.Tick)).SetValue(limit.Session.Model,int.MaxValue-1024);
            limit.Advance(100.05);var frozen=limit.Session.Model.Snapshot();
            Require(limit.Session.Model.Status==EncounterStatus.Limit && limit.Loop.Progression.HasCheckpoint &&
                limit.Loop.Progression.ActiveRunId==limitRun && limit.Loop.Progression.PendingDefeat==null &&
                limit.Loop.Progression.Wallet==0 && limit.Storage.Value==checkpoint,
                "integer safety ceiling freezes without a false wave clear, payout or checkpoint replacement");
            limit.Advance(101);limit.Advance(300);
            Require(limit.Session.Model.Snapshot()==frozen && limit.Storage.Writes==limitWrites,
                "duplicate limit callbacks cannot step, award or write");
            records=limit.Storage.Records.Count;var reloadedLimit=new FeedbackFixture(launcher,limit.Storage);
            ResearchOnlyWrites(limit.Storage,checkpoint,records,2);limitWrites+=2;
            Require(reloadedLimit.Loop.Progression.HasCheckpoint && reloadedLimit.Loop.Progression.Checkpoint.CompletedWave==0 &&
                reloadedLimit.Loop.Progression.ActiveRunId==limitRun && reloadedLimit.Session.Model==null && reloadedLimit.Storage.Writes==limitWrites,
                "reload offers the last confirmed boundary, not a manufactured technical-limit reward");
            reloadedLimit.Loop.RequestConfirmation("abandon");reloadedLimit.Loop.ConfirmAction();reloadedLimit.Loop.ConfirmAction();
            Require(!reloadedLimit.Loop.Progression.HasCheckpoint && reloadedLimit.Loop.Progression.Wallet==0 &&
                reloadedLimit.Loop.Progression.NextRunId==2 && reloadedLimit.Storage.Writes==limitWrites+1,
                "explicit abandon invalidates the retained checkpoint once without salvage or redeploy");

            var failure=new FeedbackFixture(launcher);failure.Deploy();string saved=failure.Storage.Value;failure.Advance(double.NaN);
            Require(failure.Loop.Phase=="garage" && failure.Loop.Progression.PendingDefeat==null && failure.Loop.Progression.HasCheckpoint &&
                failure.Loop.Progression.Wallet==0 && failure.Session.Model==null && failure.Loop.Audio.Suspended && failure.Storage.Value==saved,
                "technical failure admits no award or cue and preserves the confirmed resumable boundary");
            var unfinished=new FeedbackFixture(launcher);unfinished.Deploy();int unfinishedWrites=unfinished.Storage.Writes;
            string unfinishedSave=unfinished.Storage.Value;records=unfinished.Storage.Records.Count;
            var resumed=new FeedbackFixture(launcher,unfinished.Storage);
            ResearchOnlyWrites(unfinished.Storage,unfinishedSave,records,2);unfinishedWrites+=2;
            Require(resumed.Loop.Progression.HasCheckpoint && resumed.Loop.Progression.Wallet==0 && resumed.Session.Model==null &&
                resumed.Storage.Writes==unfinishedWrites,"unfinished reload preserves the same run without an award or extra write");
            resumed.Loop.Deploy();
            Require(resumed.Session.Model!=null && resumed.Session.Model.HasLauncher==launcher && resumed.Session.Paused &&
                resumed.Session.Model.Tick==0 && resumed.Loop.Progression.ActiveRunId==1 && resumed.Storage.Writes==unfinishedWrites,
                "the real Resume control restores the saved fitting and boundary under explicit pause");
        }
        LegacyPendingFeedbackResults();
    }
    static void LegacyPendingFeedbackResults()
    {
        foreach(bool limit in new[]{false,true}) {
            int ticks=limit?3600:1200,reward=limit?0:1;
            string raw="{\"version\":3,\"credits\":0,\"permanentLevels\":{\"cannonAttack\":0,\"launcherAttack\":0,\"hullCapacity\":0,\"armor\":0,\"cannonCycle\":0,\"fieldRepair\":0},"+
                "\"nextRunId\":2,\"lastFinalizedRunId\":0,\"selectedTier\":1,\"tierRecords\":{\"tier-goals-v1\":{\"bestTicks1\":"+ticks+",\"bestKills1\":4,\"bestTicks2\":0,\"bestKills2\":0,\"tierTwoUnlocked\":true}},"+
                "\"pendingDefeat\":{\"runId\":1,\"elapsedTicks\":"+ticks+",\"kills\":4,\"reward\":"+reward+",\"tier\":1,\"profileVersion\":\"tier-goals-v1\",\"isLimit\":"+(limit?"true":"false")+",\"newBestTime\":true,\"newBestKills\":true,\"unlockedTierTwo\":true}}";
            var f=new FeedbackFixture(storage:new FeedbackStorage{Value=raw});int writes=f.Storage.Writes;
            Require(f.Loop.Phase=="result" && f.Loop.Progression.PendingDefeat!=null &&
                f.Loop.Progression.PendingDefeat.IsLimit==limit && f.Loop.Progression.Wallet==0 && f.Loop.Progression.GetBestWave(1)==0,
                "historical pending result migration preserves its exact manual reward without inventing wave clears");
            f.Loop.Claim();f.Loop.Claim();
            Require(f.Loop.Progression.PendingDefeat==null && f.Loop.Progression.Wallet==reward && f.Storage.Writes==writes+1 &&
                f.Session.Model==null && f.Loop.Progression.CannonAttackLevel==0 && !f.Loop.Progression.HasCheckpoint,
                "historical reward or zero-reward limit acknowledgement remains exactly once and never deploys");
            string claimed=f.Storage.Value;int records=f.Storage.Records.Count;
            var reload=new FeedbackFixture(storage:f.Storage);
            ResearchOnlyWrites(f.Storage,claimed,records,2);
            Require(reload.Loop.Progression.PendingDefeat==null && reload.Loop.Progression.Wallet==reward && reload.Storage.Writes==writes+3,
                "claimed historical result cannot reappear or pay again after reload");
        }
    }
    static void PauseExcludesSettlingTime()
    {
        foreach(bool launcher in new[]{false,true}) {
            var oracle=NaturalWaveDefeat(launcher);double end=100+oracle.Tick*.05;
            var f=new FeedbackFixture(launcher);f.Deploy();
            int budget=oracle.Tick/LastStandRunClock.MaximumStepsPerCallback+oracle.CompletedWave+8;
            for(int i=0;i<budget && f.Loop.Phase=="battle";i++)f.Advance(end);
            Require(f.Loop.Phase=="settling" && f.Session.Model.Tick==oracle.Tick && f.Session.TerminalElapsedSeconds<.01,
                "exact current wave model terminal boundary");
            end=Time.realtimeSinceStartupAsDouble;
            Field(f.Session,"runClock",new LastStandRunClock(end,oracle.Profile.Horizon));
            f.Loop.TogglePause();
            Require(f.Session.Paused && f.Loop.Audio.Suspended,"actual settling Pause action freezes lifecycle and audio");
            int writes=f.Storage.Writes,wallet=f.Loop.Progression.Wallet,records=f.Storage.Records.Count;string saved=f.Storage.Value;
            f.Focus(false);f.Hidden(true);f.Advance(end+10);f.Hidden(false);f.Focus(true);
            ResearchOnlyWrites(f.Storage,saved,records,2);writes+=2;
            Require(f.Session.Paused && f.Loop.Phase=="settling" && f.Session.TerminalElapsedSeconds<.1 && f.Storage.Writes==writes,
                "ten seconds away and focus return cannot clear explicit settling Pause");
            f.Session.TogglePauseAt(end+20);f.Advance(end+20.25);f.Advance(end+20.25);
            Require(f.Loop.Phase=="settling" && f.Session.TerminalElapsedSeconds<.35,
                "resume excludes paused wall time; duplicate cumulative elapsed is not charged twice");
            f.Advance(end+20.49);
            Require(f.Loop.Phase=="result" && f.Session.Model==null && f.Storage.Writes==writes && f.Loop.Progression.Wallet==wallet,
                "only new active elapsed completes .48 settling, without another award or durable write");
        }
    }
    [Serializable] sealed class HitObservation
    {
        public int tick,cannonDamage,firstFoeHull,kills;
    }
    static void AuthoritativeFirstHitSurvivesFeedbackSuppression()
    {
        foreach(int damage in new[]{20,30}) foreach(string mode in new[]{"delayed","hidden","debt"})
        {
            var f=new FeedbackFixture(storage:damage==30?new FeedbackStorage{Value=WorkshopSave}:null);
            if(damage==30)f.Loop.Purchase();
            f.Deploy();
            Require(f.Session.Model.Profile.IsWaveBased && f.Session.Model.CommittedCannonDamage==damage,
                "real current-wave deployment binds the purchased permanent damage");
            var hits=new System.Collections.Generic.List<HitObservation>();
            var cues=new System.Collections.Generic.List<LastStandAudioCue>();
            var played=new System.Collections.Generic.List<string>();
            Application.LogCallback observe=(message,stack,type)=>{
                if(message.StartsWith("ST_LS_HIT "))hits.Add(JsonUtility.FromJson<HitObservation>(message.Substring(10)));
                if(message.StartsWith("ST_ENC_CALLBACK ")) {
                    var cue=JsonUtility.FromJson<LastStandAudioCue>(message.Substring(16));
                    if(cue.action=="cue")cues.Add(cue);
                }
                if(message.StartsWith("ST_LS_AUDIO event="))played.Add(message);
            };
            Application.logMessageReceived+=observe;
            try {
                for(int tick=1;tick<=55;tick++)f.Advance(100+tick*.05);
                if(mode=="hidden"){f.Focus(false);f.Hidden(true);}
                double now=mode=="debt"?110:103.257;
                f.Advance(now);
                Require(f.Session.Model.Tick==(mode=="debt"?183:65),"actual bounded callback crosses the first cannon at60");
                Require(hits.Count>0 && hits[0].tick==60 && hits[0].cannonDamage==damage &&
                    hits[0].firstFoeHull==(damage==20?10:0) && hits[0].kills==(damage==20?0:1),
                    "authoritative first cannon hit survives suppressed "+mode+" feedback at damage "+damage);
                if(mode=="debt")f.Advance(now);
                var oracle=new EncounterModel(false,EncounterProfile.ForTier(1),damage);
                var expected=new System.Collections.Generic.List<HitObservation>();
                while(oracle.Tick<f.Session.Model.Tick) {
                    oracle.Step();
                    foreach(var evt in oracle.Events)if(evt.Kind==EncounterEventKind.Cannon)
                        expected.Add(new HitObservation{tick=oracle.Tick,cannonDamage=damage,firstFoeHull=oracle.Foes[0].Hull,kills=oracle.Kills});
                    if(oracle.AwaitingWaveCommit)oracle.ContinueAfterCheckpoint();
                }
                Require(hits.Count==expected.Count && f.Session.Model.CannonShots==expected.Count,
                    "exactly one authoritative observation per real cannon across bounded catch-up");
                for(int i=0;i<hits.Count;i++)Require(JsonUtility.ToJson(hits[i])==JsonUtility.ToJson(expected[i]),
                    "actual hit payload equals the independently stepped current model");
                Require(cues.Count==0 && played.Count==0 && !f.Art.flash.activeSelf &&
                    (float)typeof(TankPresentation).GetField("recoilTime",Private).GetValue(f.Art)==0,
                    "hit diagnostics never admit suppressed audio or replay recoil and flash");
                int count=hits.Count,tickBefore=f.Session.Model.Tick;
                f.Advance(now);if(mode=="hidden"){f.Hidden(false);f.Focus(true);}f.Advance(now);
                Require(hits.Count==count && f.Session.Model.Tick==tickBefore && cues.Count==0 && played.Count==0,
                    "zero-step and native-return callbacks never duplicate hits or replay cues");
            } finally {Application.logMessageReceived-=observe;}
        }
    }
    public static void RunHitObservation()
    {
        Debug.Log("ST_LS_BACKGROUND_COMPILED");
        bool failed=false;
        using(var preferencesScope=new LastStandTestPreferencesScope()) {
            var factory=LastStandLoopController.StorageFactory;bool background=Application.runInBackground;
            try {Check("test_authoritative_first_hit_survives_feedback_suppression",AuthoritativeFirstHitSurvivesFeedbackSuppression,ref failed);}
            finally {
                LastStandLoopController.StorageFactory=factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
                Application.runInBackground=background;
            }
        }
        if(failed)EditorApplication.Exit(1);
    }
    static void FocusRestoresCurrentCuesWithoutReplay()
    {
        var events = new System.Collections.Generic.List<string>();
        int combatAttempts = 0;
        Application.LogCallback observe = (message, stack, type) =>
        {
            if (message.StartsWith("ST_LS_AUDIO event=")) events.Add(message);
            if (message.StartsWith("ST_ENC_CALLBACK ") &&
                JsonUtility.FromJson<LastStandAudioCue>(message.Substring(16)).action=="cue") combatAttempts++;
        };
        Application.logMessageReceived += observe;
        try
        {
            var f = new FeedbackFixture(); f.Deploy(); events.Clear(); f.Advance(103);
            Require(f.Session.Model.Tick == 60 && f.Session.Model.CannonShots == 1, "actual long catch-up first cannon boundary");
            Require(events.Count == 0 && combatAttempts == 0,
                "long catch-up cannon and impact cues never enter controller audio dispatch or voices");
            Require((float)typeof(TankPresentation).GetField("recoilTime", Private).GetValue(f.Art) == 0 &&
                !f.Art.flash.activeSelf, "missed shot has no replay recoil or flash");
            f.Advance(103); Require(events.Count == 0, "duplicate return callback replays no cue");
            for (int i = 61; i <= 120; i++) f.Advance(100 + i * .05);
            Require(events.Contains("ST_LS_AUDIO event=cannon"), "next current foreground cannon reaches actual audio voice admission");
            var debt = new FeedbackFixture(); debt.Deploy(); events.Clear(); int beforeDebt = combatAttempts;
            debt.Advance(110);
            Require(debt.Session.Model.Tick == 128 && debt.Session.CatchingUp && events.Count == 0 && combatAttempts == beforeDebt,
                "first bounded catch-up callback retains debt without old audio dispatch");
            debt.Advance(110);
            Require(debt.Session.Model.Tick == 200 && !debt.Session.CatchingUp && events.Count == 0 && combatAttempts == beforeDebt,
                "final duplicate debt-draining callback remains silent through its final shot");
            debt.Advance(110);
            Require(events.Count == 0 && combatAttempts == beforeDebt, "zero-debt duplicate callback cannot replay a cue");
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
            var store = new FeedbackStorage { Value = WorkshopSave };
            var f = new FeedbackFixture(false, store);
            Require(f.Loop.Progression.SaveState=="ready" && Convert.ToInt32(SaveFields(store.Value)["version"])==5,
                "historical workshop migration finishes before the purchase fault is injected");
            int initialWrites=store.Writes;store.FailWrite=true;
            f.Loop.Audio.UnlockFromGesture("test-current-failed-purchase");
            // A ready current controller action reconciles the edit-mode
            // fixture's initial focus suspension without touching storage.
            f.Loop.ToggleMute(); f.Loop.ToggleMute();
            Require(f.Loop.Audio.CanPlay && f.Session.CanRun && !f.Session.Paused && !f.Loop.Muted,
                "failed-purchase fixture begins with actual eligible focused unlocked audio");
            string committed = store.Value;
            f.Loop.Purchase();
            Require(f.Loop.Progression.SaveState == "retry" && store.Value == committed && store.Writes == initialWrites + 1 &&
                f.Loop.Progression.CannonAttackLevel == 0 && f.Loop.Progression.Wallet == 2 &&
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
                store.Writes == initialWrites + 1 && store.Value == committed,
                "foreground return alone neither retries unconfirmed purchase nor replays its cue");
            store.FailWrite = false;
            f.Loop.RetrySave();
            Require(f.Loop.Progression.SaveState == "ready" && f.Loop.Progression.CannonAttackLevel == 1 &&
                f.Loop.Progression.Wallet == 0 && f.Loop.Progression.PendingDefeat == null &&
                f.Loop.Progression.ActiveRunId == 0 && f.Session.Model == null && store.Writes == initialWrites + 2,
                "manual retry confirms exactly one purchase transaction without automatic award or redeploy");
            Require(cues.Count == 1 && cues[0] == "ST_LS_AUDIO event=purchase" &&
                f.Loop.Audio.CanPlay && !f.Loop.Audio.Suspended,
                "confirmed current foreground retry purchase synchronizes admission before its one cue");
            string purchased = store.Value;
            var loaded = LastStandProgression.Load(store);
            Require(loaded.CannonAttackLevel == 1 && loaded.Wallet == 0 && loaded.PendingDefeat == null,
                "confirmed manual retry purchase persists the exact upgraded level and cost");
            f.Loop.RetrySave();
            Require(cues.Count == 1 && store.Writes == initialWrites + 2 && store.Value == purchased &&
                f.Loop.Progression.CannonAttackLevel == 1 && f.Loop.Progression.Wallet == 0 && f.Session.Model == null,
                "duplicate manual retry cannot replay a cue buy another level or start a run");

            var blockedStore = new FeedbackStorage { Value = WorkshopSave };
            var blocked = new FeedbackFixture(false, blockedStore);
            Require(blocked.Loop.Progression.SaveState=="ready" && Convert.ToInt32(SaveFields(blockedStore.Value)["version"])==5,
                "conflict fixture begins with a confirmed current workshop save");
            int blockedInitialWrites=blockedStore.Writes;string blockedCommitted=blockedStore.Value;
            blockedStore.FailWrite=true;
            blocked.Loop.Audio.UnlockFromGesture("test-current-conflicting-save");
            blocked.Loop.Purchase();
            Require(blocked.Loop.Progression.SaveState=="retry" && blockedStore.Value==blockedCommitted &&
                blockedStore.Writes==blockedInitialWrites+1,"purchase failure leaves the current committed record before conflict injection");
            blockedStore.Value = blockedCommitted.Replace("\"credits\":2", "\"credits\":3");
            Require(blockedStore.Value!=blockedCommitted,"conflict fixture changes actual current save bytes");
            int priorCues = cues.Count;
            blocked.Loop.RetrySave();
            Require(blocked.Loop.Progression.SaveState == "blocked" && blocked.Session.CanRun &&
                !blocked.Session.Paused && !blocked.Loop.Muted && blocked.Loop.Audio.Suspended && !blocked.Loop.Audio.CanPlay &&
                blocked.Loop.Progression.Wallet == 2 && blocked.Loop.Progression.CannonAttackLevel == 0 &&
                blocked.Loop.Progression.PendingDefeat == null && blocked.Session.Model == null && cues.Count == priorCues,
                "actual conflicting purchase save stays focused blocked silent and non-awarding");
            blocked.Loop.Audio.PlayPurchase();
            Require(cues.Count == priorCues && blockedStore.Writes == blockedInitialWrites + 1,
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
    static void CurrentCuePairExpiresIndependently()
    {
        var f=new FeedbackFixture();f.Deploy();
        var cues=new System.Collections.Generic.List<LastStandAudioCue>();
        var played=new System.Collections.Generic.List<string>();double now=100;
        Application.LogCallback observe=(message,stack,type)=>{
            if(message.StartsWith("ST_ENC_CALLBACK ")) {
                var cue=JsonUtility.FromJson<LastStandAudioCue>(message.Substring("ST_ENC_CALLBACK ".Length));
                if(cue.action=="cue")cues.Add(cue);
            }
            if(message.StartsWith("ST_LS_AUDIO event=")) {
                played.Add(message);
                if(message=="ST_LS_AUDIO event=cannon") Field(f.Loop.Audio,"CombatClock",(Func<double>)(()=>now+.501));
            }
        };
        Application.logMessageReceived+=observe;
        try {
            for(int i=1;i<=300 && f.Session.Model.CannonShots==0;i++){now=100+i*.05;f.Advance(now);}
            Require(f.Session.Model.CannonShots==1 && f.Session.Failure=="", "actual model and hit processing continue independently of cue suppression");
            Require(played.Count==1 && played[0]=="ST_LS_AUDIO event=cannon" && cues.Count==2 &&
                cues[0].played && cues[0].cue=="cannon" && !cues[1].played && cues[1].reason=="expired" &&
                cues[0].id==cues[1].id && cues[0].tick==cues[1].tick && cues[0].ordinal==1 && cues[1].ordinal==2,
                "real controller retains one played and one expired disposition at the actual shot boundary");
            Require(f.Session.PrepareCombatCue("defeat")==null,"ended callback cannot authorize replay");
        } finally { Application.logMessageReceived-=observe; }
    }
    static void TerminalCueIncludesPersistenceTime()
    {
        var store=new FeedbackStorage();var f=new FeedbackFixture(storage:store);f.Deploy();double now=100;
        var cues=new System.Collections.Generic.List<LastStandAudioCue>();bool played=false;
        store.BeforeWrite=()=>{if(f.Session.Model?.Status==EncounterStatus.Defeated)
            Field(f.Loop.Audio,"CombatClock",(Func<double>)(()=>now+.501));};
        Application.LogCallback observe=(message,stack,type)=>{
            if(message.StartsWith("ST_ENC_CALLBACK ")) {
                var cue=JsonUtility.FromJson<LastStandAudioCue>(message.Substring("ST_ENC_CALLBACK ".Length));
                if(cue.action=="cue" && cue.cue=="defeat")cues.Add(cue);
            }
            if(message=="ST_LS_AUDIO event=defeat")played=true;
        };
        Application.logMessageReceived+=observe;
        try {
            for(int i=1;i<20000 && f.Loop.Phase=="battle";i++){now=100+i*.05;f.Advance(now);}
            Require(f.Loop.Phase=="settling" && f.Loop.Progression.ActiveRunId==0 && !f.Loop.Progression.HasCheckpoint &&
                f.Session.Failure=="", "actual terminal persistence completes before feedback");
            Require(!played && cues.Count==1 && !cues[0].played && cues[0].reason=="expired",
                "terminal storage time cannot admit a stale defeat cue or erase its explicit disposition");
        } finally { Application.logMessageReceived-=observe; }
    }
    public static void RunCueAdmission()
    {
        Debug.Log("ST_LS_BACKGROUND_COMPILED");
        bool failed=false;
        using(var preferencesScope=new LastStandTestPreferencesScope()) {
            var factory=LastStandLoopController.StorageFactory;
            try {
                Check("test_current_cue_pair_expires_independently",CurrentCuePairExpiresIndependently,ref failed);
                Check("test_terminal_cue_includes_persistence_time",TerminalCueIncludesPersistenceTime,ref failed);
            } finally {
                LastStandLoopController.StorageFactory=factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            }
        }
        if(failed)EditorApplication.Exit(1);
    }
    public static void RunFeedback()
    {
        Debug.Log("ST_LS_BACKGROUND_COMPILED");
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
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
        }
        if (failed) EditorApplication.Exit(1);
    }
}
