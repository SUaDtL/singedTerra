using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.VisualReview;

// Saved-scene behavioral checks. Browser input, lifecycle, rendered workmanship and
// owner acceptance remain separate evidence; this never declares those passed.
public static class VisualReviewChecks
{
    [Serializable] sealed class Receipt { public string scene; public string[] checks; }
    static void Require(bool value, string name)
    { if (!value) throw new InvalidOperationException("Visual review scene check failed: " + name); }

    public static void Run()
    {
        var scene = SceneManager.GetActiveScene();
        var before = RuntimeOwners(scene);
        Require(before.All(pair => pair.Value.Length == 0),
            "saved authoring scene contains runtime-owned components: " + OwnerCounts(before));
        Receipt receipt;
        try { receipt = RunSceneChecks(); }
        finally
        {
            var after = RuntimeOwners(scene);
            Require(before.All(pair => pair.Value.SequenceEqual(after[pair.Key])),
                "checks changed authoring-scene runtime owners; before " + OwnerCounts(before) +
                "; after " + OwnerCounts(after));
        }
        receipt.checks = new[] { "saved authoring scene contains no serialized runtime owners" }
            .Concat(receipt.checks).Concat(new[] { "checks leave authoring-scene runtime owners unchanged" }).ToArray();
        Debug.Log("ST_VIS_SCENE_PASS " + JsonUtility.ToJson(receipt));
        Debug.Log("ST_VIS_CHECKS_PASS editor model and saved-scene checks; browser and owner review remain separate");
    }

    static int[] OwnerIds<T>(Scene scene) where T : Component
    {
        return UnityEngine.Object.FindObjectsByType<T>(FindObjectsInactive.Include, FindObjectsSortMode.None)
            .Where(owner => owner.gameObject.scene == scene).Select(owner => owner.GetInstanceID()).OrderBy(id => id).ToArray();
    }

    static Dictionary<string, int[]> RuntimeOwners(Scene scene)
    {
        return new Dictionary<string, int[]> {
            { nameof(EncounterSession), OwnerIds<EncounterSession>(scene) },
            { nameof(EncounterView), OwnerIds<EncounterView>(scene) },
            { nameof(EncounterHud), OwnerIds<EncounterHud>(scene) },
            { nameof(TankPartCallouts), OwnerIds<TankPartCallouts>(scene) },
            { nameof(Canvas), OwnerIds<Canvas>(scene) },
            { nameof(EventSystem), OwnerIds<EventSystem>(scene) }
        };
    }

    static string OwnerCounts(Dictionary<string, int[]> owners)
    { return string.Join(", ", owners.Select(pair => pair.Key + "=" + pair.Value.Length)); }

