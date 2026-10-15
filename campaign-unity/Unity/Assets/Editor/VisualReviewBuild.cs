using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using SingedTerra.Art;
using SingedTerra.VisualReview;

// Explicit, one-time authoring of a separate scene. Normal exports only load saved assets.
public static class VisualReviewBuild
{
    public const string ScenePath = "Assets/Scenes/BattlefieldReview.unity";
    const string OriginalScene = "Assets/Scenes/FieldAssembly.unity";
    const string OriginalHash = "5652aaba327cc7f26056a7ee033a98016a061e2de00e6176ea643441ca2adf65";
    const string Root = "Assets/VisualReview";
    const string CompatibilityPath = Root + "/preservation-compatibility.json";
    const string CompatibilitySha256 = "b72a9e367881b22d754df6fc19b67a9a2b805d69297cc12363e733e21d6f39f8";
    const string Art = "Assets/Art/VisualReview";
    const float GroundSize = 256f;
    static readonly Dictionary<string, Material> Materials = new Dictionary<string, Material>();
    static Mesh groundMesh, quadMesh, rockMesh;

    [Serializable] sealed class FileProof { public string path, sha256; }
    [Serializable] sealed class CheckoutRepresentation { public string path, originalRawSha256, lfSha256; }
    [Serializable] sealed class CheckoutCompatibility
    {
        public int schema;
        public string preservationReceiptPath, preservationReceiptSha256;
        public CheckoutRepresentation[] representations;
    }
    [Serializable] sealed class VehicleProof { public string id; public Vector3 size, center; public int triangles, wheels; }
    [Serializable] sealed class PreparationProof
    {
        public int schema = 1;
        public string scope = "ST-VIS-01 saved-scene authoring", editor, sourceScene, sourceSceneSha256;
        public FileProof[] preserved;
        public VehicleProof[] vehicles;
        public float groundSide = GroundSize, framingRadius = BattlefieldReview.FramingRadius;
        public bool gameplayAdded = false;
    }

    static void Require(bool value, string message)
    {
        if (!value) throw new InvalidOperationException(message);
    }

