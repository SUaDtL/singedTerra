using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.VisualReview;

// Review-scene workmanship and visibility contract; this never changes combat.
public static class VisualReviewPolish
{
    const string Marker = "SceneryPolish01";
    const float FootprintClearance = 29.5f;
    const string ReviewRoot = "Assets/VisualReview";
    const string SeedRoot = "Assets/SeedPack02";
    [Serializable] sealed class FileProof { public string path, sha256; }
    [Serializable] sealed class Receipt
    {
        public string scene, sceneBefore, sceneAfter, rangedPaintBefore, rangedPaintAfter, backup, editor;
        public FileProof[] retainedSeedAssets;
        public int removedTreadMarks, removedFlatStones, addedPrefabs;
        public float footprintClearance = FootprintClearance, approachRadius = BattlefieldReview.FramingRadius;
        public bool gameplayChanged = false;
    }
    [Serializable] sealed class RepairReceipt
    {
        public string scene, sceneBefore, sceneAfter, backup, editor, preservedPolishReceipt;
        public string[] removedRoots, removedComponents;
        public int removedObjects, removedVehicleInstances, removedFeedbackObjects, removedTracers;
        public FileProof[] retainedAssets;
        public bool authoredContentUnchanged;
    }
    [Serializable] sealed class AuthoredNode
    {
        public int id, parent, sibling, layer, flags;
        public string name, tag;
        public bool active, isStatic;
        public Vector3 position, scale;
        public Quaternion rotation;
        public string[] components;
    }

    static void Require(bool value, string message)
    {
        if (!value) throw new InvalidOperationException("Review scenery: " + message);
    }

    static float Cross(Vector2 a, Vector2 b) { return a.x * b.y - a.y * b.x; }

    static float SegmentRadius(Vector2 a, Vector2 b)
    {
        Vector2 edge = b - a;
        float t = edge.sqrMagnitude < .0000001f ? 0 : Mathf.Clamp01(-Vector2.Dot(a, edge) / edge.sqrMagnitude);
        return (a + edge * t).magnitude;
    }

    static float TriangleRadius(Vector3 va, Vector3 vb, Vector3 vc)
    {
        var a = new Vector2(va.x, va.z); var b = new Vector2(vb.x, vb.z); var c = new Vector2(vc.x, vc.z);
        float area = Cross(b - a, c - a);
        if (Mathf.Abs(area) > .000001f)
        {
            float ab = Cross(b - a, -a), bc = Cross(c - b, -b), ca = Cross(a - c, -c);
            if ((ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0)) return 0;
        }
        return Mathf.Min(SegmentRadius(a, b), SegmentRadius(b, c), SegmentRadius(c, a));
    }

    static Vector3 AtThreatHeight(Vector3 vertex, Camera camera, float threatY)
    {
        // Orthographic back-projection to the one-metre threat plane gives the
        // actual roof/wall silhouette, including geometry leaning into the ring.
        return vertex + camera.transform.forward * ((threatY - vertex.y) / camera.transform.forward.y);
    }

