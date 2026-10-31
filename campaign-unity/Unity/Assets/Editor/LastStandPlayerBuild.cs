using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

// Native exports share the saved scene/checks with WebGL. Build-only settings
// are restored; release here means compiler configuration, not store signing.
public static class LastStandPlayerBuild
{
    [Serializable]
    sealed class Receipt
    {
        public string target, configuration, scene, result, productName, version, applicationIdentifier, backend;
        public string jdkRoot, jdkVersion, jdkSource, sdkRoot, sdkSource, ndkRoot, ndkSource;
        public string[] options;
        public ulong bytes;
        public bool storeSigned;
    }

    static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

#if UNITY_ANDROID
    static string RequestedToolRoot(string name, string module, string embeddedFolder, out string source)
    {
        string requested = Environment.GetEnvironmentVariable("ST_LS_" + name + "_ROOT");
        source = Environment.GetEnvironmentVariable("ST_LS_" + name + "_SOURCE");
        if (string.IsNullOrEmpty(requested)) { requested = Path.Combine(module, embeddedFolder); source = "embedded"; }
        Require(Path.IsPathRooted(requested) && Directory.Exists(requested), "Missing absolute Android " + name + " root");
        Require(source == "embedded" || source == "custom", "Expected Android tool source");
        string root = Path.GetFullPath(requested);
        Require(source != "embedded" || SamePath(root, Path.Combine(module, embeddedFolder)), "Embedded tool must use the installed module path");
        return root;
    }

    static bool SamePath(string first, string second)
    {
        return string.Equals(Path.GetFullPath(first).TrimEnd(Path.DirectorySeparatorChar),
            Path.GetFullPath(second).TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase);
    }

    static string RestoreToolRoot(string previous, string embeddedFolder)
    {
        string embedded = Path.Combine(EditorApplication.applicationContentsPath, "PlaybackEngines/AndroidPlayer", embeddedFolder);
        // The documented empty setter selects Unity's embedded default, even
        // when that optional bundle is absent because this build uses custom tools.
        return string.IsNullOrEmpty(previous) || SamePath(previous, embedded) ? string.Empty : previous;
    }
#endif