    static string Digest(string path)
    {
        using (var stream = File.OpenRead(path))
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    static FileProof[] ProtectedFiles()
    {
        var files = new List<string> { OriginalScene, OriginalScene + ".meta" };
        foreach (string folder in new[] { "Assets/Materials", "Assets/Prefabs", "Assets/PartsLibrary", "Assets/Art/PartsLibrary" })
            files.AddRange(Directory.GetFiles(folder, "*", SearchOption.AllDirectories));
        files.AddRange(Directory.GetFiles("Assets/Art", "*", SearchOption.TopDirectoryOnly));
        return files.OrderBy(p => p).Select(p => new FileProof { path = p.Replace('\\', '/'), sha256 = Digest(p) }).ToArray();
    }

    static void CheckProtected(FileProof[] files)
    {
        foreach (var file in files)
            Require(File.Exists(file.path) && MatchesProtectedHash(file.path, file.sha256, Digest(file.path)), "Retained asset changed: " + file.path);
        Require(Digest(OriginalScene) == OriginalHash, "FieldAssembly source identity changed");
    }

    internal static bool MatchesProtectedHash(string path, string historicalRawSha256, string actualSha256)
    {
        var representation = ReadCompatibilityProof().representations.FirstOrDefault(item => item.path == path);
        if (representation != null)
            return historicalRawSha256 == representation.originalRawSha256 &&
                (actualSha256 == representation.originalRawSha256 || actualSha256 == representation.lfSha256);
        return actualSha256 == historicalRawSha256;
    }

    internal static void VerifyCompatibilityProofBytes(byte[] bytes)
    {
        using (var sha = SHA256.Create())
            Require(BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant() == CompatibilitySha256,
                "Checkout compatibility proof changed");
    }

    static CheckoutCompatibility ReadCompatibilityProof()
    {
        var bytes = File.ReadAllBytes(CompatibilityPath);
        VerifyCompatibilityProofBytes(bytes);
        var proof = JsonUtility.FromJson<CheckoutCompatibility>(System.Text.Encoding.UTF8.GetString(bytes));
        Require(proof.schema == 1 && proof.representations.Length == 2, "Unexpected checkout compatibility schema");
        Require(Digest(proof.preservationReceiptPath) == proof.preservationReceiptSha256,
            "Historical preservation receipt changed");
        return proof;
    }

    static T Load<T>(string path) where T : UnityEngine.Object
    {
        var asset = AssetDatabase.LoadAssetAtPath<T>(path);
        Require(asset, "Missing review input: " + path);
        return asset;
    }

    static void NewAsset(UnityEngine.Object asset, string relative)
    {
        string path = Root + "/" + relative;
        Require(!File.Exists(path), "Refuse review asset overwrite: " + path);
        AssetDatabase.CreateAsset(asset, path);
    }

    static Material Lit(string name, Color color, float metallic, float smoothness, string texture = null)
    {
        // WebGL compiles instanced programs for new batch sizes during combat.
        // Later arrivals reuse the compiled non-instanced programs instead.
        var material = new Material(Shader.Find("Universal Render Pipeline/Lit"))
        { name = name, enableInstancing = !name.StartsWith("Enemy", StringComparison.Ordinal) };
        material.SetColor("_BaseColor", color);
        material.SetFloat("_Metallic", metallic);
        material.SetFloat("_Smoothness", smoothness);
        if (name.StartsWith("Enemy")) EnableHitFlash(material);
        if (texture != null) material.SetTexture("_BaseMap", Load<Texture2D>(texture));
        NewAsset(material, "Materials/" + name + ".mat");
        Materials[name] = material;
        return material;
    }

    static void EnableHitFlash(Material material)
    {
        // URP revalidates keywords on import. Its BaseShaderGUI requires an emissive
        // flag; a black authoring color alone drops the hit-flash shader variant.
        // Runtime property blocks set the idle emission to exact black.
        material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.BakedEmissive;
        material.SetColor("_EmissionColor", new Color(.0001f, .0001f, .0001f));
        material.EnableKeyword("_EMISSION");
    }

    static Material Feedback(string name, Texture2D texture, bool additive)
    {
        var material = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { name = name, enableInstancing = true };
        material.SetTexture("_BaseMap", texture);
        material.SetColor("_BaseColor", Color.white);
        material.SetFloat("_Surface", 1);
        material.SetFloat("_Blend", additive ? 2 : 0);
        material.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
        material.SetFloat("_DstBlend", additive ? (float)BlendMode.One : (float)BlendMode.OneMinusSrcAlpha);
        material.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
        material.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
        material.SetFloat("_ZWrite", 0);
        material.SetFloat("_Cull", (float)CullMode.Off);
        material.SetOverrideTag("RenderType", "Transparent");
        material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
        material.renderQueue = (int)RenderQueue.Transparent;
        NewAsset(material, "Materials/" + name + ".mat");
        Materials[name] = material;
        return material;
    }

    static Texture2D RadialTexture()
    {
        const int size = 128;
        var texture = new Texture2D(size, size, TextureFormat.RGBA32, true) { name = "Soft radial feedback", wrapMode = TextureWrapMode.Clamp };
        var colors = new Color[size * size];
        for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
        {
            float u = (x + .5f) / size * 2 - 1, v = (y + .5f) / size * 2 - 1;
            float radius = Mathf.Sqrt(u * u + v * v);
            float alpha = Mathf.Pow(Mathf.Clamp01(1 - radius), 2.2f);
            colors[y * size + x] = new Color(1, 1, 1, alpha);
        }
        texture.SetPixels(colors); texture.Apply(true);
        NewAsset(texture, "Textures/SoftRadial.asset");
        return texture;
    }

    static void MaterialsAndMeshes()
    {
        Lit("GroundAsh", Color.white, 0, .08f, Art + "/GroundAsh.png");
        var ironGround = Lit("GroundIron", Color.white, 0, .12f, Art + "/GroundIron.png");
        // This authored image contains a road, so cover the whole ground once.
        // Ground mesh UVs span -.5 to 1.5; centered scaling avoids repeated edges.
        ironGround.SetTextureScale("_BaseMap", Vector2.one * .5f);
        ironGround.SetTextureOffset("_BaseMap", Vector2.one * .25f);
        ironGround.SetTextureScale("_MainTex", Vector2.one * .5f);
        ironGround.SetTextureOffset("_MainTex", Vector2.one * .25f);
        Lit("AshStone", new Color(.32f, .30f, .26f), 0, .08f, Art + "/VehicleWear.png");
        Lit("AshBerm", new Color(.40f, .32f, .23f), 0, .06f, Art + "/VehicleWear.png");
        Lit("IronApron", new Color(1.08f, 1.13f, 1.15f), .04f, .16f, Art + "/GroundIron.png");
        Lit("RoadSoot", new Color(.19f, .20f, .19f), 0, .06f, Art + "/VehicleWear.png");
        Lit("FadedWarning", new Color(.57f, .46f, .26f), .02f, .09f, Art + "/VehicleWear.png");
        Lit("EnemyArmor", new Color(.52f, .31f, .16f), .4f, .28f, Art + "/VehicleWear.png");
        Lit("EnemyRanged", new Color(.36f, .44f, .42f), .45f, .32f, Art + "/VehicleWear.png");
        Lit("EnemyGunmetal", new Color(.105f, .13f, .14f), .7f, .45f);
        Lit("EnemyTrack", new Color(.055f, .059f, .056f), .25f, .12f);
        Lit("EnemyMark", new Color(.77f, .60f, .31f), .2f, .35f);
        Lit("EnemyOptic", new Color(.12f, .38f, .42f), .5f, .7f);
        var texture = RadialTexture();
        Feedback("Flash", texture, true); Feedback("Dust", texture, false); Feedback("Scorch", texture, false);
        Materials["Scorch"].SetColor("_BaseColor", new Color(.10f, .085f, .07f, .68f));
        groundMesh = new Mesh { name = "Continuous 256m review ground" };
        float h = GroundSize * .5f;
        groundMesh.vertices = new[] { new Vector3(-h, 0, -h), new Vector3(-h, 0, h), new Vector3(h, 0, h), new Vector3(h, 0, -h) };
        groundMesh.uv = new[] { new Vector2(-.5f, -.5f), new Vector2(-.5f, 1.5f), new Vector2(1.5f, 1.5f), new Vector2(1.5f, -.5f) };
        groundMesh.triangles = new[] { 0, 1, 2, 0, 2, 3 };
        groundMesh.RecalculateNormals(); groundMesh.RecalculateBounds(); NewAsset(groundMesh, "Meshes/Ground.asset");
        quadMesh = new Mesh { name = "Review feedback quad" };
        quadMesh.vertices = new[] { new Vector3(-.5f, -.5f, 0), new Vector3(-.5f, .5f, 0), new Vector3(.5f, .5f, 0), new Vector3(.5f, -.5f, 0) };
        quadMesh.uv = new[] { Vector2.zero, Vector2.up, Vector2.one, Vector2.right };
        quadMesh.triangles = new[] { 0, 1, 2, 0, 2, 3 };
        quadMesh.RecalculateNormals(); quadMesh.RecalculateBounds(); NewAsset(quadMesh, "Meshes/FeedbackQuad.asset");
        // Low, asymmetric stone profile used only in two composed outcrops outside the approach ring.
        rockMesh = new Mesh { name = "Weathered ash stone" };
        rockMesh.vertices = new[] { new Vector3(-.8f, 0, -.6f), new Vector3(.7f, 0, -.7f), new Vector3(1, 0, .4f), new Vector3(-.65f, 0, .8f),
            new Vector3(-.45f, .7f, -.25f), new Vector3(.38f, .85f, -.30f), new Vector3(.5f, .48f, .35f), new Vector3(-.25f, .60f, .5f) };
        rockMesh.triangles = new[] { 0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,4,7,6,4,6,5 };
        rockMesh.uv = rockMesh.vertices.Select(v => new Vector2(v.x, v.z)).ToArray();
        rockMesh.RecalculateNormals(); rockMesh.RecalculateBounds(); NewAsset(rockMesh, "Meshes/AshStone.asset");
    }

    static Bounds BoundsOf(GameObject root)
    {
        bool first = true; var result = new Bounds();
        foreach (var filter in root.GetComponentsInChildren<MeshFilter>(true))
            foreach (var vertex in filter.sharedMesh.vertices)
            {
                Vector3 point = filter.transform.TransformPoint(vertex);
                Require(float.IsFinite(point.x) && float.IsFinite(point.y) && float.IsFinite(point.z), "Nonfinite review mesh");
                if (first) { result = new Bounds(point, Vector3.zero); first = false; }
                else result.Encapsulate(point);
            }
        Require(!first, "Review object has no mesh vertices: " + root.name);
        return result;
    }

    static GameObject Vehicle(string id, out VehicleProof proof)
    {
        string path = Art + "/" + id + ".fbx";
        var importer = AssetImporter.GetAtPath(path) as ModelImporter;
        Require(importer, "Missing review model importer: " + id);
        importer.importAnimation = false; importer.importCameras = false; importer.importLights = false;
        importer.globalScale = 1; importer.isReadable = false;
        importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard; importer.SaveAndReimport();
        var root = new GameObject(id);
        var model = (GameObject)PrefabUtility.InstantiatePrefab(Load<GameObject>(path));
        model.transform.SetParent(root.transform, false);
        foreach (var renderer in model.GetComponentsInChildren<Renderer>(true))
        {
            var mapped = renderer.sharedMaterials;
            for (int i = 0; i < mapped.Length; i++)
            {
                string key = mapped[i] ? mapped[i].name : "";
                Require(Materials.TryGetValue(key, out var material), "Unmapped enemy material: " + key);
                mapped[i] = material;
            }
            renderer.sharedMaterials = mapped;
        }
        var bounds = BoundsOf(root);
        model.transform.position += Vector3.up * -bounds.min.y;
        bounds = BoundsOf(root);
        int wheels = root.GetComponentsInChildren<Transform>(true).Count(t => t.name.StartsWith("Wheel_"));
        Require(wheels == 10 && Mathf.Abs(bounds.min.y) < .002f, "Enemy wheels/ground contact: " + id);
        Require(bounds.size.x > 2 && bounds.size.x < 2.5f && bounds.size.z > 2.5f && bounds.size.z < 4, "Enemy axes or units: " + id + " " + bounds);
        proof = new VehicleProof { id = id, center = bounds.center, size = bounds.size, wheels = wheels,
            triangles = root.GetComponentsInChildren<MeshFilter>(true).Sum(f => f.sharedMesh.triangles.Length / 3) };
        var prefab = PrefabUtility.SaveAsPrefabAsset(root, Root + "/Prefabs/" + id + ".prefab");
        UnityEngine.Object.DestroyImmediate(root);
        return prefab;
    }

    static GameObject MeshObject(string name, Transform parent, Mesh mesh, Material material, Vector3 position, Vector3 scale)
    {
        var obj = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
        obj.transform.SetParent(parent, false); obj.transform.localPosition = position; obj.transform.localScale = scale;
        obj.GetComponent<MeshFilter>().sharedMesh = mesh; obj.GetComponent<MeshRenderer>().sharedMaterial = material;
        return obj;
    }

    static void Surface(string name, Transform parent, Vector3 position, Vector2 size, float yaw, Material material)
    {
        var surface = MeshObject(name, parent, quadMesh, material, position, new Vector3(size.x, size.y, 1));
        surface.transform.localRotation = Quaternion.Euler(90, yaw, 0);
        surface.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
    }

    static GameObject Prop(string id, Transform parent, float x, float z, float yaw)
    {
        var source = Load<GameObject>("Assets/PartsLibrary/Prefabs/" + id + ".prefab");
        var prop = (GameObject)PrefabUtility.InstantiatePrefab(source);
        prop.name = id + " scenery"; prop.transform.SetParent(parent, false);
        prop.transform.localPosition = new Vector3(x, 0, z); prop.transform.localRotation = Quaternion.Euler(0, yaw, 0);
        prop.transform.position += Vector3.up * -BoundsOf(prop).min.y;
        return prop;
    }

    static Transform Group(string name, Transform parent)
    {
        var group = new GameObject(name).transform; group.SetParent(parent, false); return group;
    }

    static void Stone(Transform parent, Vector3 position, Vector3 scale, float yaw, bool earth = false)
    {
        var stone = MeshObject(earth ? "Low ash berm" : "Basalt ledge", parent, rockMesh,
            Materials[earth ? "AshBerm" : "AshStone"], position, scale);
        stone.transform.localRotation = Quaternion.Euler(0, yaw, 0);
    }

    static GameObject Ash()
    {
        var root = new GameObject("A - Sunlit ash clearing");
        MeshObject("ContinuousGround", root.transform, groundMesh, Materials["GroundAsh"], Vector3.zero, Vector3.one);
        var depot = Group("Abandoned roadside service post", root.transform);
        Prop("STK-B01", depot, -29, -15, 15); Prop("STK-B01", depot, -31.9f, -15.8f, 15);
        Prop("STK-B01", depot, -34.8f, -16.6f, 15); Prop("STK-B01", depot, -36, -19, 103);
        Prop("STK-B04", depot, -33, -21.5f, 14); Prop("STK-B03", depot, -29.5f, -21, -7);
        Prop("STK-B03", depot, -29.1f, -23.2f, 5); Prop("STK-B02", depot, -37, -24, 94);
        var north = Group("Broken retaining line", root.transform);
        Prop("STK-B02", north, 17, 30, -18); Prop("STK-B02", north, 20.3f, 31, -18);
        Prop("STK-B01", north, 24.3f, 32.1f, -18);
        Stone(north, new Vector3(28, 0, 29), new Vector3(3.4f, .65f, 2.8f), 17, true);
        Stone(north, new Vector3(30, 0, 25), new Vector3(2.7f, .8f, 2.0f), 35);
        Stone(north, new Vector3(32, 0, 22), new Vector3(1.9f, .65f, 1.6f), 71);
        var west = Group("Scorched stone shelf", root.transform);
        Stone(west, new Vector3(-30, 0, 20), new Vector3(4.5f, .8f, 3.1f), -23, true);
        Stone(west, new Vector3(-27, 0, 24.5f), new Vector3(2.9f, .9f, 2.2f), 12);
        Stone(west, new Vector3(-25.2f, 0, 27), new Vector3(2, .6f, 1.6f), 53);
        Stone(west, new Vector3(-33, 0, 17), new Vector3(2.2f, .55f, 1.8f), 20);
        Surface("Old shell scar", root.transform, new Vector3(12, .012f, -13), new Vector2(6, 4), -27, Materials["Scorch"]);
        Surface("Weathered shell scar", root.transform, new Vector3(-16, .013f, 6), new Vector2(3.8f, 3.2f), 19, Materials["Scorch"]);
        foreach (float x in new[] { -1.7f, 1.7f }) for (int i = 0; i < 21; i++)
            Surface("Tank approach tread", root.transform, new Vector3(x, .016f, 4 + i * .4f), new Vector2(.70f, .08f), 0, Materials["RoadSoot"]);
        return root;
    }

    static GameObject Iron()
    {
        var root = new GameObject("B - Cool industrial perimeter");
        MeshObject("ContinuousGround", root.transform, groundMesh, Materials["GroundIron"], Vector3.zero, Vector3.one);
        var service = Group("West service apron", root.transform);
        Surface("Worn concrete apron", service, new Vector3(-35, .016f, -7), new Vector2(12, 36), 0, Materials["IronApron"]);
        for (int i = 0; i < 4; i++) Prop("STK-B02", service, -29.5f, -19 + 3.5f * i, 90);
        Prop("STK-B04", service, -34, -15.5f, 90); Prop("STK-B04", service, -34, -11.2f, 90);
        Prop("STK-B03", service, -34, 3.5f, 0); Prop("STK-B03", service, -36.3f, 3.5f, 0);
        for (int i = 0; i < 5; i++)
            Surface("Worn apron bay marker", service, new Vector3(-31, .020f, -20 + i * 7), new Vector2(6, .12f), 0, Materials["FadedWarning"]);
        var east = Group("East perimeter hardstand", root.transform);
        Surface("Broken hardstand", east, new Vector3(32, .016f, 13), new Vector2(10, 33), 0, Materials["IronApron"]);
        for (int i = 0; i < 4; i++) Prop("STK-B02", east, 28, 15 + 3.4f * i, 90);
        Prop("STK-B02", east, 31, 28, 0); Prop("STK-B02", east, 34.3f, 28, 0);
        Prop("STK-B03", east, 32, 21, 0); Prop("STK-B03", east, 34.5f, 21, 0);
        Prop("STK-B04", east, 33, 9, -90);
        var entry = Group("South checkpoint remains", root.transform);
        Prop("STK-B02", entry, -13, -31, 0); Prop("STK-B02", entry, -16.3f, -31, 0);
        Prop("STK-B02", entry, 13, -31, 0); Prop("STK-B01", entry, 16.4f, -32, 14);
        // Embedded road seams and broken painted guides establish scale without raising obstacles.
        for (int sign = -1; sign <= 1; sign += 2)
        {
            Surface("Road drainage seam", root.transform, new Vector3(sign * 8.2f, .012f, 0), new Vector2(.10f, 100), 0, Materials["RoadSoot"]);
            for (int i = 0; i < 8; i++)
                Surface("Faded lane edge", root.transform, new Vector3(sign * 7.6f, .015f, -29 + i * 8), new Vector2(.14f, 2.8f), 0, Materials["FadedWarning"]);
        }
        return root;
    }

    static UniversalRenderPipelineAsset Pipeline()
    {
        var pipeline = UnityEngine.Object.Instantiate(Load<UniversalRenderPipelineAsset>("Assets/Materials/ArtPipeline.asset"));
        pipeline.name = "ReviewPipeline"; pipeline.shadowDistance = 130; pipeline.shadowCascadeCount = 4;
        pipeline.cascade4Split = new Vector3(.15f, .35f, .65f);
        var settings = new SerializedObject(pipeline);
        settings.FindProperty("m_SoftShadowsSupported").boolValue = true;
        settings.ApplyModifiedPropertiesWithoutUndo();
        pipeline.mainLightShadowmapResolution = 2048;
        pipeline.shadowDepthBias = .35f; pipeline.shadowNormalBias = .4f;
        NewAsset(pipeline, "Materials/ReviewPipeline.asset"); return pipeline;
    }

    [MenuItem("singedTerra/Prepare new battlefield visual review")]
    public static void Prepare()
    {
        Require(Application.unityVersion == "6000.3.24f1", "Unexpected editor version");
        Require(!File.Exists(ScenePath) && !Directory.Exists(Root), "Saved review art exists; edit it directly instead of regenerating it");
        Require(Digest(OriginalScene) == OriginalHash, "Unexpected FieldAssembly source; preserve and inspect it before authoring");
        var preserved = ProtectedFiles();
        foreach (string folder in new[] { "Materials", "Meshes", "Textures", "Prefabs" }) Directory.CreateDirectory(Root + "/" + folder);
        AssetDatabase.Refresh(); MaterialsAndMeshes();
        var close = Vehicle("STV-E01", out var closeProof); var ranged = Vehicle("STV-E02", out var rangedProof);
        var pipeline = Pipeline();
        var scene = EditorSceneManager.OpenScene(OriginalScene, OpenSceneMode.Single);
        var presentation = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        Require(presentation && presentation.GetComponent<ArtHud>(), "Retained presentation and HUD required");
        var clearing = scene.GetRootGameObjects().SingleOrDefault(g => g.name == "Clearing");
        Require(clearing, "Retained clearing instance not found");
        // Removing this scene instance never edits its saved prefab or original scene.
        UnityEngine.Object.DestroyImmediate(clearing);
        var review = presentation.gameObject.AddComponent<BattlefieldReview>();
        review.closeVehicle = close; review.rangedVehicle = ranged; review.reviewPipeline = pipeline;
        review.ashEnvironment = Ash(); review.ironEnvironment = Iron(); review.ironEnvironment.SetActive(false);
        review.sun = RenderSettings.sun;
        review.effectQuad = quadMesh; review.flashMaterial = Materials["Flash"];
        review.dustMaterial = Materials["Dust"]; review.scorchMaterial = Materials["Scorch"];
        presentation.view.farClipPlane = 180;
        presentation.view.backgroundColor = new Color(.21f, .22f, .21f);
        EditorSceneManager.SaveScene(scene, ScenePath); AssetDatabase.SaveAssets();
        CheckProtected(preserved);
        var receipt = new PreparationProof { editor = Application.unityVersion, sourceScene = OriginalScene,
            sourceSceneSha256 = OriginalHash, preserved = preserved, vehicles = new[] { closeProof, rangedProof } };
        File.WriteAllText(Root + "/prepare-receipt.json", JsonUtility.ToJson(receipt, true));
        AssetDatabase.Refresh(); Validate();
        Debug.Log("ST_VIS_PREPARED " + ScenePath + " " + JsonUtility.ToJson(receipt));
    }

    public static void Validate()
    {
        Require(UnityEngine.SceneManagement.SceneManager.GetActiveScene().path == ScenePath, "Open the saved BattlefieldReview scene before validation");
        SceneBuild.Validate();
        var review = UnityEngine.Object.FindFirstObjectByType<BattlefieldReview>();
        Require(review && review.ashEnvironment && review.ironEnvironment && review.sun, "Incomplete saved review environment references");
        Require(review.GetComponent<TankPresentation>() && review.GetComponent<ArtHud>(), "Review replaced an existing presentation owner");
        Require(UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsSortMode.None).Length == 1, "Review must retain one camera");
        foreach (var environment in new[] { review.ashEnvironment, review.ironEnvironment })
        {
            Require(environment.GetComponentsInChildren<Collider>(true).Length == 0, "Scenery acquired colliders");
            Require(environment.GetComponentsInChildren<MonoBehaviour>(true).Length == 0, "Scenery acquired gameplay behavior");
            var ground = environment.transform.Find("ContinuousGround");
            Require(ground, "Continuous review ground missing");
            var bounds = ground.GetComponent<Renderer>().bounds;
            Require(bounds.size.x >= GroundSize && bounds.size.z >= GroundSize && Mathf.Abs(bounds.center.y) < .002f, "Review ground extent/contact changed");
        }
        foreach (var vehicle in new[] { review.closeVehicle, review.rangedVehicle })
        {
            Require(vehicle && AssetDatabase.GetAssetPath(vehicle).StartsWith(Root + "/Prefabs/"), "Saved review enemy prefab missing");
            Require(vehicle.GetComponentsInChildren<Collider>(true).Length == 0 && vehicle.GetComponentsInChildren<MonoBehaviour>(true).Length == 0,
                "Enemy art prefab acquired simulation behavior");
            Require(vehicle.GetComponentsInChildren<Transform>(true).Count(t => t.name.StartsWith("Wheel_")) == 10, "Ten articulated vehicle wheels required");
            foreach (var renderer in vehicle.GetComponentsInChildren<Renderer>(true)) foreach (var material in renderer.sharedMaterials)
                Require(material && material.shader.name == "Universal Render Pipeline/Lit" && material.IsKeywordEnabled("_EMISSION")
                    && AssetDatabase.GetAssetPath(material).StartsWith(Root + "/Materials/"), "Unmapped enemy material: " + renderer.name);
        }
        Require(review.effectQuad && review.effectQuad.vertexCount == 4, "Feedback quad missing");
        foreach (var material in new[] { review.flashMaterial, review.dustMaterial, review.scorchMaterial })
            Require(material && material.GetTexture("_BaseMap") && material.GetFloat("_Surface") == 1 && material.GetFloat("_ZWrite") == 0,
                "Feedback requires transparent textured material");
        var pipeline = review.reviewPipeline as UniversalRenderPipelineAsset;
        Require(pipeline && pipeline.shadowDistance >= 120 && pipeline.supportsSoftShadows, "Review camera requires a separate long-range shadow pipeline");
        ReadCompatibilityProof();
        var proof = JsonUtility.FromJson<PreparationProof>(File.ReadAllText(Root + "/prepare-receipt.json"));
        CheckProtected(proof.preserved);
        Debug.Log("ST_VIS_VALIDATE_PASS saved clone; retained art hashes; mapped grounded enemies; 256m continuous terrain; scenery-only props; feedback; shadows");
    }

