using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.Rendering;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using SingedTerra.VisualReview;

// Export only the committed playable scene. No scene authoring occurs in a build.
public static class LastStandLoopBuild
{
    public const string ScenePath = "Assets/Scenes/LastStandPrototype.unity";
    public static bool StripWebDebugSettings { get; private set; }
    public static bool WebDebugSettingsStripped { get; internal set; }
    const string FieldScene = "Assets/Scenes/FieldAssembly.unity";
    const string ReviewScene = "Assets/Scenes/BattlefieldReview.unity";
    const string WebSettingsPath = "Assets/WebGLShaders/LastStandWebGLGlobalSettings.asset";
    const string RendererPath = "Assets/Materials/ArtRenderer.asset";
    const string GraphicsPath = "ProjectSettings/GraphicsSettings.asset";
    const string QualityPath = "ProjectSettings/QualitySettings.asset";

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

    // The same saved production scene and behavioral checks feed every player target.
    public static UniversalRenderPipelineAsset PreparePlayerScene()
    {
        Require(File.Exists(ScenePath), "Saved Last Stand scene missing");
        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        EncounterChecks.Run();
        LastStandLoopChecks.Run();
        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        var review = UnityEngine.Object.FindFirstObjectByType<BattlefieldReview>();
        Require(review && review.reviewPipeline is UniversalRenderPipelineAsset, "Saved Last Stand review pipeline missing");
        return (UniversalRenderPipelineAsset)review.reviewPipeline;
    }

    public static BuildOptions PlayerOptions(string configuration)
    {
        if (configuration == "development") return BuildOptions.Development;
        if (configuration == "release") return BuildOptions.None;
        throw new InvalidOperationException("Expected development or release build configuration");
    }

    public static void PrepareShaderDiagnostics()
    {
        const string asset = "Packages/com.unity.render-pipelines.core/Editor/Lighting/ProbeVolume/VirtualOffset/TraceVirtualOffset.urtshader";
        var package = UnityEditor.PackageManager.PackageInfo.FindForAssetPath(asset);
        Require(package != null && package.name == "com.unity.render-pipelines.core" && package.version == "17.3.0",
            "Reviewed core shader package is unavailable");
        var binding = new StringBuilder();
        foreach (string relative in new[] {
            "Editor/Lighting/ProbeVolume/VirtualOffset/TraceVirtualOffset.urtshader",
            "Editor/Lighting/ProbeVolume/ProbeVolumeResourceStripper.cs",
            "Runtime/Lighting/ProbeVolume/ProbeVolumeGlobalSettings.cs",
            "ShaderLibrary/Sampling/Fibonacci.hlsl", "ShaderLibrary/Sampling/Hammersley.hlsl",
            "ShaderLibrary/Sampling/Sampling.hlsl", "ShaderLibrary/Common.hlsl" })
        {
            string source = File.ReadAllText(Path.Combine(package.resolvedPath, relative)).Replace("\r\n", "\n").Replace("\r", "\n");
            using (var sha = SHA256.Create())
                binding.Append(relative).Append('=').Append(BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(source)))
                    .Replace("-", "").ToLowerInvariant()).Append('\n');
        }
        using (var sha = SHA256.Create())
            Debug.Log("ST_LS_EDITOR_SHADER_REVIEW package=" + package.version + " sha256=" +
                BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(binding.ToString()))).Replace("-", "").ToLowerInvariant());
        if (Environment.GetEnvironmentVariable("ST_LS_REFRESH_EDITOR_SHADER_IMPORT") == "1")
        {
            Debug.Log("ST_LS_EDITOR_IMPORT_BEGIN asset=" + asset);
            AssetDatabase.ImportAsset(asset, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
            Debug.Log("ST_LS_EDITOR_IMPORT_END asset=" + asset);
        }
    }

    public static void BuildWeb()
    {
        Require(Application.unityVersion == "6000.3.27f2", "Unexpected editor version");
        Require(BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL), "Pinned Web Build Support missing");
        Require(File.Exists(ScenePath), "Saved Last Stand scene missing");
        PrepareShaderDiagnostics();
        string sceneBefore = Digest(ScenePath), fieldBefore = Digest(FieldScene), reviewBefore = Digest(ReviewScene);
        string rendererBefore = Digest(RendererPath);
        string graphicsBefore = Digest(GraphicsPath), qualityBefore = Digest(QualityPath);
        string webSettingsBefore = Digest(WebSettingsPath);
        byte[] graphicsSnapshot = File.ReadAllBytes(GraphicsPath);
        byte[] webSettingsSnapshot = File.ReadAllBytes(WebSettingsPath);
        var pipeline = PreparePlayerScene();
        string configuration = Environment.GetEnvironmentVariable("ST_LS_BUILD_CONFIGURATION") ?? "release";
        var options = PlayerOptions(configuration);

        string output = Environment.GetEnvironmentVariable("ST_ART_WEB_OUTPUT");
        Require(!string.IsNullOrWhiteSpace(output) && Path.IsPathRooted(output), "Set ST_ART_WEB_OUTPUT to a fresh absolute output directory");
        output = Path.GetFullPath(output);
        Require(!Directory.Exists(output), "Refusing to replace an existing build directory");
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = false;
        var previousPipeline = QualitySettings.renderPipeline;
        var previousSettings = EditorGraphicsSettings.GetRenderPipelineGlobalSettingsAsset<UniversalRenderPipeline>();
        var webSettings = AssetDatabase.LoadAssetAtPath<RenderPipelineGlobalSettings>(WebSettingsPath);
        Require(previousSettings && webSettings && previousSettings != webSettings,
            "Separate saved WebGL URP settings required");
        Require(UniversalRenderPipelineDebugDisplaySettings.Instance.lightingSettings.hdrDebugMode == HDRDebugMode.None,
            "HDR debug mode must be inactive for the WebGL player");
        var webRenderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
        Require(webRenderer, "Saved renderer data missing");
