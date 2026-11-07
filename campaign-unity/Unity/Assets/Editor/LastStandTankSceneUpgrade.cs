using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using SingedTerra.Art;

// Explicit authoring step. Player builds only read the saved production scene.
public static class LastStandTankSceneUpgrade
{
    public static void ImportAndPrepare(){LastStandTankKitImport.Prepare();Prepare();}
    public static void Prepare()
    {
        var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(LastStandTankKitImport.BindingPath);
        if(!prefab||!prefab.GetComponent<LastStandTankVisuals>())throw new InvalidOperationException("Import tank kits before scene wiring.");
        var scene=EditorSceneManager.OpenScene(LastStandLoopBuild.ScenePath,OpenSceneMode.Single);
        var art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        if(!art)throw new InvalidOperationException("Saved Last Stand tank presentation is missing.");
        var binding=prefab.GetComponent<LastStandTankVisuals>();
        if(art.tankVisualsPrefab && art.tankVisualsPrefab!=binding)
            throw new InvalidOperationException("Preserve an independently authored appearance binding.");
        art.tankVisualsPrefab=binding;EditorUtility.SetDirty(art);
        EditorSceneManager.MarkSceneDirty(scene);
        if(!EditorSceneManager.SaveScene(scene))throw new IOException("Last Stand scene could not be saved.");
        Debug.Log("ST_TANK_SCENE_UPGRADE_PASS "+LastStandLoopBuild.ScenePath);
    }
}
