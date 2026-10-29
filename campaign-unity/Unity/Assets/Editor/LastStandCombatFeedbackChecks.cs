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
using SingedTerra.LastStand;

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
        public Fixture(bool launcher = false,string fitting=null)
        {
            EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity", OpenSceneMode.Single);
            Art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Review = Art.GetComponent<BattlefieldReview>();
            Require(Review && Review.flashMaterial && Review.scorchMaterial, "saved review assets exist");
            Invoke(Art, "Start");
            if (Art.showingLauncher != launcher) Art.ToggleAttachment();
            if(fitting!=null)Require(Art.TrySelectFitting(fitting),"actual selected attachment: "+fitting);
            host = new GameObject("Combat feedback check");
            View = host.AddComponent<EncounterView>(); View.Initialize(Art);
            Require(Art.BeginEncounter(), "actual presentation starts");
        }
        public Renderer[] Feedback => host.GetComponentsInChildren<Renderer>()
            .Where(r => r.name.StartsWith("Review feedback ")).ToArray();
        public Renderer[] VehiclePaint => host.GetComponentsInChildren<Renderer>()
            .Where(r => !r.name.StartsWith("Review feedback ") && !(r is LineRenderer)).ToArray();
        public LineRenderer[] Trails => host.GetComponentsInChildren<LineRenderer>(true).Where(r=>r.name.StartsWith("EncounterTracer_")).ToArray();
        public Transform Pool => host.transform.Find("Review combat visuals");
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

    static void SetField(object target,string name,object value)
    { target.GetType().GetField(name,Private).SetValue(target,value); }
    static void SetFoe(EncounterFoe foe,int id,FoeKind kind,int lane,int distance)
    {
        foreach(var pair in new (string,object)[]{("Id",id),("Kind",kind),("Lane",lane),("Distance",distance),("Hull",1000),("MaximumHull",1000),("Damage",1)})
            typeof(EncounterFoe).GetProperty(pair.Item1).SetValue(foe,pair.Item2);
    }
    static EncounterModel BoundModel(LastStandFitting fitting)
    {
        var model=new EncounterModel(fitting,EncounterProfile.ForTier(2));
        SetField(model,"nextSpawn",10000);SetField(model,"nextCannon",10000);SetField(model,"nextRepair",10000);
        return model;
    }
    static void CurrentGeometryAndRetainedPosition()
    {
        using(var f=new Fixture())
        {
            var legacy=new EncounterModel(false,EncounterProfile.VisualReview);
            SetFoe(legacy.Foes[0],3,FoeKind.Close,2,17000);f.View.Render(legacy);
            float angle=2*Mathf.PI/4+(1.5f-2)*.42f;
            var old=f.Art.tank.position+new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*17+Vector3.up*.85f;
            Require(Vector3.Distance(old,f.View.Position(legacy.Foes[0]))<.00001f,"legacy authored coordinates are unchanged");
            var current=BoundModel(LastStandFitting.Repair);
            for(int lane=0;lane<8;lane++)for(int id=1;id<=4;id++)
            {
                SetFoe(current.Foes[0],id,FoeKind.Close,lane,17001);
                // Actual session order presents each step before the next render.
                f.View.Present(current);
                var point=EncounterGeometry.Position(lane,id,17001);
                var expected=f.Art.tank.position+new Vector3(point.X*.001f,.85f,point.Z*.001f);
                Require(Vector3.Distance(expected,f.View.Position(current.Foes[0]))<.00001f,"current presentation uses exact model blast coordinates before Render");
                f.View.Render(current);Require(Vector3.Distance(expected,f.View.Position(current.Foes[0]))<.00001f,"render and impact positions agree");
            }
            f.View.Render(legacy);Require(Vector3.Distance(old,f.View.Position(legacy.Foes[0]))<.00001f,"legacy run after current restores original coordinates");
        }
    }
    static void CampaignWeaponFeedback()
    {
        foreach(string id in new[]{"mortar","railgun"})foreach(bool reduced in new[]{false,true})
        using(var f=new Fixture(false,id))
        {
            var fitting=LastStandFittingCatalog.Parse(id);var model=BoundModel(fitting);
            SetFoe(model.Foes[0],5,FoeKind.ArmoredBrute,0,18500);
            SetFoe(model.Foes[1],1,FoeKind.ArmoredBrute,0,18000);
            model.Step();var actions=model.Events.Where(e=>e.Kind.ToString().ToLowerInvariant()==id).ToArray();
            Require(actions.Length==(id=="mortar"?2:1)&&actions.All(e=>e.AimSlot==1),"actual model selects later slot as one shot centre");
            string before=model.Snapshot();var module=f.Art.ActiveFittingModule;
            var assembly=module.transform.Find(id=="mortar"?"Mortar recoil assembly":"Railgun recoil assembly");
            Require(assembly,"actual mechanical recoil assembly");var home=assembly.localPosition;var mount=module.transform.localRotation;
            if(reduced)f.View.ToggleEffects();
            f.View.Present(model);var firingOrigin=f.Art.FittingMuzzle(fitting);f.ShotFrame(.04f);
            var target=f.View.Position(model.Foes[1]);var direction=Vector3.ProjectOnPlane(target-module.transform.position,Vector3.up);
            Require(Vector3.Angle(direction,module.transform.forward)<.1f&&Vector3.Distance(home,assembly.localPosition)>.00001f,"actual auxiliary aim and recoil remain visible");
            var trails=f.Trails.Where(t=>t.enabled).ToArray();
            Require(trails.Length==(reduced?0:1),"one firing visual per shot, independent of blast victim count");
            if(!reduced)
            {
                Require(Vector3.Distance(trails[0].GetPosition(0),firingOrigin)<.00001f,"shot starts at actual mounted muzzle before recoil");
                Require(Vector3.Distance(trails[0].GetPosition(trails[0].positionCount-1),target)<.00001f,"shot visual ends at actual AimSlot centre");
                Require((trails[0].positionCount>2)==(id=="mortar"),"mortar arc differs from railgun straight beam");
            }
            Require(f.Feedback.Length>=actions.Length&&!f.Feedback.Any(r=>Vector3.Distance(r.transform.position,f.Art.tank.position+Vector3.up)<.01f),"outgoing armament cannot masquerade as incoming tank damage");
            Require(model.Snapshot()==before,"weapon feedback cannot mutate combat");
            f.Art.ClearEncounterFeedback();Require(assembly.localPosition==home,"clear cancels auxiliary recoil");
            f.Art.EndEncounter();Require(module.transform.localRotation==mount,"return restores owned mounting pose");
        }
    }
    static void RoleSilhouettesAndPersistentWarning()
    {
        using(var f=new Fixture())
        {
            var model=BoundModel(LastStandFitting.Repair);
            for(int slot=0;slot<5;slot++)SetFoe(model.Foes[slot],slot+1,(FoeKind)slot,slot,18000);
            typeof(EncounterFoe).GetField("NextAttack",Private).SetValue(model.Foes[4],30);
            string before=model.Snapshot();f.View.Render(model);f.ShotFrame(0);
            var silhouettes=new HashSet<Vector3Int>();
            for(int slot=0;slot<5;slot++)
            {
                var root=f.Pool.Find("Review foe "+slot);
                var vertices=root.GetComponentsInChildren<MeshFilter>().SelectMany(m=>m.sharedMesh.vertices.Select(v=>root.InverseTransformPoint(m.transform.TransformPoint(v)))).ToArray();
                Require(vertices.Length>0,"role has real rendered mesh geometry");var bounds=new Bounds(vertices[0],Vector3.zero);
                foreach(var point in vertices)bounds.Encapsulate(point);
                silhouettes.Add(new Vector3Int(Mathf.RoundToInt(bounds.size.x*1000),Mathf.RoundToInt(bounds.size.y*1000),Mathf.RoundToInt(bounds.size.z*1000)));
            }
            Require(silhouettes.Count==5,"all five roles have distinguishable geometric silhouettes");
            var warning=f.Pool.Find("Review foe 4/Elite attack warning");
            Require(model.TelegraphRemainingTicks(model.Foes[4])==30&&warning&&warning.gameObject.activeInHierarchy,"model telegraph has persistent visible warning geometry");
            f.Art.SetEncounterPaused(true);f.View.ToggleEffects();f.ShotFrame(0);
            Require(warning.gameObject.activeInHierarchy&&warning.GetComponent<LineRenderer>().enabled,"paused reduced mode retains non-color warning shape");
            f.View.ToggleEffects();Require(warning.gameObject.activeInHierarchy,"full effects toggle does not replay or remove warning");
            Require(model.Snapshot()==before,"role and warning projection cannot mutate combat");
            typeof(EncounterFoe).GetField("NextAttack",Private).SetValue(model.Foes[4],31);f.View.Render(model);
            Require(!warning.gameObject.activeInHierarchy,"warning cannot start before the model telegraph window");
            typeof(EncounterFoe).GetField("NextAttack",Private).SetValue(model.Foes[4],30);f.View.Render(model);
            Require(warning.gameObject.activeInHierarchy,"a later admitted telegraph returns the warning");
            typeof(EncounterFoe).GetProperty("Hull").SetValue(model.Foes[4],0);f.View.Render(model);
            Require(!warning.gameObject.activeInHierarchy,"death cancels warning immediately");
            SetFoe(model.Foes[4],41,FoeKind.Close,1,18000);f.View.Render(model);
            Require(!warning.gameObject.activeInHierarchy,"slot reuse cannot inherit elite warning");
            f.View.Clear();Require(!f.Pool.gameObject.GetComponentsInChildren<Renderer>().Any(),"clear hides warning and every role");
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
                ("test_model_and_pool_preservation", ModelAndPoolPreservation),
                ("test_current_geometry_and_retained_position",CurrentGeometryAndRetainedPosition),
                ("test_campaign_weapon_feedback",CampaignWeaponFeedback),
                ("test_role_silhouettes_and_persistent_warning",RoleSilhouettesAndPersistentWarning) })
            {
                try { test.Item2(); Debug.Log("ST_LS_COMBAT_PASS " + test.Item1); }
                catch (Exception error) { failed = true; Debug.LogError("ST_LS_COMBAT_FAIL " + test.Item1 + " " + error); }
            }
            Application.runInBackground = background;
        }
        if (failed) EditorApplication.Exit(1);
    }
}
