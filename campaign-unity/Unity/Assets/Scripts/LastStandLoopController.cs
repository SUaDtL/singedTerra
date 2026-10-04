using System;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    // Present only on the dedicated playable scene. The review scene remains non-awarding.
    public sealed class LastStandLoopController : MonoBehaviour
    {
        // Editor checks substitute a disposable record without touching a player's local save.
#if UNITY_EDITOR
        public static Func<ILastStandStorage> StorageFactory = () => new LastStandStore();
#endif
        public LastStandProgression Progression { get; private set; }
        public string Phase { get; private set; } = "garage";
        public string Notice { get; private set; } = "";
        public EncounterSession Session { get; private set; }
        public LastStandAudio Audio { get; private set; }
        public bool Muted => Audio && Audio.Muted;
        TankPresentation art;
        ArtHud artHud;
        LastStandLoopHud hud;
        float settle;
        int heardTick = -1;
        bool purchasePending;
        public event Action Changed;

        public void Initialize(TankPresentation presentation, EncounterSession session, ArtHud sharedHud, Canvas canvas, Font font)
        {
            art = presentation; Session = session; artHud = sharedHud;
#if UNITY_EDITOR
            Progression = LastStandProgression.Load(StorageFactory());
#else
            Progression = LastStandProgression.Load(new LastStandStore());
#endif
            Audio = gameObject.AddComponent<LastStandAudio>();
            Audio.Initialize();
            hud = new LastStandLoopHud(this, canvas, font);
            session.Changed += OnSessionChanged;
            artHud.SetPlayableVisible();
            Phase = Progression.PendingDefeat != null ? "result" : Progression.Wallet > 0 ? "workshop" : "garage";
            if (Progression.SaveState != "ready") Notice = Progression.SaveError;
            Refresh("ready");
        }

        public void Deploy()
        {
            if (Phase != "garage" && Phase != "workshop") return;
            if (!Session.CanRun) { Notice = "Return to this tab before deploying."; Refresh("focus-required"); return; }
            if (!Progression.TryDeploy()) { Notice = Progression.SaveError ?? "Deploy is unavailable."; Refresh("save-error"); return; }
            StartReservedRun();
        }

        void StartReservedRun()
        {
            if (Progression.ActiveRunId == 0) return;
            Audio.UnlockFromGesture("deploy");
            Session.Deploy();
            if (Session.Model == null)
            {
                Progression.AbandonRun();
                Notice = "Unable to enter the battlefield. Try Deploy again.";
                Refresh("deploy-failed");
                return;
            }
            Phase = "battle"; Notice = ""; heardTick = -1;
            Refresh("deploy");
        }

        void OnSessionChanged()
        {
            if (Progression == null || Session == null) return;
            var model = Session.Model;
            Audio.SetSuspended(Session.Paused || !Session.CanRun || Session.Failure != "");
            if (Phase == "battle" && model != null)
            {
                if (Session.Failure != "")
                {
                    Progression.AbandonRun(); Session.ReturnToInspection();
                    Phase = "garage"; Notice = "This run stopped because of a technical problem. No salvage was awarded.";
                    Refresh("technical-failure"); return;
                }
                if (!Session.Paused && model.Tick != heardTick)
                {
                    heardTick = model.Tick;
                    foreach (var evt in model.Events)
                    {
                        Audio.PlayEvent(evt.Kind, evt.Amount, model.Foes[evt.Slot < 0 ? 0 : evt.Slot].Alive);
                        if (evt.Kind == EncounterEventKind.Cannon)
                            Debug.Log("ST_LS_HIT " + JsonUtility.ToJson(new HitState { tick = model.Tick, cannonDamage = model.CommittedCannonDamage,
                                firstFoeHull = model.Foes[0].Hull, kills = model.Kills }));
                    }
                }
                if (model.Status == EncounterStatus.Defeated)
                {
                    if (!Progression.TryStageDefeat(model.Tick, model.Kills))
                    {
                        Notice = Progression.SaveError ?? "Could not save the defeat. Retry the save.";
                        Phase = "save-error"; Refresh("save-error"); return;
                    }
                    settle = .48f;
                    Phase = "settling"; Audio.PlayDefeat(); Refresh("defeat-staged"); return;
                }
                if (model.Status == EncounterStatus.Limit)
                {
                    Progression.TryStageNonDefeat(); Session.ReturnToInspection();
                    Phase = "garage"; Notice = "Run limit reached. No salvage was awarded.";
                    Refresh("limit"); return;
                }
            }
            Refresh("session");
        }

        void Update()
        {
            if (Phase != "settling") return;
            if (!Session.CanRun || Session.Paused) return;
            settle -= Mathf.Min(Time.unscaledDeltaTime, .1f);
            if (settle > 0) return;
            Session.ReturnToInspection();
            Phase = "result"; Refresh("result");
        }
        void LateUpdate() { hud?.Layout(); }

        public void Claim()
        {
            if (Phase != "result" || Progression.PendingDefeat == null) return;
            if (!Progression.TryClaim()) { Notice = Progression.SaveError ?? "Claim is unavailable."; Refresh("save-error"); return; }
            Phase = "workshop"; Notice = "1 salvage claimed. Choose your next fitting."; Refresh("claim");
        }

        public void Purchase()
        {
            if (Phase != "workshop") return;
            Audio.UnlockFromGesture("purchase");
            if (!Progression.TryPurchase())
            {
                purchasePending = Progression.SaveState != "ready";
                Notice = Progression.SaveError ?? (Progression.NextCost == 0 ? "Cannon Attack is fully upgraded." : "Not enough salvage yet.");
                Refresh("purchase-unavailable"); return;
            }
            purchasePending = false;
            Audio.PlayPurchase(); Notice = "Cannon Attack upgraded and saved."; Refresh("purchase");
        }

        public void Redeploy() { Deploy(); }
        public void RetrySave()
        {
            bool hadPending = Progression.PendingDefeat != null;
            string priorPhase = Phase;
            int priorLevel = Progression.CannonAttackLevel;
            if (!Progression.Retry()) { Notice = Progression.SaveError; Refresh("save-error"); return; }
            if (purchasePending && Progression.CannonAttackLevel > priorLevel)
            {
                Audio.UnlockFromGesture("retry-purchase"); Audio.PlayPurchase();
            }
            purchasePending = false;
            Notice = "Save confirmed.";
            if (Progression.ActiveRunId != 0 && Session.Model == null) { StartReservedRun(); return; }
            if (Progression.PendingDefeat != null)
            {
                if (Session.Model != null) Session.ReturnToInspection();
                Phase = "result";
            }
            else if (hadPending && Progression.PendingDefeat == null && priorPhase == "result") Phase = "workshop";
            else if (Phase == "save-error") Phase = "garage";
            Refresh("save-recovered");
        }
        public void TogglePause() { if (Phase == "battle") Session.TogglePause(); }
        public void ToggleMute() { Audio.ToggleMute(); Refresh("mute"); }
        void OnApplicationFocus(bool active) { if (!active && Audio) Audio.SetSuspended(true); }
        void OnApplicationPause(bool active) { if (active && Audio) Audio.SetSuspended(true); }
        void OnDestroy() { if (Session) Session.Changed -= OnSessionChanged; hud?.Dispose(); }

        void Refresh(string action)
        {
            if (hud == null) return;
            Audio.SetSuspended(Session.Paused || !Session.CanRun);
            hud.Refresh(); Changed?.Invoke();
            Debug.Log("ST_LS_STATE " + JsonUtility.ToJson(new State { action = action, phase = Phase,
                saveState = Progression.SaveState, saveError = Progression.SaveError ?? "", notice = Notice,
                wallet = Progression.Wallet, level = Progression.CannonAttackLevel, nextCost = Progression.NextCost,
                cannonDamage = Session.Model?.CommittedCannonDamage ?? Progression.CannonDamage,
                runId = Progression.ActiveRunId, pendingRunId = Progression.PendingDefeat?.RunId ?? 0,
                tick = Session.Model?.Tick ?? 0, hull = Session.Model?.Hull ?? 120, kills = Session.Model?.Kills ?? 0,
                paused = Session.Paused, muted = Muted }));
        }
        [Serializable] sealed class State
        {
            public string action, phase, saveState, saveError, notice;
            public int wallet, level, nextCost, cannonDamage, runId, pendingRunId, tick, hull, kills;
            public bool paused, muted;
        }
        [Serializable] sealed class HitState { public int tick, cannonDamage, firstFoeHull, kills; }
    }
}