#pragma warning disable 618
        Require(webRenderer.debugShaders != null && webRenderer.debugShaders.hdrDebugViewPS,
            "Saved renderer HDR debug reference missing");
        var nativeHdrShader = webRenderer.debugShaders.hdrDebugViewPS;
#pragma warning restore 618
        Require(AssetDatabase.AssetPathToGUID(AssetDatabase.GetAssetPath(nativeHdrShader)) ==
            "573620ae32aec764abd4d728906d2587", "Unexpected saved HDR debug shader");
        BuildReport report;
        bool rendererRefStayedCleared = false;
        try
        {
            EditorGraphicsSettings.SetRenderPipelineGlobalSettingsAsset<UniversalRenderPipeline>(webSettings);
            QualitySettings.renderPipeline = pipeline;
            Require(EditorGraphicsSettings.GetRenderPipelineGlobalSettingsAsset<UniversalRenderPipeline>() == webSettings,
                "WebGL global settings were not selected");
#pragma warning disable 618
            webRenderer.debugShaders.hdrDebugViewPS = null;
            Require(webRenderer.debugShaders.hdrDebugViewPS == null,
                "WebGL renderer must omit unsupported HDR debug shader");
#pragma warning restore 618
            WebDebugSettingsStripped = false;
            StripWebDebugSettings = true;
            Debug.Log("ST_LS_PLAYER_BUILD_BEGIN target=webgl");
            report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { ScenePath }, locationPathName = output,
                target = BuildTarget.WebGL, options = options });
            Debug.Log("ST_LS_PLAYER_BUILD_END target=webgl result=" + report.summary.result);
#pragma warning disable 618
            rendererRefStayedCleared = webRenderer.debugShaders.hdrDebugViewPS == null;
#pragma warning restore 618
        }
        finally
        {
            StripWebDebugSettings = false;
#pragma warning disable 618
            try { webRenderer.debugShaders.hdrDebugViewPS = nativeHdrShader; }
#pragma warning restore 618
            finally
            {
                try { EditorGraphicsSettings.SetRenderPipelineGlobalSettingsAsset<UniversalRenderPipeline>(previousSettings); }
                finally
                {
                    QualitySettings.renderPipeline = previousPipeline;
                    AssetDatabase.SaveAssets();
                    if (Digest(GraphicsPath) != graphicsBefore)
                        File.WriteAllBytes(GraphicsPath, graphicsSnapshot);
                    if (Digest(WebSettingsPath) != webSettingsBefore)
                        File.WriteAllBytes(WebSettingsPath, webSettingsSnapshot);
                }
            }
        }
        Require(WebDebugSettingsStripped, "WebGL build did not strip URP debug resources");
        Require(rendererRefStayedCleared, "WebGL renderer reloaded the unsupported HDR debug shader");
        Require(report.summary.result == BuildResult.Succeeded, "Last Stand Web build failed: " + report.summary.result);
        Require(File.Exists(Path.Combine(output, "index.html")) && Directory.GetFiles(output, "*.wasm", SearchOption.AllDirectories).Any(), "Missing Last Stand Web output");
        Require(Digest(ScenePath) == sceneBefore && Digest(FieldScene) == fieldBefore && Digest(ReviewScene) == reviewBefore,
            "Build changed a saved scene");
        Require(Digest(RendererPath) == rendererBefore, "Build changed saved renderer data");
        Require(Digest(GraphicsPath) == graphicsBefore && Digest(QualityPath) == qualityBefore,
            "Build changed saved project graphics settings");
        Require(Digest(WebSettingsPath) == webSettingsBefore, "Build changed saved WebGL resource settings");
        Debug.Log("ST_LS_WEB_BUILD_PASS configuration=" + configuration + " options=" + options
            + " bytes=" + report.summary.totalSize + " path=" + output);
    }
}