    public static void ValidateScenery(BattlefieldReview review, Camera camera, GameObject environment)
    {
        Require(environment.transform.Find(Marker), "saved landmark composition missing from " + environment.name);
        Require(camera.orthographic && camera.transform.forward.y < -.1f, "fitted review camera required for silhouette check");
        Vector3 center = review.GetComponent<TankPresentation>().tank.position;
        float nearestFootprint = float.MaxValue, nearestSilhouette = float.MaxValue;
        int checkedMeshes = 0;
        foreach (var filter in environment.GetComponentsInChildren<MeshFilter>(true))
        {
            string meshPath = AssetDatabase.GetAssetPath(filter.sharedMesh);
            // Ground markings are intentionally inside the field and below actors.
            if (filter.name == "ContinuousGround" || meshPath == ReviewRoot + "/Meshes/FeedbackQuad.asset") continue;
            Require(filter.GetComponent<Renderer>(), "scenery mesh has no renderer");
            var vertices = filter.sharedMesh.vertices.Select(v => filter.transform.TransformPoint(v)).ToArray();
            var projected = vertices.Select(v => AtThreatHeight(v, camera, center.y + 1)).ToArray();
            var triangles = filter.sharedMesh.triangles;
            float footprint = float.MaxValue, silhouette = float.MaxValue;
            for (int i = 0; i < triangles.Length; i += 3)
            {
                int a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
                footprint = Mathf.Min(footprint, TriangleRadius(vertices[a] - center, vertices[b] - center, vertices[c] - center));
                silhouette = Mathf.Min(silhouette, TriangleRadius(projected[a] - center, projected[b] - center, projected[c] - center));
            }
            Require(footprint >= FootprintClearance - .002f,
                filter.name + " footprint enters 29.5m clearance; radius=" + footprint);
            Require(silhouette >= BattlefieldReview.FramingRadius,
                filter.name + " projected silhouette obscures approach ring; radius=" + silhouette);
            nearestFootprint = Mathf.Min(nearestFootprint, footprint);
            nearestSilhouette = Mathf.Min(nearestSilhouette, silhouette); checkedMeshes++;
        }
        Require(checkedMeshes >= 12, "landmark composition requires actual mesh coverage");
        Debug.Log("ST_VIS_SCENERY_PASS treatment=" + review.Treatment + " aspect=" + camera.aspect +
            " meshes=" + checkedMeshes + " nearestFootprint=" + nearestFootprint + " nearestSilhouette=" + nearestSilhouette);
    }