    public static void Build()
    {
        string targetName = Environment.GetEnvironmentVariable("ST_LS_BUILD_TARGET");
        string configuration = Environment.GetEnvironmentVariable("ST_LS_BUILD_CONFIGURATION");
        Require(targetName == "windows" || targetName == "android", "Expected native Last Stand target");
        Require(Application.unityVersion == "6000.3.27f2", "Unexpected editor version");
        BuildTarget target = targetName == "windows" ? BuildTarget.StandaloneWindows64 : BuildTarget.Android;
        BuildTargetGroup group = BuildPipeline.GetBuildTargetGroup(target);
        NamedBuildTarget named = targetName == "windows" ? NamedBuildTarget.Standalone : NamedBuildTarget.Android;
        Require(EditorUserBuildSettings.activeBuildTarget == target, "Launch with the matching -buildTarget");
        Require(BuildPipeline.IsBuildTargetSupported(group, target), "Pinned target module is unavailable");
        var options = LastStandLoopBuild.PlayerOptions(configuration);
        LastStandLoopBuild.PrepareShaderDiagnostics();
        string output = Environment.GetEnvironmentVariable("ST_LS_PLAYER_OUTPUT");
        string receiptPath = Environment.GetEnvironmentVariable("ST_LS_PLAYER_RECEIPT");
        Require(!string.IsNullOrEmpty(output) && Path.IsPathRooted(output), "Expected absolute player output");
        Require(!string.IsNullOrEmpty(receiptPath) && Path.IsPathRooted(receiptPath), "Expected absolute receipt path");
        output = Path.GetFullPath(output);
        Require(!Directory.Exists(output) && !File.Exists(output), "Refusing to replace an existing player output");
        Require(!File.Exists(receiptPath), "Refusing to replace an existing player receipt");
        string player = Path.Combine(output, targetName == "windows" ? "LastStand.exe" : "LastStand.apk");
        var snapshots = new Dictionary<string, byte[]>();
        foreach (string path in new[] { "ProjectSettings/ProjectSettings.asset", "ProjectSettings/QualitySettings.asset", "ProjectSettings/GraphicsSettings.asset" })
            snapshots.Add(path, File.ReadAllBytes(path));
        var previousPipeline = QualitySettings.renderPipeline;
        string previousName = PlayerSettings.productName;
        string previousIdentifier = PlayerSettings.GetApplicationIdentifier(named);
        var previousBackend = PlayerSettings.GetScriptingBackend(named);
        bool previousBundle = EditorUserBuildSettings.buildAppBundle;
        bool previousExport = EditorUserBuildSettings.exportAsGoogleAndroidProject;
        bool previousKeystore = PlayerSettings.Android.useCustomKeystore;
        var previousArchitectures = PlayerSettings.Android.targetArchitectures;
        var previousSdk = PlayerSettings.Android.targetSdkVersion;
        string jdkRoot = null, jdkVersion = null, jdkSource = null, sdkRoot = null, sdkSource = null, ndkRoot = null, ndkSource = null;
#if UNITY_ANDROID
        string previousJdkRoot = targetName == "android" ? UnityEditor.Android.AndroidExternalToolsSettings.jdkRootPath : null;
        string previousSdkRoot = targetName == "android" ? UnityEditor.Android.AndroidExternalToolsSettings.sdkRootPath : null;
        string previousNdkRoot = targetName == "android" ? UnityEditor.Android.AndroidExternalToolsSettings.ndkRootPath : null;
        bool changedAndroidTools = false;
#endif
        Receipt receipt = null;
        try
        {
            QualitySettings.renderPipeline = LastStandLoopBuild.PreparePlayerScene();
            PlayerSettings.productName = "Last Stand";
            PlayerSettings.SetApplicationIdentifier(named, "com.singedterra.laststand");
            PlayerSettings.SetScriptingBackend(named, targetName == "windows" ? ScriptingImplementation.Mono2x : ScriptingImplementation.IL2CPP);
            if (targetName == "android")
            {
#if UNITY_ANDROID
                string module = Path.Combine(EditorApplication.applicationContentsPath, "PlaybackEngines/AndroidPlayer");
                jdkRoot = RequestedToolRoot("JDK", module, "OpenJDK", out jdkSource);
                sdkRoot = RequestedToolRoot("SDK", module, "SDK", out sdkSource);
                ndkRoot = RequestedToolRoot("NDK", module, "NDK", out ndkSource);
                Require(File.Exists(Path.Combine(jdkRoot, "bin/java.exe")), "Selected JDK has no Java executable");
                var versions = Regex.Matches(File.ReadAllText(Path.Combine(jdkRoot, "release")), "^JAVA_VERSION=\"([^\"]+)\"\\s*$", RegexOptions.Multiline);
                Require(versions.Count == 1 && Regex.IsMatch(versions[0].Groups[1].Value, @"^17(?:\.\d+)*(?:\+\d+(?:\.\d+)*)?$"), "Selected JDK must be Java 17");
                jdkVersion = versions[0].Groups[1].Value;
                changedAndroidTools = true;
                UnityEditor.Android.AndroidExternalToolsSettings.jdkRootPath = jdkRoot;
                UnityEditor.Android.AndroidExternalToolsSettings.sdkRootPath = sdkRoot;
                UnityEditor.Android.AndroidExternalToolsSettings.ndkRootPath = ndkRoot;
                Require(SamePath(UnityEditor.Android.AndroidExternalToolsSettings.jdkRootPath, jdkRoot)
                    && SamePath(UnityEditor.Android.AndroidExternalToolsSettings.sdkRootPath, sdkRoot)
                    && SamePath(UnityEditor.Android.AndroidExternalToolsSettings.ndkRootPath, ndkRoot), "Effective Android tools differ from requested paths");
                jdkRoot = Path.GetFullPath(UnityEditor.Android.AndroidExternalToolsSettings.jdkRootPath);
                sdkRoot = Path.GetFullPath(UnityEditor.Android.AndroidExternalToolsSettings.sdkRootPath);
                ndkRoot = Path.GetFullPath(UnityEditor.Android.AndroidExternalToolsSettings.ndkRootPath);
                EditorUserBuildSettings.buildAppBundle = false;
                EditorUserBuildSettings.exportAsGoogleAndroidProject = false;
                PlayerSettings.Android.useCustomKeystore = false;
                PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
                PlayerSettings.Android.targetSdkVersion = (AndroidSdkVersions)36;
#else
                throw new InvalidOperationException("Android target was not selected when compiling the editor entry");
#endif
            }
            Directory.CreateDirectory(output);
            Debug.Log("ST_LS_PLAYER_BUILD_BEGIN target=" + targetName);
            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] { LastStandLoopBuild.ScenePath }, locationPathName = player,
                target = target, options = options
            });
            Debug.Log("ST_LS_PLAYER_BUILD_END target=" + targetName + " result=" + report.summary.result);
            Require(report.summary.result == BuildResult.Succeeded && File.Exists(player), "Last Stand native player build failed");
            receipt = new Receipt { target = targetName, configuration = configuration,
                scene = LastStandLoopBuild.ScenePath, result = "Succeeded", productName = PlayerSettings.productName,
                version = PlayerSettings.bundleVersion, applicationIdentifier = PlayerSettings.GetApplicationIdentifier(named),
                backend = PlayerSettings.GetScriptingBackend(named).ToString(), bytes = report.summary.totalSize,
                jdkRoot = jdkRoot, jdkVersion = jdkVersion, jdkSource = jdkSource,
                sdkRoot = sdkRoot, sdkSource = sdkSource, ndkRoot = ndkRoot, ndkSource = ndkSource,
                options = configuration == "development" ? new[] { "Development" } : new string[0], storeSigned = false };
        }
        finally
        {
            try
            {
                PlayerSettings.productName = previousName;
                PlayerSettings.SetApplicationIdentifier(named, previousIdentifier);
                PlayerSettings.SetScriptingBackend(named, previousBackend);
                EditorUserBuildSettings.buildAppBundle = previousBundle;
                EditorUserBuildSettings.exportAsGoogleAndroidProject = previousExport;
                PlayerSettings.Android.useCustomKeystore = previousKeystore;
                PlayerSettings.Android.targetArchitectures = previousArchitectures;
                PlayerSettings.Android.targetSdkVersion = previousSdk;
                QualitySettings.renderPipeline = previousPipeline;
                AssetDatabase.SaveAssets();
                foreach (var snapshot in snapshots) File.WriteAllBytes(snapshot.Key, snapshot.Value);
                AssetDatabase.Refresh();
            }
            finally
            {
#if UNITY_ANDROID
                if (changedAndroidTools)
                {
                    // These are machine preferences, so restore even when a build fails.
                    try { UnityEditor.Android.AndroidExternalToolsSettings.jdkRootPath = RestoreToolRoot(previousJdkRoot, "OpenJDK"); }
                    finally
                    {
                        try { UnityEditor.Android.AndroidExternalToolsSettings.sdkRootPath = RestoreToolRoot(previousSdkRoot, "SDK"); }
                        finally { UnityEditor.Android.AndroidExternalToolsSettings.ndkRootPath = RestoreToolRoot(previousNdkRoot, "NDK"); }
                    }
                }
#endif
            }
        }
        File.WriteAllText(receiptPath, JsonUtility.ToJson(receipt, true));
        Debug.Log("ST_LS_PLAYER_BUILD_PASS target=" + targetName + " configuration=" + configuration);
    }
}
