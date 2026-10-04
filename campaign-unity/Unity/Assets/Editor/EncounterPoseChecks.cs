using System;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.Encounter;

// Uses the actual imported hierarchy and runtime yaw calculation, not a substitute model.
public static class EncounterPoseChecks
{
    // Focused batch entry: -executeMethod EncounterPoseChecks.CheckTerminalFeedback
    // Uses the saved tank and real session/view; never saves the opened scene.
    public static void CheckTerminalFeedback()
    {
        EditorSceneManager.OpenScene(VisualReviewBuild.ScenePath, OpenSceneMode.Single);
        var art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        Invoke(art, "Start");
        float elapsed = Mathf.Min(Time.unscaledDeltaTime, .05f);
        Require(elapsed > 0, "editor supplies elapsed presentation time");
        foreach (bool launcher in new[] { false, true }) CheckTerminalFeedback(art, launcher, elapsed);
        Debug.Log("ST_ENC_TERMINAL_SHOT_PASS actual tank recoil/flash; frozen combat/loadout; pause/focus/application guards; return/redeploy; both fittings");
    }

    static void CheckTerminalFeedback(TankPresentation art, bool launcher, float elapsed)
    {
        var host = new GameObject("TerminalShotCheck");
        var session = host.AddComponent<EncounterSession>();
        var view = host.AddComponent<EncounterView>();
        Vector3 home = art.barrel.localPosition;
        try
        {
            view.Initialize(art);
            Field(session, "art", art);
            typeof(EncounterSession).GetProperty(nameof(EncounterSession.View)).SetValue(session, view);
            Field(session, "focused", true);
            if (art.showingLauncher != launcher) art.ToggleAttachment();
            Require(art.BeginEncounter(), "begin fitting " + launcher);
            var model = new EncounterModel(launcher, EncounterProfile.VisualReview);
            Field(session, "model", model);
            art.PlayEncounterShot(art.tank.position + Vector3.forward * 10);
            Invoke(art, "Update");
            Require(art.flash.activeSelf && Vector3.Distance(home, art.barrel.localPosition) > .00001f,
                "real player shot has visible flash and recoil");

            session.TogglePause();
            Hold(session, art, "active user pause");
            Invoke(session, "OnApplicationFocus", false);
            Invoke(art, "OnApplicationFocus", false);
            Hold(session, art, "active focus loss");
            Invoke(session, "OnApplicationFocus", true);
            Invoke(art, "OnApplicationFocus", true);
            Hold(session, art, "focus return requires explicit resume");
            session.TogglePause();

            int terminalTick = launcher ? 1647 : 1557;
            while (model.Tick < terminalTick - 1) model.Step();
            Require(model.Status == EncounterStatus.Running, "retained pre-defeat fixture");
            art.PlayEncounterShot(art.tank.position + Vector3.forward * 10);
            Invoke(art, "Update");
            Field(session, "accumulated", .05);
            Invoke(session, "Update");
            Require(model.Status == EncounterStatus.Defeated && art.EncounterPaused,
                "actual terminal transition freezes combat presentation");
            string terminal = model.Snapshot();
            Quaternion turret = art.turret.localRotation;
            Vector3 camera = art.view.transform.position;

            Invoke(session, "OnApplicationFocus", false);
            Invoke(art, "OnApplicationFocus", false);
            Hold(session, art, "terminal focus loss");
            Invoke(session, "OnApplicationPause", true);
            Invoke(art, "OnApplicationPause", true);
            Invoke(session, "OnApplicationFocus", true);
            Invoke(art, "OnApplicationFocus", true);
            Hold(session, art, "terminal application pause despite focus return");
            Invoke(session, "OnApplicationPause", false);
            Invoke(art, "OnApplicationPause", false);

            int frames = Mathf.CeilToInt(1f / elapsed) + 2;
            for (int frame = 0; frame < frames; frame++)
            {
                Invoke(session, "Update"); Invoke(art, "Update");
                Require(model.Snapshot() == terminal && art.EncounterActive &&
                    art.showingLauncher == launcher && art.turret.localRotation == turret &&
                    art.view.transform.position == camera, "terminal drain preserves combat, fitting, aim and camera");
            }
            Require(!art.flash.activeSelf && Vector3.Distance(home, art.barrel.localPosition) < .00001f,
                "terminal player shot must finish flash and return barrel home; fitting=" + launcher +
                " flash=" + art.flash.activeSelf + " barrelOffset=" + Vector3.Distance(home, art.barrel.localPosition));

            session.ReturnToInspection();
            Require(!art.EncounterActive && !art.flash.activeSelf && art.barrel.localPosition == home,
                "inspection clears shot transients");
            session.Deploy();
            art.PlayEncounterShot(art.tank.position + Vector3.forward * 10);
            Invoke(art, "Update");
            Require(!art.EncounterPaused && art.flash.activeSelf && art.barrel.localPosition != home,
                "redeploy restores active shot timing");
            session.ReturnToInspection();
        }
        finally
        {
            art.EndEncounter();
            // Avoid the runtime owner's deferred Destroy path in an edit-mode check.
            typeof(EncounterSession).GetProperty(nameof(EncounterSession.View)).SetValue(session, null);
            UnityEngine.Object.DestroyImmediate(host);
        }
    }

    static void Hold(EncounterSession session, TankPresentation art, string reason)
    {
        string model = session.Model.Snapshot();
        Vector3 barrel = art.barrel.localPosition;
        bool flash = art.flash.activeSelf;
        for (int i = 0; i < 4; i++) { Invoke(session, "Update"); Invoke(art, "Update"); }
        Require(session.Model.Snapshot() == model && art.barrel.localPosition == barrel &&
            art.flash.activeSelf == flash, reason + " holds combat and player shot");
    }

    static void Field(object owner, string name, object value) =>
        owner.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(owner, value);

    static void Invoke(object owner, string name, params object[] args) =>
        owner.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.DeclaredOnly)
            .Invoke(owner, args);

    static void Require(bool value, string message)
    { if (!value) throw new InvalidOperationException("Terminal shot check failed: " + message); }

    public static void Run()
    {
        var art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        if (!art) throw new InvalidOperationException("Saved tank scene required for pose checks");
        var turret = art.turret;
        Quaternion homeLocal = turret.localRotation, homeWorld = turret.rotation;
        Vector3 localUp = turret.InverseTransformDirection(Vector3.up);
        Vector3 forward = Vector3.ProjectOnPlane(art.muzzle.position-art.barrel.position,Vector3.up).normalized;
        try
        {
            for (int lane=0; lane<8; lane++)
            {
                float radians=lane*Mathf.PI/4;
                Vector3 target=new Vector3(Mathf.Sin(radians),0,Mathf.Cos(radians));
                turret.localRotation=Quaternion.Inverse(turret.parent.rotation)*TankPresentation.EncounterWorldYaw(homeWorld,forward,target);
                Vector3 aimed=Vector3.ProjectOnPlane(art.muzzle.position-art.barrel.position,Vector3.up).normalized;
                if (Vector3.Dot(turret.TransformDirection(localUp).normalized,Vector3.up)<.9999f)
                    throw new InvalidOperationException("Encounter turret flips at lane "+lane);
                if (Vector3.Dot(aimed,target)<.9999f)
                    throw new InvalidOperationException("Encounter cannon misses heading at lane "+lane);
            }
        }
        finally { turret.localRotation=homeLocal; }
        Debug.Log("ST_ENC_POSE_PASS eight actual imported-tank headings; upright and cannon-aligned");
    }
}