    static string Digest(string path)
    {
        using (var stream = File.OpenRead(path)) using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    static T Load<T>(string path) where T : UnityEngine.Object
    {
        var value = AssetDatabase.LoadAssetAtPath<T>(path); Require(value, "missing saved asset " + path); return value;
    }

    static GameObject Seed(string id, Transform parent, float x, float z, float yaw)
    {
        var source = Load<GameObject>(SeedRoot + "/Generated/Prefabs/" + id + ".prefab");
        var instance = (GameObject)PrefabUtility.InstantiatePrefab(source);
        instance.name = id + " landmark"; instance.transform.SetParent(parent, false);
        instance.transform.SetPositionAndRotation(new Vector3(x, 0, z), Quaternion.Euler(0, yaw, 0));
        float bottom = instance.GetComponentsInChildren<MeshFilter>(true)
            .SelectMany(f => f.sharedMesh.vertices.Select(v => f.transform.TransformPoint(v).y)).Min();
        instance.transform.position += Vector3.down * bottom;
        Require(instance.GetComponentsInChildren<Collider>(true).Length == 0 &&
            instance.GetComponentsInChildren<MonoBehaviour>(true).Length == 0, "landmark must remain art only: " + id);
        return instance;
    }

    static Transform Group(Transform environment)
    {
        var group = new GameObject(Marker).transform; group.SetParent(environment, false); return group;
    }

    static Mesh FoundationMesh()
    {
        var mesh = new Mesh { name = "Shallow concrete foundation" };
        var corners = new[] { new Vector3(-.5f,0,-.5f), new Vector3(.5f,0,-.5f), new Vector3(.5f,0,.5f), new Vector3(-.5f,0,.5f),
            new Vector3(-.5f,1,-.5f), new Vector3(.5f,1,-.5f), new Vector3(.5f,1,.5f), new Vector3(-.5f,1,.5f) };
        int[] faces = { 4,7,6,4,6,5, 0,4,5,0,5,1, 1,5,6,1,6,2, 2,6,7,2,7,3, 3,7,4,3,4,0 };
        mesh.vertices = faces.Select(i => corners[i]).ToArray();
        mesh.triangles = Enumerable.Range(0, faces.Length).ToArray();
        mesh.uv = faces.Select(i => new Vector2(corners[i].x + .5f, corners[i].z + .5f)).ToArray();
        mesh.RecalculateNormals(); mesh.RecalculateBounds(); return mesh;
    }

    static Material FoundationPaint(string name, Vector2 span)
    {
        var material = new Material(Load<Material>(SeedRoot + "/Generated/Materials/ST2_Concrete.mat")) { name = name };
        material.SetColor("_BaseColor", new Color(.64f, .68f, .70f));
        material.SetTextureScale("_BaseMap", span / 4f); material.SetFloat("_Smoothness", .12f);
        return material;
    }

    static void Foundation(string name, Transform parent, Mesh mesh, Material material, Vector3 position, Vector2 size, float yaw)
    {
        var obj = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
        obj.transform.SetParent(parent, false); obj.transform.SetPositionAndRotation(position, Quaternion.Euler(0, yaw, 0));
        obj.transform.localScale = new Vector3(size.x, .10f, size.y);
        obj.GetComponent<MeshFilter>().sharedMesh = mesh; obj.GetComponent<MeshRenderer>().sharedMaterial = material;
    }

    static int RemoveReviewInstances(GameObject root, Func<Transform, bool> predicate)
    {
        var matches = root.GetComponentsInChildren<Transform>(true).Where(predicate).ToArray();
        foreach (var match in matches) UnityEngine.Object.DestroyImmediate(match.gameObject);
        return matches.Length;
    }

    static void MoveSuppliesToForecourt(Transform west)
    {
        int pallet = 0;
        foreach (Transform child in west)
        {
            var position = child.position;
            if (child.name.StartsWith("STK-B04")) { position.x = -31.1f; child.position = position; }
            else if (child.name.StartsWith("STK-B03"))
            { position.x = -31.1f; position.z = 3.5f + pallet++ * 2.6f; child.position = position; }
        }
    }

    static void ExactComponents(GameObject node, params Type[] expected)
    {
        var actual = node.GetComponents<Component>();
        Require(actual.All(c => c) && actual.Length == expected.Length &&
            expected.All(type => actual.Count(c => c.GetType() == type) == 1),
            "ambiguous check artifact components on " + node.name);
    }

    static T[] SceneOwners<T>(Scene scene) where T : Component
    {
        return UnityEngine.Object.FindObjectsByType<T>(FindObjectsInactive.Include, FindObjectsSortMode.None)
            .Where(c => c.gameObject.scene == scene).ToArray();
    }

    static void ExactOwner<T>(Scene scene, GameObject node) where T : Component
    {
        var owners = SceneOwners<T>(scene);
        Require(owners.Length == 1 && owners[0].gameObject == node, "ambiguous saved " + typeof(T).Name + " owner");
    }

    static void CheckVehicleClone(Transform clone, GameObject source)
    {
        Require(clone.name == source.name + "(Clone)", "unexpected pooled vehicle " + clone.name);
        var actual = clone.GetComponentsInChildren<Transform>(true);
        var expected = source.GetComponentsInChildren<Transform>(true);
        Require(actual.Length == expected.Length, "pooled vehicle hierarchy changed");
        for (int i = 0; i < actual.Length; i++)
        {
            var a = actual[i]; var e = expected[i];
            Require((i == 0 || a.name == e.name) && a.childCount == e.childCount &&
                a.localPosition == e.localPosition && a.localRotation == e.localRotation && a.localScale == e.localScale,
                "pooled vehicle transform differs from its saved prefab");
            var components = e.GetComponents<Component>().Select(c => c.GetType()).ToArray();
            Require(components.All(t => t == typeof(Transform) || t == typeof(MeshFilter) || t == typeof(MeshRenderer)),
                "vehicle contains a component outside the visual-only contract");
            ExactComponents(a.gameObject, components);
            var mesh = a.GetComponent<MeshFilter>();
            if (mesh) Require(mesh.sharedMesh == e.GetComponent<MeshFilter>().sharedMesh, "pooled vehicle mesh changed");
            var renderer = a.GetComponent<MeshRenderer>();
            if (renderer) Require(renderer.sharedMaterials.SequenceEqual(e.GetComponent<MeshRenderer>().sharedMaterials),
                "pooled vehicle materials changed");
        }
    }

    static string AuthoredState(Scene scene, HashSet<GameObject> artifacts, HashSet<Component> transientComponents)
    {
        return string.Join("\n", scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<Transform>(true))
            .Where(t => !artifacts.Contains(t.gameObject)).OrderBy(t => t.GetInstanceID()).Select(t =>
            {
                var node = t.gameObject;
                return JsonUtility.ToJson(new AuthoredNode {
                    id = node.GetInstanceID(), name = node.name, parent = t.parent ? t.parent.GetInstanceID() : 0,
                    sibling = t.GetSiblingIndex(), layer = node.layer, flags = (int)node.hideFlags, tag = node.tag,
                    active = node.activeSelf, isStatic = node.isStatic,
                    position = t.localPosition, rotation = t.localRotation, scale = t.localScale,
                    components = node.GetComponents<Component>().Where(c => !(c is Transform) && !transientComponents.Contains(c))
                        .Select(c => c.GetType().FullName + ":" + EditorJsonUtility.ToJson(c)).ToArray()
                });
            }));
    }

