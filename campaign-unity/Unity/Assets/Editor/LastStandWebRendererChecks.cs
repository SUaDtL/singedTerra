using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering.Universal;

public static class LastStandWebRendererChecks
{
    sealed class SimulatedBuildFailure : Exception { }
    static void Require(bool condition, string message)
    { if (!condition) throw new InvalidOperationException(message); }

    public static void Run()
    {
        // The saved scene renderer and the newer Resources pipeline both ship.
        var paths = new[] { "Assets/Materials/ArtRenderer.asset",
            "Assets/Resources/ArtDirection/ConceptRenderer.asset" };
        var renderers = paths.Select(AssetDatabase.LoadAssetAtPath<UniversalRendererData>).ToArray();
        Require(renderers.All(renderer => renderer), "Required authored renderers missing");
#pragma warning disable 618
        var nativeShaders = renderers.Select(renderer => renderer.debugShaders.hdrDebugViewPS).ToArray();
        Require(nativeShaders.All(shader => shader), "Native HDR debug resources must remain authored");
        var bytes = paths.Select(File.ReadAllBytes).ToArray();
        foreach (bool failBuild in new[] { false, true })
        {
            bool failedAsRequested = false;
            try
            {
                using (var scope = new LastStandLoopBuild.WebRendererDebugScope())
                {
                    for (int i = 0; i < renderers.Length; i++)
                        Require(renderers[i].debugShaders.hdrDebugViewPS == null,
                            "WebGL renderer dependency still references HDR debug shader: " + paths[i]);
                    Require(scope.AllCleared, "Build must observe every renderer reference cleared");
                    if (failBuild) throw new SimulatedBuildFailure();
                }
            }
            catch (SimulatedBuildFailure) { failedAsRequested = true; }
            finally
            {
                for (int i = 0; i < renderers.Length; i++)
                    Require(renderers[i].debugShaders.hdrDebugViewPS == nativeShaders[i],
                        "Build must restore native renderer resources: " + paths[i]);
                AssetDatabase.SaveAssets();
                for (int i = 0; i < paths.Length; i++)
                    Require(File.ReadAllBytes(paths[i]).SequenceEqual(bytes[i]),
                        "Build must preserve saved renderer bytes: " + paths[i]);
            }
            Require(failedAsRequested == failBuild, "Failure cleanup branch was not exercised");
        }
#pragma warning restore 618
        Debug.Log("ST_LS_WEB_RENDERER_PASS scene_and_resources_normal_and_failure_restore");
    }
}
