using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using SingedTerra.VisualReview;

// Export only the committed playable scene. No scene authoring occurs in a build.
public static class LastStandLoopBuild
{
    public const string ScenePath = "Assets/Scenes/LastStandPrototype.unity";
    const string FieldScene = "Assets/Scenes/FieldAssembly.unity";
    const string ReviewScene = "Assets/Scenes/BattlefieldReview.unity";

    static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    static string Digest(string path)
    {
        using (var stream = File.OpenRead(path))
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    public static void BuildWeb()
    {
        Require(Application.unityVersion == "6000.3.24f1", "Unexpected editor version");
        Require(BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL), "Pinned Web Build Support missing");
        Require(File.Exists(ScenePath), "Saved Last Stand scene missing");
        string sceneBefore = Digest(ScenePath), fieldBefore = Digest(FieldScene), reviewBefore = Digest(ReviewScene);
        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        EncounterChecks.Run();
        LastStandLoopChecks.Run();
        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        var review = UnityEngine.Object.FindFirstObjectByType<BattlefieldReview>();
        Require(review && review.reviewPipeline is UniversalRenderPipelineAsset, "Saved Last Stand review pipeline missing");

        string output = Environment.GetEnvironmentVariable("ST_ART_WEB_OUTPUT");
        Require(!string.IsNullOrWhiteSpace(output) && Path.IsPathRooted(output), "Set ST_ART_WEB_OUTPUT to a fresh absolute output directory");
        output = Path.GetFullPath(output);
        Require(!Directory.Exists(output), "Refusing to replace an existing build directory");
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = false;
        var previousPipeline = QualitySettings.renderPipeline;
        BuildReport report;
        try
        {
            QualitySettings.renderPipeline = review.reviewPipeline;
            report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { ScenePath }, locationPathName = output,
                target = BuildTarget.WebGL, options = BuildOptions.Development });
        }
        finally { QualitySettings.renderPipeline = previousPipeline; }
        Require(report.summary.result == BuildResult.Succeeded, "Last Stand Web build failed: " + report.summary.result);
        Require(File.Exists(Path.Combine(output, "index.html")) && Directory.GetFiles(output, "*.wasm", SearchOption.AllDirectories).Any(), "Missing Last Stand Web output");
        Require(Digest(ScenePath) == sceneBefore && Digest(FieldScene) == fieldBefore && Digest(ReviewScene) == reviewBefore,
            "Build changed a saved scene");
        Debug.Log("ST_LS_WEB_BUILD_PASS bytes=" + report.summary.totalSize + " path=" + output);
    }
}