    [MenuItem("singedTerra/Repair confirmed saved review check artifacts once")]
    public static void RepairSavedCheckArtifacts()
    {
        Require(Application.unityVersion == "6000.3.24f1", "unexpected editor version");
        const string receiptPath = ReviewRoot + "/authoring-repair-receipt.json";
        const string polishPath = ReviewRoot + "/polish-receipt.json";
        const string affectedScene = "510429daf6c91eda2504b51aecc2045c6e2021903b6ca5d2c5a5828191fb30af";
        Require(!File.Exists(receiptPath) && !File.Exists(receiptPath + ".meta"), "existing repair history must be preserved");
        Require(Digest(VisualReviewBuild.ScenePath) == affectedScene &&
            JsonUtility.FromJson<Receipt>(File.ReadAllText(polishPath)).sceneAfter == affectedScene,
            "repair applies only to the identified saved check-artifact incident");
        var scene = EditorSceneManager.OpenScene(VisualReviewBuild.ScenePath, OpenSceneMode.Single);
        VisualReviewBuild.Validate();
        var presentations = SceneOwners<TankPresentation>(scene);
        Require(presentations.Length == 1 && presentations[0].name == "ArtPresentation", "original presentation owner missing");
        var owner = presentations[0].gameObject; var review = owner.GetComponent<BattlefieldReview>();
        ExactComponents(owner, typeof(Transform), typeof(TankPresentation), typeof(ArtHud), typeof(BattlefieldReview),
            typeof(EncounterSession), typeof(EncounterHud), typeof(TankPartCallouts));
        var roots = owner.transform.Cast<Transform>().ToArray();
        Require(roots.Select(t => t.name).OrderBy(n => n).SequenceEqual(new[] { "ArtInput", "ArtInterface", "EncounterPresentation" }),
            "unexpected presentation children; refuse to remove authored content");
        var canvas = roots.Single(t => t.name == "ArtInterface"); var input = roots.Single(t => t.name == "ArtInput");
        var encounter = roots.Single(t => t.name == "EncounterPresentation");
        ExactOwner<EncounterSession>(scene, owner); ExactOwner<EncounterHud>(scene, owner); ExactOwner<TankPartCallouts>(scene, owner);
        ExactOwner<EncounterView>(scene, encounter.gameObject); ExactOwner<Canvas>(scene, canvas.gameObject);
        ExactOwner<EventSystem>(scene, input.gameObject);
        ExactComponents(canvas.gameObject, typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        var uiTypes = new[] { typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster),
            typeof(CanvasRenderer), typeof(Text), typeof(Image), typeof(Button), typeof(Outline) };
        Require(canvas.GetComponentsInChildren<Component>(true).All(c => c && uiTypes.Contains(c.GetType())),
            "unexpected component inside the generated UI tree");
        var expectedPanels = new[] { "PartCallouts", "Identity", "Attachment", "View", "Preview", "Motion", "Footer",
            "InspectionControls", "ReviewEncounterHud", "Attachment" };
        Require(canvas.Cast<Transform>().Select(t => t.name).OrderBy(n => n).SequenceEqual(expectedPanels.OrderBy(n => n)),
            "unexpected generated UI panel inventory");
        ExactComponents(input.gameObject, typeof(Transform), typeof(EventSystem), typeof(StandaloneInputModule));
        Require(input.childCount == 0, "unexpected input children");
        ExactComponents(encounter.gameObject, typeof(Transform), typeof(EncounterView));
        Require(encounter.childCount == 13, "unexpected encounter pool children");
        for (int i = 0; i < 12; i++)
        {
            var tracer = encounter.Find("EncounterTracer_" + i);
            Require(tracer && tracer.childCount == 0, "unexpected tracer hierarchy");
            ExactComponents(tracer.gameObject, typeof(Transform), typeof(LineRenderer));
            Require(!tracer.GetComponent<LineRenderer>().enabled, "artifact tracer is not in its initial inactive state");
        }
        var pool = encounter.Find("Review combat visuals");
        Require(pool && pool.childCount == 112, "unexpected review pool inventory");
        ExactComponents(pool.gameObject, typeof(Transform));
        for (int i = 0; i < 32; i++)
        {
            var foe = pool.Find("Review foe " + i);
            Require(foe && !foe.gameObject.activeSelf && foe.childCount == 2, "unexpected inactive foe pool");
            ExactComponents(foe.gameObject, typeof(Transform));
            CheckVehicleClone(foe.GetChild(0), review.closeVehicle); CheckVehicleClone(foe.GetChild(1), review.rangedVehicle);
        }
        for (int i = 0; i < 80; i++)
        {
            var feedback = pool.Find("Review feedback " + i);
            Require(feedback && !feedback.gameObject.activeSelf && feedback.childCount == 0, "unexpected feedback pool");
            ExactComponents(feedback.gameObject, typeof(Transform), typeof(MeshFilter), typeof(MeshRenderer));
            Require(feedback.GetComponent<MeshFilter>().sharedMesh == review.effectQuad &&
                feedback.GetComponent<MeshRenderer>().sharedMaterial == review.dustMaterial, "feedback artifact assets changed");
        }
        var artifacts = new HashSet<GameObject>(roots.SelectMany(t => t.GetComponentsInChildren<Transform>(true)).Select(t => t.gameObject));
        var transient = new HashSet<Component>(new Component[] { owner.GetComponent<EncounterSession>(),
            owner.GetComponent<EncounterHud>(), owner.GetComponent<TankPartCallouts>() });
        Require(!artifacts.Contains(presentations[0].tank.gameObject) && !artifacts.Contains(review.ashEnvironment) &&
            !artifacts.Contains(review.ironEnvironment), "authored scene is inside the artifact roots");
        string authoredBefore = AuthoredState(scene, artifacts, transient);
        var retained = Directory.GetFiles("Assets", "*", SearchOption.AllDirectories).Select(p => p.Replace('\\','/'))
            .Where(p => p != VisualReviewBuild.ScenePath).OrderBy(p => p)
            .Select(p => new FileProof { path = p, sha256 = Digest(p) }).ToArray();
        string backup = Path.GetFullPath(Path.Combine(Application.dataPath, "../../Evidence/scene-authoring-repair-before-" +
            DateTime.UtcNow.ToString("yyyyMMddTHHmmssZ") + "-" + Guid.NewGuid().ToString("N").Substring(0,6)));
        Directory.CreateDirectory(backup); File.Copy(VisualReviewBuild.ScenePath, Path.Combine(backup, "BattlefieldReview.unity"));
        var receipt = new RepairReceipt { scene = VisualReviewBuild.ScenePath, sceneBefore = affectedScene,
            editor = Application.unityVersion, backup = backup, preservedPolishReceipt = Digest(polishPath), retainedAssets = retained,
            removedRoots = roots.Select(t => "ArtPresentation/" + t.name).ToArray(), removedObjects = artifacts.Count,
            removedComponents = transient.Select(c => c.GetType().Name).OrderBy(n => n).ToArray(),
            removedVehicleInstances = 64, removedFeedbackObjects = 80, removedTracers = 12 };
        foreach (var root in roots) UnityEngine.Object.DestroyImmediate(root.gameObject);
        foreach (var component in transient) UnityEngine.Object.DestroyImmediate(component);
        Require(AuthoredState(scene, artifacts, transient) == authoredBefore, "removing artifacts changed retained authored content");
        receipt.authoredContentUnchanged = true;
        Require(EditorSceneManager.SaveScene(scene, VisualReviewBuild.ScenePath), "repaired scene was not saved");
        receipt.sceneAfter = Digest(VisualReviewBuild.ScenePath);
        foreach (var file in retained) Require(Digest(file.path) == file.sha256, "repair changed retained asset " + file.path);
        File.WriteAllText(receiptPath, JsonUtility.ToJson(receipt, true)); AssetDatabase.Refresh();
        // Reopen and check the saved result with the guard that reproduced this
        // incident. The explicit repair never runs during export.
        VisualReviewBuild.Check();
        Require(Digest(VisualReviewBuild.ScenePath) == receipt.sceneAfter, "check changed repaired saved scene");
        foreach (var file in retained) Require(Digest(file.path) == file.sha256, "check changed retained asset " + file.path);
        Debug.Log("ST_VIS_AUTHORING_REPAIR_PASS scene=" + receipt.scene + " before=" + receipt.sceneBefore +
            " after=" + receipt.sceneAfter + " removedObjects=" + receipt.removedObjects + " authoredContentUnchanged=true");
    }