    static void InvokeLifecycle<T>(T component, string name) where T : MonoBehaviour
    {
        // SendMessage broadcasts to every component on the GameObject: invoking
        // TankPresentation.Start that way also ran ArtHud.Start and authored its
        // runtime objects into the scene. Invoke only the declared exact method.
        var method = typeof(T).GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.DeclaredOnly);
        Require(method != null && method.ReturnType == typeof(void) && method.GetParameters().Length == 0,
            "exact lifecycle method exists: " + typeof(T).Name + "." + name);
        method.Invoke(component, null);
    }

    static Receipt RunSceneChecks()
    {
        var model = VisualReviewModelChecks.Run();
        Debug.Log("ST_VIS_MODEL_PASS " + JsonUtility.ToJson(model));
        var checks = new List<string>();
        var presentations = UnityEngine.Object.FindObjectsByType<TankPresentation>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        var reviews = UnityEngine.Object.FindObjectsByType<BattlefieldReview>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        Require(presentations.Length == 1 && reviews.Length == 1, "one tank presentation and one review adapter");
        var art = presentations[0]; var review = reviews[0]; var camera = art.view;
        Require(art.gameObject == review.gameObject && art.gameObject.scene.name == "BattlefieldReview",
            "review adapts the existing owner in the separately named scene");
        Require(art.GetComponents<ArtHud>().Length == 1 &&
            UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length == 1,
            "one saved HUD owner and camera");
        Require(review.ashEnvironment && review.ironEnvironment && review.ashEnvironment != review.ironEnvironment &&
            review.closeVehicle && review.rangedVehicle && review.closeVehicle != review.rangedVehicle &&
            review.sun && review.flashMaterial && review.dustMaterial && review.scorchMaterial && review.effectQuad,
            "both environment and vehicle treatments have complete asset references");
        foreach (var environment in new[] { review.ashEnvironment, review.ironEnvironment })
            Require(environment.GetComponentsInChildren<Collider>(true).Length == 0,
                environment.name + " scenery has no colliders");
        checks.Add("separate review scene with one presentation, camera and HUD owner");
        checks.Add("complete distinct environment and foe references without gameplay colliders");

        var cameraPosition = camera.transform.position; var cameraRotation = camera.transform.rotation;
        float aspect = camera.aspect, orthographicSize = camera.orthographicSize;
        bool orthographic = camera.orthographic, battlefield = art.battlefield;
        bool repairVisible = art.repairModule.activeSelf, launcherVisible = art.launcherModule.activeSelf;
        var barrelPosition = art.barrel.localPosition; var turretRotation = art.turret.localRotation;
        var sunRotation = review.sun.transform.rotation; var sunColor = review.sun.color; float sunIntensity = review.sun.intensity;
        var ambientMode = RenderSettings.ambientMode; var sky = RenderSettings.ambientSkyColor;
        var equator = RenderSettings.ambientEquatorColor; var ground = RenderSettings.ambientGroundColor;
        bool fog = RenderSettings.fog; int selected = review.Treatment;
        var pipeline = QualitySettings.renderPipeline;
        try
        {
            InvokeLifecycle(review, "Awake");
            InvokeLifecycle(art, "Start");
            foreach (var size in new[] { new Vector2Int(1600, 900), new Vector2Int(1280, 720), new Vector2Int(800, 600) })
            {
                camera.aspect = (float)size.x / size.y;
                art.SetView(true, true);
                Vector3 ashForward = Vector3.zero;
                for (int treatment = 0; treatment < 2; treatment++)
                {
                    if (treatment == 0) review.SelectAsh(); else review.SelectIron();
                    Require(review.Treatment == treatment && review.ashEnvironment.activeSelf == (treatment == 0) &&
                        review.ironEnvironment.activeSelf == (treatment == 1), "mutually exclusive environment selection");
                    Require(camera.orthographic && camera.farClipPlane > 100, "review uses fitted camera with sufficient far plane");
                    for (int i = 0; i < 128; i++)
                    {
                        float angle = i * Mathf.PI / 64;
                        var world = art.tank.position + new Vector3(Mathf.Sin(angle), 0, Mathf.Cos(angle)) *
                            BattlefieldReview.FramingRadius + Vector3.up;
                        var projected = camera.WorldToViewportPoint(world);
                        Require(projected.z > camera.nearClipPlane && projected.z < camera.farClipPlane &&
                            projected.x >= .025f && projected.x <= .975f && projected.y >= .13f && projected.y <= .87f,
                            "complete approach ring visible " + size + " treatment " + treatment + " point " + i);
                    }
                    var environment = treatment == 0 ? review.ashEnvironment : review.ironEnvironment;
                    var grounds = environment.GetComponentsInChildren<Renderer>(true)
                        .Where(r => r.name.IndexOf("ContinuousGround", StringComparison.Ordinal) >= 0).ToArray();
                    Require(grounds.Length == 1, "one continuous ground renderer in " + environment.name);
                    var groundTransform = grounds[0].transform;
                    var bounds = grounds[0].GetComponent<MeshFilter>().sharedMesh.bounds;
                    var plane = new Plane(Vector3.up, art.tank.position);
                    foreach (var corner in new[] { Vector2.zero, Vector2.right, Vector2.up, Vector2.one })
                    {
                        var ray = camera.ViewportPointToRay(corner);
                        Require(plane.Raycast(ray, out float enter), "camera corner reaches ground");
                        Vector3 hit = groundTransform.InverseTransformPoint(ray.GetPoint(enter));
                        Require(hit.x > bounds.min.x && hit.x < bounds.max.x && hit.z > bounds.min.z && hit.z < bounds.max.z,
                            "ground extends beyond viewport " + size + " treatment " + treatment);
                    }
                    VisualReviewPolish.ValidateScenery(review, camera, environment);
                    if (treatment == 0) ashForward = camera.transform.forward;
                    else Require(Vector3.Angle(ashForward, camera.transform.forward) > 8,
                        "treatments produce observably different camera pitch");
                    checks.Add(size.x + "x" + size.y + " treatment " + treatment + " full ring and continuous ground projection");
                }
            }
            CheckVehiclePresentation(review, art, checks);
            CheckVehicleSpacing(review, art, checks);
            return new Receipt { scene = art.gameObject.scene.name, checks = checks.ToArray() };
        }
        finally
        {
            if (selected == 0) review.SelectAsh(); else review.SelectIron();
            art.SetView(battlefield, true);
            camera.aspect = aspect; camera.orthographic = orthographic; camera.orthographicSize = orthographicSize;
            camera.transform.SetPositionAndRotation(cameraPosition, cameraRotation);
            art.repairModule.SetActive(repairVisible); art.launcherModule.SetActive(launcherVisible);
            art.barrel.localPosition = barrelPosition; art.turret.localRotation = turretRotation;
            review.sun.transform.rotation = sunRotation; review.sun.color = sunColor; review.sun.intensity = sunIntensity;
            RenderSettings.ambientMode = ambientMode; RenderSettings.ambientSkyColor = sky;
            RenderSettings.ambientEquatorColor = equator; RenderSettings.ambientGroundColor = ground; RenderSettings.fog = fog;
            QualitySettings.renderPipeline = pipeline;
        }
    }

    static void CheckVehiclePresentation(BattlefieldReview review, TankPresentation art, List<string> checks)
    {
        var owner = new GameObject("Temporary visual verification");
        try
        {
            var visuals = new ReviewCombatVisuals(review, art, owner.transform);
            var model = new EncounterModel(true, EncounterProfile.VisualReview);
            while (model.Tick < 160) model.Step();
            string snapshot = model.Snapshot();
            visuals.Render(model);
            Require(visuals.Active == model.ActiveCount, "actual vehicle pool matches active model");
            var foe = model.Foes.First(f => f.Alive);
            Require(Mathf.Abs(Vector3.Distance(visuals.Position(foe), art.tank.position) - foe.Distance * .001f) < .001f,
                "rendered approach distance uses model milliworld units");
            visuals.SetEffects(false); visuals.Advance(.05f); visuals.FaceCamera();
            Require(model.Snapshot() == snapshot, "effects and interpolation cannot change model state");
            visuals.Clear();
            Require(visuals.Active == 0 && owner.GetComponentsInChildren<Renderer>().Length == 0,
                "clear hides all pooled vehicles and feedback");
            visuals.Render(model);
            Require(visuals.Active == model.ActiveCount, "cleared pool can render a fresh run");
            checks.Add("actual imported vehicle pool, distance projection, effects independence and clear/reuse");

            // This real fixture event exposes duplicate destruction feedback if Present
            // treats the final dead state as a new death for each of two outgoing hits.
            while (model.Tick < 1291) model.Step();
            var shots = model.Events.Where(e => e.Kind == EncounterEventKind.Cannon || e.Kind == EncounterEventKind.Launcher).ToArray();
            Require(shots.Length == 2 && shots[0].Slot == shots[1].Slot &&
                model.Foes[shots[0].Slot].Id == 28 && !model.Foes[shots[0].Slot].Alive,
                "real same-tick cannon/launcher destruction fixture");
            visuals.Clear(); visuals.SetEffects(true); visuals.Present(model);
            int scorches = owner.GetComponentsInChildren<Renderer>().Count(r => r.sharedMaterial == review.scorchMaterial);
            Require(scorches == 1, "one destruction scorch for one foe killed by two same-tick hits; got " + scorches);
            checks.Add("one destruction feedback per foe after same-tick cannon and launcher hits");
        }
        finally { UnityEngine.Object.DestroyImmediate(owner); }
    }

    static float FootprintCross(Vector2 a, Vector2 b, Vector2 c)
    { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }

    static Vector2[] VehicleFootprint(GameObject prefab)
    {
        // A convex envelope of the actual imported mesh vertices, including the
        // gun and tracks. Separation is conservative for every mesh inside it.
        var points = prefab.GetComponentsInChildren<MeshFilter>(true).SelectMany(filter => filter.sharedMesh.vertices
            .Select(vertex => prefab.transform.InverseTransformPoint(filter.transform.TransformPoint(vertex))))
            .Select(vertex => new Vector2(vertex.x, vertex.z)).Distinct().OrderBy(p => p.x).ThenBy(p => p.y).ToArray();
        var hull = new List<Vector2>();
        foreach (var p in points)
        {
            while (hull.Count >= 2 && FootprintCross(hull[hull.Count-2], hull[hull.Count-1], p) <= .000001f)
                hull.RemoveAt(hull.Count-1);
            hull.Add(p);
        }
        int lower = hull.Count;
        for (int i = points.Length-2; i >= 0; i--)
        {
            while (hull.Count > lower && FootprintCross(hull[hull.Count-2], hull[hull.Count-1], points[i]) <= .000001f)
                hull.RemoveAt(hull.Count-1);
            hull.Add(points[i]);
        }
        hull.RemoveAt(hull.Count-1);
        Require(hull.Count >= 4, "actual enemy mesh footprint exists");
        return hull.ToArray();
    }

    static Vector2[] WorldFootprint(Vector2[] footprint, Transform root)
    {
        return footprint.Select(point => root.TransformPoint(new Vector3(point.x, 0, point.y)))
            .Select(point => new Vector2(point.x, point.z)).ToArray();
    }

    static float FootprintGap(Vector2[] a, Vector2[] b)
    {
        float gap = float.NegativeInfinity;
        foreach (var hull in new[] { a, b }) for (int i = 0; i < hull.Length; i++)
        {
            Vector2 edge = hull[(i+1)%hull.Length]-hull[i];
            Vector2 axis = new Vector2(-edge.y, edge.x).normalized;
            float amin=float.PositiveInfinity, amax=float.NegativeInfinity;
            float bmin=float.PositiveInfinity, bmax=float.NegativeInfinity;
            foreach (var p in a) { float value=Vector2.Dot(p,axis); amin=Mathf.Min(amin,value); amax=Mathf.Max(amax,value); }
            foreach (var p in b) { float value=Vector2.Dot(p,axis); bmin=Mathf.Min(bmin,value); bmax=Mathf.Max(bmax,value); }
            gap=Mathf.Max(gap, Mathf.Max(bmin-amax, amin-bmax));
        }
        return gap;
    }

    static float CheckSpacingFrame(EncounterModel model, ReviewCombatVisuals visuals, Transform pool,
        TankPresentation art, Vector2[][] footprints, string label)
    {
        string before = model.Snapshot();
        visuals.Render(model); visuals.Advance(.05f);
        var active = Enumerable.Range(0, model.Foes.Count).Where(i => model.Foes[i].Alive).ToArray();
        var world = active.Select(i => WorldFootprint(footprints[model.Foes[i].Kind == FoeKind.Ranged ? 1 : 0],
            pool.Find("Review foe " + i))).ToArray();
        float minimum = float.PositiveInfinity;
        for (int i=0; i<active.Length; i++)
        {
            var foe=model.Foes[active[i]];
            Vector3 radial=visuals.Position(foe)-art.tank.position;
            Require(Mathf.Abs(radial.magnitude-foe.Distance*.001f) < .001f,
                label + " presentation preserves exact model radial distance");
            var node=pool.Find("Review foe " + active[i]);
            Require(Vector3.Cross(node.position-art.tank.position,radial.normalized).magnitude < .001f &&
                Vector3.Dot(node.forward,radial.normalized) > .9999f,
                label + " interpolated hull stays aligned with its fixed radial travel path");
            for (int j=i+1; j<active.Length; j++)
            {
                float gap=FootprintGap(world[i],world[j]); minimum=Mathf.Min(minimum,gap);
                Require(gap >= .10f, label + " imported vehicle footprints intersect or lack 0.10m clearance at tick " +
                    model.Tick + "; ids=" + foe.Id + "/" + model.Foes[active[j]].Id + "; gap=" + gap);
            }
        }
        Require(model.Snapshot() == before, label + " spacing/interpolation cannot change model state");
        return minimum;
    }

    static void CheckVehicleSpacing(BattlefieldReview review, TankPresentation art, List<string> checks)
    {
        var footprints = new[] { VehicleFootprint(review.closeVehicle), VehicleFootprint(review.rangedVehicle) };
        float width = footprints.Max(hull => hull.Max(p => p.x)-hull.Min(p => p.x));
        var owner = new GameObject("Temporary spacing verification");
        try
        {
            var visuals = new ReviewCombatVisuals(review, art, owner.transform); visuals.SetEffects(false);
            var pool = owner.transform.Find("Review combat visuals");
            Require(visuals.Position(new EncounterFoe()) == art.tank.position, "zero-radius presentation remains finite at the tank center");
            foreach (bool launcher in new[] { false, true })
            {
                visuals.Clear(); var model = new EncounterModel(launcher, EncounterProfile.VisualReview);
                float minimum = float.PositiveInfinity, closest = float.PositiveInfinity;
                var recurrences = new HashSet<string>();
                while (model.Status == EncounterStatus.Running)
                {
                    model.Step();
                    minimum = Mathf.Min(minimum,CheckSpacingFrame(model,visuals,pool,art,footprints,"natural " + launcher));
                    foreach (var a in model.Foes.Where(f => f.Alive))
                    {
                        if (a.Kind == FoeKind.Close) closest=Mathf.Min(closest,a.Distance*.001f);
                        foreach (var b in model.Foes.Where(f => f.Alive && f.Id>a.Id && f.Lane==a.Lane))
                            if ((a.Id-1)/32 != (b.Id-1)/32) recurrences.Add(a.Id+"/"+b.Id);
                    }
                    if (model.Tick == 1400)
                    {
                        string snapshot=model.Snapshot();
                        var active=model.Foes.Where(f => f.Alive).ToArray();
                        var nodes=Enumerable.Range(0,model.Foes.Count).Where(i => model.Foes[i].Alive)
                            .Select(i => pool.Find("Review foe " + i)).ToArray();
                        review.SelectAsh(); var ash=active.Select(visuals.Position).ToArray();
                        var positions=nodes.Select(t => t.position).ToArray(); var rotations=nodes.Select(t => t.rotation).ToArray();
                        review.SelectIron();
                        Require(ash.SequenceEqual(active.Select(visuals.Position)) &&
                            positions.SequenceEqual(nodes.Select(t => t.position)) && rotations.SequenceEqual(nodes.Select(t => t.rotation)) &&
                            model.Snapshot() == snapshot, "busy A/B selection preserves exact enemy goals, rendered poses and model state");
                        checks.Add((launcher ? "launcher" : "repair") + " busy A/B selection preserves exact enemy goals/rendered poses and model state");
                    }
                }
                Debug.Log("ST_VIS_SPACING_RUN_PASS fitting=" + launcher + " ticks=" + model.Tick + " width=" + width +
                    " minimumGap=" + minimum + " closestNaturalClose=" + closest + " liveLaneRecurrences=" + recurrences.Count +
                    " summary=" + model.Summary);
                checks.Add((launcher ? "launcher" : "repair") + " every natural tick: actual mesh footprints separated; hull aligned with radial travel; exact distances/model state retained");
            }
            // This bounded fixture has no simultaneous recurring lane cohort or
            // natural close contact. Future crowded/contact profiles need new art
            // qualification; this is not a general collision/avoidance system.
            Debug.Log("ST_VIS_SPACING_SCOPE review-pacing-v1 natural runs only; crowded close-contact and future profiles are not visually qualified");
        }
        finally { UnityEngine.Object.DestroyImmediate(owner); }
    }
}
