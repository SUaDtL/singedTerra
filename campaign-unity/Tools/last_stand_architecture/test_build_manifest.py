"""Build admission tests use real temporary bytes, without launching Unity."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_last_stand import (SCENE, artifact_inventory, expected_options,
                              preflight, validate_manifest, jdk_identity, jdk_binding,
                              build_environment, player_toolchain_binding)


class BuildManifestTests(unittest.TestCase):
    @staticmethod
    def write(root, name, content=b"fixture bytes; never executed"):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def android_fixture(self, root):
        editor = self.write(root, "install/Editor/Unity.exe")
        project = root / "project"
        self.write(project, "Unity/" + SCENE)
        self.write(project, "Unity/ProjectSettings/ProjectVersion.txt",
                   b"m_EditorVersionWithRevision: 6000.3.24f1 (4e7b9b5b6244)\n")
        self.write(project, "Unity/Packages/com.unity.render-pipelines.universal/package.json", b'{"version":"17.3.0"}')
        self.write(editor.parent, "Data/Resources/PackageManager/BuiltInPackages/com.unity.render-pipelines.universal/package.json",
                   b'{"version":"17.3.0"}')
        self.write(editor.parent, "Data/Managed/editor.dll")
        self.write(editor.parent, "Data/PlaybackEngines/AndroidPlayer/UnityEditor.Android.Extensions.dll")
        jdk = root / "reviewed-jdk17"
        self.write(jdk, "bin/java.exe")
        self.write(jdk, "release", b'JAVA_VERSION="17.0.21.1"\n')
        self.write(jdk, "lib/security/cacerts", b"reviewed certificate store")
        sdk = root / "existing-sdk"
        for name in ("platform-tools/adb.exe", "build-tools/36.0.0/aapt2.exe", "platforms/android-36/android.jar",
                     "cmdline-tools/16.0/bin/sdkmanager.bat", "cmake/3.22.1/bin/cmake.exe", "licenses/android-sdk-license"):
            self.write(sdk, name)
        ndk = root / "ndk-r27c"
        self.write(ndk, "source.properties", b"Pkg.Revision = 27.2.12479018\n")
        self.write(ndk, "toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe")
        return editor, project, {"jdk_root": jdk, "sdk_root": sdk, "ndk_root": ndk}

    def fixture(self, root):
        output = root / "build"
        output.mkdir()
        (output / "LastStand.exe").write_bytes(b"actual test payload, not a player")
        (output / "LastStand_Data").mkdir()
        (output / "LastStand_Data/globalgamemanagers").write_bytes(b"scene content")
        source = {"sha256": "1" * 64, "head": "2" * 40}
        toolchain = {"sha256": "3" * 64, "editorVersion": "6000.3.24f1"}
        record = {"schema": "singedterra-last-stand-player-build/v1", "status": "pass",
                  "target": "windows", "configuration": "development", "scene": SCENE,
                  "buildOptions": expected_options("development"),
                  "sourceBefore": source, "sourceAfter": copy.deepcopy(source),
                  "toolchainBefore": toolchain, "toolchainAfter": copy.deepcopy(toolchain),
                  "artifacts": artifact_inventory(output),
                  "stages": [{"stage": "unity-player", "exit": 0}],
                  "playerReport": {"target": "windows", "configuration": "development",
                                   "scene": SCENE, "options": expected_options("development"),
                                   "result": "Succeeded"},
                  "publish": False}
        return output, record, source, toolchain

    def test_manifest_binds_output_bytes_source_toolchain_scene_and_flags(self):
        with tempfile.TemporaryDirectory(prefix="st-build-manifest-") as folder:
            output, record, source, toolchain = self.fixture(Path(folder))
            validate_manifest(record, output, expected_source=source, expected_toolchain=toolchain)
            for field, bad in (("sourceAfter", {"sha256": "4" * 64}),
                               ("toolchainAfter", {"sha256": "5" * 64}),
                               ("scene", "Assets/Scenes/PartsGallery.unity"),
                               ("buildOptions", []), ("status", "running")):
                changed = copy.deepcopy(record); changed[field] = bad
                with self.subTest(field=field), self.assertRaises(RuntimeError):
                    validate_manifest(changed, output, expected_source=source, expected_toolchain=toolchain)
            changed = copy.deepcopy(record); changed["playerReport"]["configuration"] = "release"
            with self.assertRaises(RuntimeError):
                validate_manifest(changed, output, expected_source=source, expected_toolchain=toolchain)
            with self.assertRaises(RuntimeError):
                validate_manifest(record, output, expected_source={"sha256": "6" * 64}, expected_toolchain=toolchain)

    def test_missing_extra_and_modified_player_bytes_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix="st-build-bytes-") as folder:
            output, record, source, toolchain = self.fixture(Path(folder))
            player = output / "LastStand.exe"
            player.write_bytes(b"stale or substituted player")
            with self.assertRaisesRegex(RuntimeError, "artifact"):
                validate_manifest(record, output, expected_source=source, expected_toolchain=toolchain)
            player.unlink()
            with self.assertRaises(RuntimeError):
                validate_manifest(record, output, expected_source=source, expected_toolchain=toolchain)
            player.write_bytes(b"actual test payload, not a player")
            (output / "unrecorded.dll").write_bytes(b"extra")
            with self.assertRaisesRegex(RuntimeError, "artifact"):
                validate_manifest(record, output, expected_source=source, expected_toolchain=toolchain)

    def test_target_preflight_requires_module_and_android_toolchain(self):
        with tempfile.TemporaryDirectory(prefix="st-build-preflight-") as folder:
            root = Path(folder); editor = root / "install/Editor/Unity.exe"
            editor.parent.mkdir(parents=True); editor.write_bytes(b"not invoked")
            project = root / "project"
            scene = project / "Unity" / SCENE; scene.parent.mkdir(parents=True)
            scene.write_bytes(b"not opened")
            (project / "Unity/ProjectSettings").mkdir(parents=True)
            (project / "Unity/ProjectSettings/ProjectVersion.txt").write_text(
                "m_EditorVersion: 6000.3.24f1\nm_EditorVersionWithRevision: 6000.3.24f1 (4e7b9b5b6244)\n")
            vendor = project / "Unity/Packages/com.unity.render-pipelines.universal"
            vendor.mkdir(parents=True); (vendor / "package.json").write_text('{"version":"17.3.0"}')
            self.assertFalse(preflight(editor, "windows", "development", root=project)["ready"])
            module = editor.parent / "Data/PlaybackEngines/windowsstandalonesupport"
            variant = module / "Variations/win64_player_development_mono"
            variant.mkdir(parents=True)
            self.assertFalse(preflight(editor, "windows", "development", root=project)["ready"])
            for name in ("WindowsPlayer.exe", "UnityPlayer.dll"):
                (variant / name).write_bytes(b"not invoked")
            self.assertTrue(preflight(editor, "windows", "development", root=project)["ready"])
            self.assertFalse(preflight(editor, "windows", "release", root=project)["ready"])
            android = editor.parent / "Data/PlaybackEngines/AndroidPlayer"; android.mkdir()
            result = preflight(editor, "android", "development", root=project)
            self.assertFalse(result["ready"])
            self.assertIn("OpenJDK", " ".join(result["blockers"]))
            self.assertIn("NDK", " ".join(result["blockers"]))
            self.assertIn("SDK", " ".join(result["blockers"]))
            for name in ("OpenJDK/bin/java.exe", "NDK/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe",
                         "SDK/platform-tools/adb.exe", "SDK/build-tools/36.0.0/aapt2.exe",
                         "SDK/platforms/android-36/android.jar", "SDK/cmdline-tools/16.0/bin/sdkmanager.bat",
                         "SDK/cmake/3.22.1/bin/cmake.exe",
                         "SDK/licenses/android-sdk-license"):
                path = android / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(b"not invoked")
            (android / "OpenJDK/release").write_text('JAVA_VERSION="17.0.18"\n')
            (android / "NDK/source.properties").write_text('Pkg.Revision = 27.2.12479018\n')
            self.assertTrue(preflight(editor, "android", "development", root=project)["ready"])
            (android / "NDK/source.properties").write_text('Pkg.Revision = 28.0.0\n')
            self.assertFalse(preflight(editor, "android", "development", root=project)["ready"])
            self.assertFalse((project / "Builds").exists())
            with self.assertRaises(ValueError):
                expected_options("not-a-configuration")

    def test_external_tools_reuse_sdk_without_requiring_embedded_java_or_ndk(self):
        with tempfile.TemporaryDirectory(prefix="st-build-external-tools-") as folder:
            editor, project, overrides = self.android_fixture(Path(folder))
            available = preflight(editor, "android", "development", root=project, **overrides)
            self.assertTrue(available["ready"], available["blockers"])
            self.assertEqual(available["androidTools"]["jdk"]["version"], "17.0.21.1")
            for name in ("jdk", "sdk", "ndk"):
                self.assertEqual(available["androidTools"][name]["source"], "custom")
                self.assertEqual(available["androidTools"][name]["root"], str(overrides[name + "_root"].resolve()))
            self.assertFalse(preflight(editor, "android", "development", root=project)["ready"])
            self.write(overrides["ndk_root"], "source.properties", b"Pkg.Revision = 27.1.12297006\n")
            self.assertFalse(preflight(editor, "android", "development", root=project, **overrides)["ready"])
            with self.assertRaisesRegex(ValueError, "only to Android"):
                preflight(editor, "windows", "development", root=project, **overrides)

    def test_preflight_rejects_java_version_the_pinned_unity_cannot_parse(self):
        with tempfile.TemporaryDirectory(prefix="st-build-unity-java-version-") as folder:
            editor, project, overrides = self.android_fixture(Path(folder))
            for version in ("17.0.21.0.2", "17", "17.2147483648"):
                with self.subTest(version=version):
                    self.write(overrides["jdk_root"], "release", f'JAVA_VERSION="{version}"\n'.encode())
                    available = preflight(editor, "android", "development", root=project, **overrides)
                    self.assertFalse(available["ready"], "Unity must recognize the selected Java version before building")
                    self.assertTrue(any("Unity" in blocker for blocker in available["blockers"]))
            for version in ("17.0", "17.0.21", "17.0.21.1", "17.0.21+9"):
                with self.subTest(version=version):
                    self.write(overrides["jdk_root"], "release", f'JAVA_VERSION="{version}"\n'.encode())
                    self.assertTrue(preflight(editor, "android", "development", root=project, **overrides)["ready"])

    def test_java_metadata_requires_one_stable_java17_version_and_nonempty_binary(self):
        with tempfile.TemporaryDirectory(prefix="st-build-java-version-") as folder:
            editor, project, overrides = self.android_fixture(Path(folder))
            jdk = overrides["jdk_root"]
            for text in ('JAVA_VERSION="21.0.10"\n', 'JAVA_VERSION="170.0.1"\n', 'JAVA_VERSION="17-ea"\n',
                         'JAVA_VERSION="17.0.21"\nJAVA_VERSION="17.0.18"\n', 'OTHER="17.0.21"\n'):
                self.write(jdk, "release", text.encode())
                with self.subTest(metadata=text), self.assertRaisesRegex(RuntimeError, "Java 17"):
                    jdk_identity(editor, jdk)
            self.write(jdk, "release", b'JAVA_VERSION="17.0.21.1"\n')
            (jdk / "bin/java.exe").write_bytes(b"")
            self.assertFalse(preflight(editor, "android", "development", root=project, **overrides)["ready"])
            (jdk / "bin/java.exe").unlink()
            with self.assertRaisesRegex(RuntimeError, "executable"):
                jdk_identity(editor, jdk)
            self.write(jdk, "bin/java.exe")
            (jdk / "release").unlink()
            with self.assertRaisesRegex(RuntimeError, "metadata"):
                jdk_identity(editor, jdk)

    def test_effective_tool_bytes_and_paths_are_bound_but_unrelated_sdk_images_are_not(self):
        with tempfile.TemporaryDirectory(prefix="st-build-tool-closure-") as folder:
            root = Path(folder)
            editor, _, overrides = self.android_fixture(root)
            before = player_toolchain_binding(editor, "android", **overrides)
            self.write(overrides["sdk_root"], "system-images/android-36/emulator.img", b"unrelated large image")
            self.write(editor.parent, "Data/PlaybackEngines/AndroidPlayer/OpenJDK/bin/java.exe", b"unused bundled Java")
            self.write(editor.parent, "Data/PlaybackEngines/AndroidPlayer/SDK/system-images/emulator.img", b"unused embedded SDK image")
            self.assertEqual(before, player_toolchain_binding(editor, "android", **overrides))
            for name, relative in (("jdk_root", "lib/security/cacerts"), ("sdk_root", "build-tools/36.0.0/aapt2.exe"),
                                   ("ndk_root", "toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe")):
                path = overrides[name] / relative
                original = path.read_bytes()
                path.write_bytes(b"substituted bytes")
                with self.subTest(tool=name):
                    self.assertNotEqual(before["sha256"], player_toolchain_binding(editor, "android", **overrides)["sha256"])
                path.write_bytes(original)
            moved = root / "same-java-bytes-new-path"
            import shutil
            shutil.copytree(overrides["jdk_root"], moved)
            self.assertNotEqual(jdk_binding(editor, overrides["jdk_root"])["sha256"], jdk_binding(editor, moved)["sha256"])

    def test_build_environment_is_scoped_and_clears_inherited_android_overrides(self):
        with tempfile.TemporaryDirectory(prefix="st-build-tool-env-") as folder:
            editor, project, overrides = self.android_fixture(Path(folder))
            tools = preflight(editor, "android", "development", root=project, **overrides)["androidTools"]
            inherited = {"JAVA_HOME": "leave-global-java-alone", "ST_LS_JDK_ROOT": "stale-java", "ST_LS_SDK_ROOT": "stale-sdk",
                         "ST_LS_NDK_ROOT": "stale-ndk", "ST_LS_JDK_SOURCE": "stale-source"}
            env = build_environment("android", "development", "output", "receipt", android_tools=tools, inherited=inherited)
            for name in ("jdk", "sdk", "ndk"):
                self.assertEqual(env["ST_LS_" + name.upper() + "_ROOT"], tools[name]["root"])
            self.assertEqual(env["JAVA_HOME"], inherited["JAVA_HOME"])
            self.assertEqual(inherited["ST_LS_JDK_ROOT"], "stale-java")
            windows = build_environment("windows", "development", "output", "receipt", inherited=inherited)
            self.assertFalse(any(key.startswith(("ST_LS_JDK_", "ST_LS_SDK_", "ST_LS_NDK_")) for key in windows))

    def test_android_receipt_requires_the_effective_tool_paths_version_and_java_execution(self):
        with tempfile.TemporaryDirectory(prefix="st-build-android-receipt-") as folder:
            root = Path(folder)
            editor, _, overrides = self.android_fixture(root)
            output, record, source, _ = self.fixture(root)
            self.write(output, "LastStand.apk")
            toolchain = player_toolchain_binding(editor, "android", **overrides)
            record.update(target="android", toolchainBefore=toolchain, toolchainAfter=copy.deepcopy(toolchain),
                          artifacts=artifact_inventory(output))
            record["stages"].append({"stage": "java-version", "exit": 0})
            record["playerReport"]["target"] = "android"
            for name, identity in toolchain["androidTools"].items():
                record["playerReport"][name + "Root"] = identity["root"]
                record["playerReport"][name + "Source"] = identity["source"]
            record["playerReport"]["jdkVersion"] = toolchain["androidTools"]["jdk"]["version"]
            validate_manifest(record, output, expected_source=source, expected_toolchain=toolchain)
            for field in ("jdkRoot", "sdkRoot", "ndkRoot", "jdkVersion", "jdkSource"):
                changed = copy.deepcopy(record)
                changed["playerReport"][field] = "substituted"
                with self.subTest(field=field), self.assertRaisesRegex(RuntimeError, "effective"):
                    validate_manifest(changed, output, expected_source=source, expected_toolchain=toolchain)
            changed = copy.deepcopy(record)
            changed["stages"] = [{"stage": "unity-player", "exit": 0}]
            with self.assertRaisesRegex(RuntimeError, "Java version"):
                validate_manifest(changed, output, expected_source=source, expected_toolchain=toolchain)


if __name__ == "__main__":
    unittest.main()