    [MenuItem("singedTerra/Polish saved battlefield review once")]
    public static void Apply()
    {
        Require(Application.unityVersion == "6000.3.24f1", "unexpected editor version");
        EditorSceneManager.OpenScene(VisualReviewBuild.ScenePath, OpenSceneMode.Single);
        VisualReviewBuild.Validate();
        var review = UnityEngine.Object.FindFirstObjectByType<BattlefieldReview>();
        Require(!review.ashEnvironment.transform.Find(Marker) && !review.ironEnvironment.transform.Find(Marker),
            "polish already applied; preserve the saved composition");
        const string receiptPath = ReviewRoot + "/polish-receipt.json";
        Require(!File.Exists(receiptPath), "existing polish receipt must be preserved");
        var createdPaths = new[] { ReviewRoot + "/Meshes/PolishFoundation.asset",
            ReviewRoot + "/Materials/PolishWestConcrete.mat", ReviewRoot + "/Materials/PolishEastConcrete.mat" };
        foreach (string path in createdPaths) Require(!File.Exists(path), "refuse to replace existing asset " + path);
        var retained = Directory.GetFiles(SeedRoot, "*", SearchOption.AllDirectories)
            .OrderBy(p => p).Select(p => new FileProof { path = p.Replace('\\','/'), sha256 = Digest(p) }).ToArray();
        string paintPath = ReviewRoot + "/Materials/EnemyRanged.mat";
        string backup = Path.GetFullPath(Path.Combine(Application.dataPath, "../../Evidence/scene-polish-before-" +
            DateTime.UtcNow.ToString("yyyyMMddTHHmmssZ") + "-" + Guid.NewGuid().ToString("N").Substring(0,6)));
        Directory.CreateDirectory(backup);
        File.Copy(VisualReviewBuild.ScenePath, Path.Combine(backup, "BattlefieldReview.unity"));
        File.Copy(paintPath, Path.Combine(backup, "EnemyRanged.mat"));
        var receipt = new Receipt { scene = VisualReviewBuild.ScenePath, sceneBefore = Digest(VisualReviewBuild.ScenePath),
            rangedPaintBefore = Digest(paintPath), retainedSeedAssets = retained, backup = backup, editor = Application.unityVersion };

        receipt.removedTreadMarks = RemoveReviewInstances(review.ashEnvironment, t => t.name == "Tank approach tread");
        receipt.removedFlatStones = RemoveReviewInstances(review.ashEnvironment, t => t.name == "Low ash berm" || t.name == "Basalt ledge");
        Require(receipt.removedTreadMarks == 42 && receipt.removedFlatStones == 7, "unexpected prior review markings/stone inventory");
        var ash = Group(review.ashEnvironment.transform);
        Seed("ST2-B04", ash, -34, -13, 15);
        Seed("ST2-B01", ash, 20, 32, 20);
        Seed("ST2-T05", ash, -28, 27, -20);
        Seed("ST2-T04", ash, -34, 23, 13);
        Seed("ST2-T07", ash, 31, 20, -15);
        Seed("ST2-T07", ash, 35, 16, 31);
        Seed("ST2-P01", ash, -31, -25.5f, 12);
        Seed("ST2-P05", ash, -35.5f, -24, 90);
        // Move the existing small breastwork forward of the bunker instead of
        // leaving it intersecting the newly placed building footprint.
        var north = review.ashEnvironment.transform.Find("Broken retaining line");
        int barrier = 0;
        foreach (Transform child in north)
        {
            child.position = new Vector3(18 + barrier++ * 3.4f, child.position.y, 27.3f);
            child.rotation = Quaternion.identity;
        }

        RemoveReviewInstances(review.ironEnvironment, t => t.name == "Worn concrete apron" ||
            t.name == "Broken hardstand" || t.name == "Worn apron bay marker");
        review.ironEnvironment.transform.Find("ContinuousGround").localRotation = Quaternion.Euler(0, -77.6f, 0);
        MoveSuppliesToForecourt(review.ironEnvironment.transform.Find("West service apron"));
        var iron = Group(review.ironEnvironment.transform);
        Seed("ST2-B02", iron, -38, -14, -90);
        Seed("ST2-B02", iron, -38, 2, -90);
        Seed("ST2-B01", iron, 33, 14, 67);
        Seed("ST2-B03", iron, 23, 32, -25);
        Seed("ST2-P02", iron, -38, -23, 0);
        Seed("ST2-P02", iron, -33.85f, -23, 0);
        Seed("ST2-P02", iron, 33, 25.5f, 0);
        Seed("ST2-P02", iron, 37.15f, 25.5f, 0);
        Seed("ST2-P01", iron, -32, -5.5f, 20);
        Seed("ST2-P05", iron, -33, -8.5f, 90);
        Seed("ST2-P04", iron, 37.5f, 10, -60);
        receipt.addedPrefabs = 19;
        var foundationMesh = FoundationMesh();
        var westPaint = FoundationPaint("PolishWestConcrete", new Vector2(13, 32));
        var eastPaint = FoundationPaint("PolishEastConcrete", new Vector2(8, 6.5f));
        Foundation("West depot foundation", iron, foundationMesh, westPaint, new Vector3(-37, 0, -6), new Vector2(13, 32), 0);
        Foundation("East bunker foundation", iron, foundationMesh, eastPaint, new Vector3(33, 0, 14), new Vector2(8, 6.5f), 67);
        // The plinth is shallow but solid; lift the building roots onto its top.
        foreach (Transform child in iron)
            if (child.name == "ST2-B02 landmark" || child.name == "ST2-B01 landmark") child.position += Vector3.up * .10f;

        // Exercise the real model, HUD, geometry and projection checks before any
        // saved-scene/material write. All transient camera changes are restored.
        EncounterChecks.Run(); ReviewHudChecks.Run(); VisualReviewChecks.Run();
        foreach (var file in retained) Require(Digest(file.path) == file.sha256, "seed asset changed: " + file.path);
        AssetDatabase.CreateAsset(foundationMesh, createdPaths[0]);
        AssetDatabase.CreateAsset(westPaint, createdPaths[1]); AssetDatabase.CreateAsset(eastPaint, createdPaths[2]);
        var paint = Load<Material>(paintPath);
        paint.SetColor("_BaseColor", new Color(.70f, .66f, .52f)); EditorUtility.SetDirty(paint);
        EditorSceneManager.SaveScene(review.gameObject.scene, VisualReviewBuild.ScenePath);
        AssetDatabase.SaveAssets();
        receipt.sceneAfter = Digest(VisualReviewBuild.ScenePath); receipt.rangedPaintAfter = Digest(paintPath);
        File.WriteAllText(receiptPath, JsonUtility.ToJson(receipt, true)); AssetDatabase.Refresh();
        // Reopen the saved result to verify the actual persisted artifact.
        VisualReviewBuild.Check();
        foreach (var file in retained) Require(Digest(file.path) == file.sha256, "seed asset changed after save: " + file.path);
        Debug.Log("ST_VIS_POLISH_PASS " + JsonUtility.ToJson(receipt));
    }
}