    public static void BuildWeb()
    {
        Require(Application.unityVersion == "6000.3.24f1", "Unexpected editor version");
        Require(BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL), "Pinned Web Build Support missing");
        Check();
        string output = Environment.GetEnvironmentVariable("ST_ART_WEB_OUTPUT");
        Require(!string.IsNullOrWhiteSpace(output) && Path.IsPathRooted(output), "Set ST_ART_WEB_OUTPUT to a fresh absolute output directory");
        output = Path.GetFullPath(output);
        Require(!Directory.Exists(output), "Refusing to replace an existing build directory");
        string before = Digest(ScenePath);
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = false;
        var previousPipeline = QualitySettings.renderPipeline;
        BuildReport report;
        try
        {
            // URP's build preprocessor gathers Quality/Graphics settings. A scene
            // reference alone does not retain soft-shadow/cascade shader variants.
            QualitySettings.renderPipeline = UnityEngine.Object.FindFirstObjectByType<BattlefieldReview>().reviewPipeline;
            report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { ScenePath }, locationPathName = output,
                target = BuildTarget.WebGL, options = BuildOptions.Development });
        }
        finally { QualitySettings.renderPipeline = previousPipeline; }
        Require(report.summary.result == BuildResult.Succeeded, "Review Web build failed: " + report.summary.result);
        Require(File.Exists(Path.Combine(output, "index.html")) && Directory.GetFiles(output, "*.wasm", SearchOption.AllDirectories).Any(), "Missing review Web output");
        Require(Digest(ScenePath) == before, "Export changed saved review scene");
        Require(Digest(OriginalScene) == OriginalHash, "Export changed retained FieldAssembly");
        Debug.Log("ST_VIS_WEB_BUILD_PASS bytes=" + report.summary.totalSize + " path=" + output);
    }

    public static void Check()
    {
        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        VisualReviewPreservationChecks.Run();
        Validate(); EncounterChecks.Run(); ReviewHudChecks.Run(); VisualReviewChecks.Run();
    }

    public static void RepairEnemyHitMaterials()
    {
        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        var review = UnityEngine.Object.FindFirstObjectByType<BattlefieldReview>();
        Require(review && review.closeVehicle && review.rangedVehicle, "Saved review vehicles required for material repair");
        var materials = new[] { review.closeVehicle, review.rangedVehicle }
            .SelectMany(v => v.GetComponentsInChildren<Renderer>(true)).SelectMany(r => r.sharedMaterials).Distinct().ToArray();
        foreach (var material in materials)
        {
            string path = AssetDatabase.GetAssetPath(material);
            Require(path.StartsWith(Root + "/Materials/Enemy"), "Refuse to change retained material: " + path);
            EnableHitFlash(material); EditorUtility.SetDirty(material);
        }
        AssetDatabase.SaveAssets();
        foreach (var material in materials) AssetDatabase.ImportAsset(AssetDatabase.GetAssetPath(material), ImportAssetOptions.ForceUpdate);
        Validate();
        Debug.Log("ST_VIS_MATERIAL_REPAIR_PASS six new enemy materials retain hit-flash variants after import");
    }
}
