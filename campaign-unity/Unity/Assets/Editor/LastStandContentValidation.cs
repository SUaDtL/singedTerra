using System;
using System.Collections.Generic;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

// Run by both player targets. Content is admitted before packaging, and real
// scene bindings use the same read-only validation as runtime selection.
public sealed class LastStandContentValidation : IPreprocessBuildWithReport, IProcessSceneWithReport
{
    public int callbackOrder => -100;
    public void OnPreprocessBuild(BuildReport report) => ValidateDefinitions();
    public void OnProcessScene(Scene scene,BuildReport report)
    { if(scene.path==LastStandLoopBuild.ScenePath)ValidateScene(scene); }

    public static void ValidateDefinitions()
    {
        LastStandContentCatalog.Current.Validate();
        var ids=new HashSet<string>(StringComparer.Ordinal);
        foreach(var environment in LastStandEnvironmentCatalog.All)
            if(environment==null||!ids.Add(environment.Id))throw new BuildFailedException("Invalid environment presentation catalog.");
        foreach(var identity in LastStandContentCatalog.Current.Environments)
            if(!ids.Remove(identity.Id))throw new BuildFailedException("Environment has no presentation: "+identity.Id);
        if(ids.Count!=0)throw new BuildFailedException("Presentation environment lacks a content identity.");
    }
    static void ValidateScene(Scene scene)
    {
        int controllers=0;
        foreach(var root in scene.GetRootGameObjects())
            foreach(var controller in root.GetComponentsInChildren<LastStandLoopController>(true))
            {
                controllers++;
                var battlefield=controller.GetComponent<BattlefieldReview>();
                if(!battlefield)throw new BuildFailedException("Last Stand has no battlefield presentation.");
                foreach(var tier in LastStandContentCatalog.Current.Tiers)
                    if(!battlefield.CanPresentEnvironment(tier.EnvironmentId,out var error))
                        throw new BuildFailedException("Tier "+tier.Id+": "+error);
            }
        if(controllers!=1)throw new BuildFailedException("Last Stand requires exactly one game composition root.");
    }
    public static void Run()
    {
        ValidateDefinitions();
        var preview=EditorSceneManager.OpenPreviewScene(LastStandLoopBuild.ScenePath);
        try { ValidateScene(preview);Debug.Log("ST_CONTENT_VALIDATION_PASS"); }
        finally { EditorSceneManager.ClosePreviewScene(preview); }
    }
}
