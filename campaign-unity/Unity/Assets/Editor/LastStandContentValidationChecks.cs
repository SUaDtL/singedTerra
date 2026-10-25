using System;
using System.Linq;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

// Mutate only disposable preview scenes, then call the real player-build hook.
// No scene is saved and no application lifecycle or profile writer is started.
public static class LastStandContentValidationChecks
{
    static void Require(bool condition, string message)
    { if (!condition) throw new InvalidOperationException(message); }

    static void Reject(string name, string expected, Action<Scene, LastStandLoopController> change)
    {
        var scene = EditorSceneManager.OpenPreviewScene(LastStandLoopBuild.ScenePath);
        try
        {
            var validation = new LastStandContentValidation();
            var controllers = scene.GetRootGameObjects()
                .SelectMany(root => root.GetComponentsInChildren<LastStandLoopController>(true)).ToArray();
            Require(controllers.Length == 1, "The actual saved scene must begin with one composition root.");
            validation.OnProcessScene(scene, null);
            change(scene, controllers[0]);
            bool refused = false;
            try { validation.OnProcessScene(scene, null); }
            catch (BuildFailedException error)
            {
                Require(error.Message == expected, name + " reached a different refusal: " + error.Message);
                refused = true;
            }
            Require(refused, name + " was admitted by the actual build hook.");
            Debug.Log("ST_CONTENT_VALIDATION_CHECK_PASS " + name);
        }
        finally { EditorSceneManager.ClosePreviewScene(scene); }
    }

    public static void Run()
    {
        try
        {
            LastStandContentValidation.ValidateDefinitions();
            Reject("missing_composition_root", "Last Stand requires exactly one game composition root.",
                (scene, controller) => UnityEngine.Object.DestroyImmediate(controller));
            Reject("duplicate_composition_root", "Last Stand requires exactly one game composition root.",
                (scene, controller) => {
                    var duplicate = UnityEngine.Object.Instantiate(controller.gameObject);
                    SceneManager.MoveGameObjectToScene(duplicate, scene);
                });
            Reject("missing_battlefield", "Last Stand has no battlefield presentation.",
                (scene, controller) => UnityEngine.Object.DestroyImmediate(controller.GetComponent<BattlefieldReview>()));
            Reject("missing_tier_environment", "Tier 2: The selected battlefield has no authored environment.",
                (scene, controller) => {
                    var view = controller.GetComponent<BattlefieldReview>();
                    view.environmentBindings = new[] { new BattlefieldReview.EnvironmentBinding {
                        environmentId = "sunlit-ash", root = view.ashEnvironment } };
                });
            Reject("missing_environment_root", "Tier 1: Battlefield environment bindings are incomplete or duplicated.",
                (scene, controller) => {
                    var view = controller.GetComponent<BattlefieldReview>();
                    view.environmentBindings = new[] {
                        new BattlefieldReview.EnvironmentBinding { environmentId = "sunlit-ash", root = view.ashEnvironment },
                        new BattlefieldReview.EnvironmentBinding { environmentId = "iron-perimeter", root = null } };
                });
            Reject("missing_scene_light", "Tier 1: Battlefield environment has no scene light.",
                (scene, controller) => controller.GetComponent<BattlefieldReview>().sun = null);
        }
        catch (Exception error)
        {
            Debug.LogError("ST_CONTENT_VALIDATION_CHECK_FAIL " + error);
            EditorApplication.Exit(1);
        }
    }
}
