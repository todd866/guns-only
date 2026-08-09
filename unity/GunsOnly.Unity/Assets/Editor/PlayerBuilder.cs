using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
#if UNITY_EDITOR_OSX
using UnityEditor.OSXStandalone;
#endif

namespace GunsOnly.UnityEditorTools {

/// <summary>
/// Headless Mac player build. Keep this method free of AssetDatabase.CreateAsset /
/// Refresh / Library deletes — those leave m_LockCount held and abort
/// Building Resources/unity_builtin_extra.
/// Materials live under Assets/Resources/GunsOnly (checked in).
/// </summary>
public static class PlayerBuilder {
    const string ScenePath = "Assets/Scenes/Main.unity";
    const string DefaultOutput = "artifacts/unity-mac/GunsOnly.app";

    public static void BuildMacArm64() {
        CobraVisualContractBuildValidator.ValidateOrThrow();
        // 0 = Input Manager (Old). Avoid Input System InvalidOperationException spam.
        PlayerSettings.SetPropertyInt("activeInputHandler", 0, BuildTargetGroup.Standalone);
        PlayerSettings.companyName = "GunsOnly";
        PlayerSettings.productName = "GunsOnly";
        PlayerSettings.bundleVersion = "0.1.0";
        // If the player launches unfocused (agent open while human is in Cursor), splash/load
        // pauses forever when runInBackground is false — stuck on "Made with Unity".
        PlayerSettings.runInBackground = true;
        PlayerSettings.SplashScreen.show = false;
        PlayerSettings.SplashScreen.showUnityLogo = false;

#if UNITY_EDITOR_OSX
        UserBuildSettings.architecture = OSArchitecture.ARM64;
        Debug.Log("[GunsOnly] Mac architecture = " + UserBuildSettings.architecture);
#endif

        EnsureMainSceneExists();

        string output = ReadOutputPath();
        if (string.IsNullOrEmpty(output)) output = DefaultOutput;
        string abs = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), output));
        string parent = Path.GetDirectoryName(abs);
        if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);

        var options = new BuildPlayerOptions {
            scenes = new[] { ScenePath },
            locationPathName = abs,
            target = BuildTarget.StandaloneOSX,
            subtarget = (int)StandaloneBuildSubtarget.Player,
            options = BuildOptions.None,
        };

        BuildReport report = BuildPipeline.BuildPlayer(options);
        if (report.summary.result != BuildResult.Succeeded) {
            Debug.LogError("[GunsOnly] Mac player build failed: " + report.summary.result);
            EditorApplication.Exit(1);
            return;
        }

        Debug.Log("[GunsOnly] Mac player built → " + abs + " (" + report.summary.totalSize + " bytes)");
        EditorApplication.Exit(0);
    }

    static string ReadOutputPath() {
        foreach (string arg in System.Environment.GetCommandLineArgs()) {
            if (arg.StartsWith("-gunsOnlyOutput="))
                return arg.Substring("-gunsOnlyOutput=".Length);
        }
        return "";
    }

    static void EnsureMainSceneExists() {
        if (!File.Exists(ScenePath)) {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, ScenePath);
        }
        var scenes = EditorBuildSettings.scenes;
        bool listed = false;
        if (scenes != null) {
            foreach (var s in scenes) {
                if (s != null && s.path == ScenePath && s.enabled) { listed = true; break; }
            }
        }
        if (!listed) {
            EditorBuildSettings.scenes = new[] {
                new EditorBuildSettingsScene(ScenePath, true),
            };
        }
    }
}

}
