using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using SingedTerra.PartsGallery;

// One-time authoring of a separate saved scene; exports only open that scene.
public static class PartsGalleryBuild
{
    const string ScenePath = PartsGalleryChecks.ScenePath;
    const string Prefabs = "Assets/PartsLibrary/Prefabs/";

    [Serializable] sealed class Catalog { public Item[] items; }
    [Serializable] sealed class Item
    { public string id, title, category, mount, description; }

    static void Require(bool condition, string name)
    { if (!condition) throw new InvalidOperationException("ST_KIT_GALLERY_FAIL " + name); }

    [MenuItem("singedTerra/Prepare parts gallery scene")]
    public static void Prepare()
    {
        Require(Application.unityVersion == "6000.3.24f1", "pinned editor version");
        Require(!File.Exists(ScenePath), "refuse to replace saved gallery scene");
        var catalog = JsonUtility.FromJson<Catalog>(File.ReadAllText("Assets/Art/PartsLibrary/catalog.json"));
        Require(catalog.items != null && catalog.items.Length == 20 &&
            catalog.items.Select(item => item.id).Distinct().Count() == 20, "20 source entries");
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        var camera = new GameObject("GalleryCamera", typeof(Camera)).GetComponent<Camera>();
        camera.tag = "MainCamera"; camera.fieldOfView = 43; camera.nearClipPlane = .1f;
        camera.farClipPlane = 120; camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(.12f, .13f, .12f);
        var light = new GameObject("GalleryKey", typeof(Light)).GetComponent<Light>();
        light.type = LightType.Directional; light.intensity = 1.6f;
        light.color = new Color(1, .92f, .77f);
        light.shadows = LightShadows.Soft; light.transform.rotation = Quaternion.Euler(48, -35, 0);
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(.52f, .54f, .52f);
        RenderSettings.ambientEquatorColor = new Color(.29f, .28f, .24f);
        RenderSettings.ambientGroundColor = new Color(.15f, .14f, .12f);
        RenderSettings.sun = light;

        var floor = GameObject.CreatePrimitive(PrimitiveType.Cylinder); floor.name = "Inspection plinth";
        UnityEngine.Object.DestroyImmediate(floor.GetComponent<Collider>());
        floor.transform.position = new Vector3(0, -.16f, 0);
        floor.transform.localScale = new Vector3(7.2f, .14f, 7.2f);
        floor.GetComponent<Renderer>().sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Concrete.mat");
        Require(floor.GetComponent<Renderer>().sharedMaterial, "retained concrete material");

        var owner = new GameObject("PartsGallery").AddComponent<PartsGalleryController>();
        owner.viewCamera = camera;
        owner.entries = catalog.items.Select(item => NewEntry(item.id, item.title, item.category,
            item.mount, item.description)).Concat(new[]
        {
            NewEntry("STK-S01", "Service", "Assembly", "complete tank", "Olive service study: G01 cannon, M01 module and C01 fitting."),
            NewEntry("STK-S02", "Bulwark", "Assembly", "complete tank", "Slate armor study: G02 gun, M04 module and A01-A03 armor."),
            NewEntry("STK-S03", "Fire support", "Assembly", "complete tank", "Oxide support study: G03 gun, M02 module and C02-C03 fittings.")
        }).ToArray();
        EditorSceneManager.SaveScene(scene, ScenePath); AssetDatabase.SaveAssets(); AssetDatabase.Refresh();
        PartsGalleryChecks.Run();
        Debug.Log("ST_KIT_GALLERY_PREPARED " + ScenePath);
    }

    static PartsGalleryController.Entry NewEntry(string id, string title, string category, string mount, string description)
    {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Prefabs + id + ".prefab");
        Require(prefab, "missing saved prefab " + id);
        return new PartsGalleryController.Entry { id = id, title = title,
            category = category, mount = mount, description = description, prefab = prefab };
    }

    public static void BuildWeb()
    {
        Require(Application.unityVersion == "6000.3.24f1", "pinned editor version");
        Require(BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL), "WebGL support");
        PartsGalleryChecks.Run();
        string output = Environment.GetEnvironmentVariable("ST_ART_WEB_OUTPUT");
        Require(!string.IsNullOrWhiteSpace(output), "fresh output path required");
        output = Path.GetFullPath(output);
        Require(!Directory.Exists(output), "refuse to replace existing build");
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = false;
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        { scenes = new[] { ScenePath }, locationPathName = output,
          target = BuildTarget.WebGL, options = BuildOptions.Development });
        Require(report.summary.result == BuildResult.Succeeded, "Web build: " + report.summary.result);
        Require(File.Exists(Path.Combine(output, "index.html")) &&
            Directory.GetFiles(output, "*.wasm", SearchOption.AllDirectories).Any(), "Web output files");
        Debug.Log("ST_KIT_GALLERY_WEB_BUILD_PASS bytes=" + report.summary.totalSize + " path=" + output);
    }
}
