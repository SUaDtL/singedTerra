using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class PartsGalleryChecks
{
    public const string ScenePath = "Assets/PartsLibrary/PartsGallery.unity";

    static void Require(bool condition, string name)
    {
        if (!condition) throw new InvalidOperationException("ST_KIT_GALLERY_FAIL " + name);
    }

    public static void Run()
    {
        Require(File.Exists(ScenePath), "saved gallery scene missing");
        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        var owners = UnityEngine.Object.FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None)
            .Where(owner => owner.GetType().Name == "PartsGalleryController").ToArray();
        Require(owners.Length == 1, "exactly one gallery owner");
        var owner = owners[0];
        var type = owner.GetType();
        var viewCamera = type.GetField("viewCamera").GetValue(owner) as Camera;
        var entries = type.GetField("entries").GetValue(owner) as Array;
        Require(viewCamera && entries != null && entries.Length == 23,
            "camera and 23 selectable entries");
        var ids = entries.Cast<object>().Select(entry => (string)entry.GetType().GetField("id").GetValue(entry)).ToArray();
        Require(ids.Distinct().Count() == 23,
            "stable unique entry ids");
        foreach (var entry in entries)
        {
            var itemType = entry.GetType();
            var id = (string)itemType.GetField("id").GetValue(entry);
            var prefab = itemType.GetField("prefab").GetValue(entry) as GameObject;
            Require(prefab && AssetDatabase.GetAssetPath(prefab) ==
                "Assets/PartsLibrary/Prefabs/" + id + ".prefab", "prefab binding " + id);
        }
        Require(ids.Count(id => id.StartsWith("STK-S", StringComparison.Ordinal)) == 3,
            "three assembly examples");
        foreach (string paint in new[] { "KitPaint_Olive", "KitPaint_Slate", "KitPaint_Oxide" })
            Require(AssetDatabase.LoadAssetAtPath<Material>("Assets/PartsLibrary/Materials/" + paint + ".mat"),
                "saved paint " + paint);
        Debug.Log("ST_KIT_GALLERY_PASS scene/owner/23-prefabs/3-assemblies/3-paints");
    }
}
