"""Build one source-bound Last Stand player. Never installs tools or publishes."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

from build_web import (ROOT, PROJECT, digest, inventory_digest, portable_entry,
                       regular_files, require, source_binding, toolchain_binding)
from unity_shader_log import accepts_log

EDITOR = Path(r"C:/Users/brenn/singedTerra-engine-lab/tools/unity-6000.3.24f1/Editor/Unity.exe")
VERSION = "6000.3.24f1"
REVISION = "4e7b9b5b6244"
SCENE = "Assets/Scenes/LastStandPrototype.unity"
TARGETS = {"webgl": ("WebGLSupport", "WebGL"),
           "windows": ("windowsstandalonesupport", "StandaloneWindows64"),
           "android": ("AndroidPlayer", "Android")}
SDK_COMPONENTS = ("platform-tools", "build-tools/36.0.0", "platforms/android-36",
                  "cmdline-tools/16.0", "cmake/3.22.1", "licenses")


def expected_options(configuration):
    if configuration == "development":
        return ["Development"]
    if configuration == "release":
        return []
    raise ValueError("Expected development or release configuration")


def jdk_identity(editor, jdk_root=None):
    """Describe available Java 17 bytes, without executing or certifying them."""
    root = (Path(jdk_root) if jdk_root is not None else
            editor.parent / "Data/PlaybackEngines/AndroidPlayer/OpenJDK").resolve()
    java = root / "bin/java.exe"
    require(java.is_file() and java.stat().st_size > 0, "Missing OpenJDK Java executable: " + str(java))
    release = root / "release"
    require(release.is_file(), "Missing OpenJDK version metadata: " + str(release))
    versions = re.findall(r'^JAVA_VERSION="([^"]+)"\s*$', release.read_text(encoding="utf-8-sig"), re.M)
    require(len(versions) == 1 and re.fullmatch(r'17(?:\.\d+)*(?:\+\d+(?:\.\d+)*)?', versions[0]) is not None,
            "A Java 17 JDK is required; invalid JAVA_VERSION in " + str(release))
    return {"root": str(root), "version": versions[0], "source": "custom" if jdk_root is not None else "embedded"}


def jdk_binding(editor, jdk_root=None):
    identity = jdk_identity(editor, jdk_root)
    root = Path(identity["root"])
    files = {p.relative_to(root).as_posix(): {"mode": "raw", "sha256": digest(p)} for p in regular_files(root)}
    return {**identity, "files": files, "sha256": inventory_digest({"identity": identity, "files": files})}


def android_root(editor, name, override):
    return (Path(override) if override is not None else
            editor.parent / "Data/PlaybackEngines/AndroidPlayer" / name).resolve()


def android_component_binding(root, source, components=None):
    root = root.resolve()
    paths = regular_files(root) if components is None else [p for name in components for p in regular_files(root / name)]
    files = {p.relative_to(root).as_posix(): {"mode": "raw", "sha256": digest(p)} for p in sorted(paths)}
    identity = {"root": str(root), "source": source}
    return {**identity, "files": files, "sha256": inventory_digest({"identity": identity, "files": files})}


def build_environment(target, configuration, output, receipt, *, android_tools=None, inherited=None):
    env = dict(os.environ if inherited is None else inherited)
    # Ambient settings must never choose an unrecorded JDK, including other targets.
    for name in ("JDK", "SDK", "NDK"):
        env.pop("ST_LS_" + name + "_ROOT", None)
        env.pop("ST_LS_" + name + "_SOURCE", None)
    env.update(ST_LS_BUILD_TARGET=target, ST_LS_BUILD_CONFIGURATION=configuration,
               ST_LS_PLAYER_OUTPUT=str(output), ST_LS_PLAYER_RECEIPT=str(receipt),
               ST_ART_PROJECT_CHECK=str(PROJECT))
    if target == "android":
        require(android_tools is not None, "Android build requires explicit effective tool identities")
        for name in ("jdk", "sdk", "ndk"):
            identity = android_tools[name]
            env["ST_LS_" + name.upper() + "_ROOT"] = identity["root"]
            env["ST_LS_" + name.upper() + "_SOURCE"] = identity["source"]
    return env


def preflight(editor, target, configuration, *, root=ROOT, jdk_root=None, sdk_root=None, ndk_root=None):
    """Read-only availability check. Actual executable version is checked at build time."""
    expected_options(configuration)
    if target not in TARGETS:
        raise ValueError("Unknown player target")
    if any(p is not None for p in (jdk_root, sdk_root, ndk_root)) and target != "android":
        raise ValueError("--jdk-root/--sdk-root/--ndk-root apply only to Android builds")
    blockers = []
    android_tools = None
    def check(condition, message):
        if not condition:
            blockers.append(message)
    check(editor.is_file(), "Pinned Unity editor executable is missing")
    check((root / "Unity" / SCENE).is_file(), "Saved production Last Stand scene is missing")
    version = root / "Unity/ProjectSettings/ProjectVersion.txt"
    check(version.is_file() and f"{VERSION} ({REVISION})" in version.read_text(encoding="utf-8"),
          "Project must pin Unity " + VERSION + " (" + REVISION + ")")
    vendor = root / "Unity/Packages/com.unity.render-pipelines.universal/package.json"
    try:
        check(json.loads(vendor.read_text(encoding="utf-8"))["version"] == "17.3.0", "Embedded URP must be 17.3.0")
    except (OSError, ValueError, KeyError):
        blockers.append("Embedded URP 17.3.0 must already exist; no automatic restore")
    module = editor.parent / "Data/PlaybackEngines" / TARGETS[target][0]
    check(module.is_dir(), "Missing " + TARGETS[target][0] + " module for " + VERSION)
    if target == "webgl":
        check((module / "UnityEditor.WebGL.Extensions.dll").is_file(), "Missing WebGL build extension")
    if target == "windows":
        variant = "win64_player_" + ("development" if configuration == "development" else "nondevelopment") + "_mono"
        check(all((module / "Variations" / variant / name).is_file() for name in ("WindowsPlayer.exe", "UnityPlayer.dll")),
              "Missing Windows x64 Mono player variant: " + variant)
    if target == "android":
        sdk = android_root(editor, "SDK", sdk_root)
        ndk = android_root(editor, "NDK", ndk_root)
        android_tools = {"jdk": None,
                         "sdk": {"root": str(sdk), "source": "custom" if sdk_root is not None else "embedded"},
                         "ndk": {"root": str(ndk), "source": "custom" if ndk_root is not None else "embedded"}}
        required = {ndk / "source.properties": "NDK r27c version metadata",
                    ndk / "toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe": "NDK compiler",
                    sdk / "platform-tools/adb.exe": "SDK platform tools",
                    sdk / "build-tools/36.0.0/aapt2.exe": "SDK build tools 36.0.0",
                    sdk / "platforms/android-36/android.jar": "SDK platform 36",
                    sdk / "cmdline-tools/16.0/bin/sdkmanager.bat": "SDK command-line tools 16.0",
                    sdk / "cmake/3.22.1/bin/cmake.exe": "SDK CMake 3.22.1",
                    sdk / "licenses/android-sdk-license": "SDK license acceptance (owner-managed)"}
        for name, label in required.items():
            check(name.is_file(), "Missing " + label + ": " + str(name))
        try:
            android_tools["jdk"] = jdk_identity(editor, jdk_root)
        except (OSError, UnicodeError, RuntimeError) as exc:
            blockers.append(str(exc))
        ndk_version = ndk / "source.properties"
        if ndk_version.is_file():
            check(re.search(r"^Pkg.Revision\s*=\s*27\.2\.12479018\s*$", ndk_version.read_text(encoding="utf-8"), re.M) is not None,
                  "Pinned Android NDK r27c (27.2.12479018) is required")
    free = shutil.disk_usage(root).free
    check(free >= (16 if target == "android" else 3) * 1024**3, "Insufficient free space for isolated player output")
    return {"target": target, "configuration": configuration, "ready": not blockers,
            "blockers": blockers, "editor": str(editor), "projectEditorVersion": VERSION,
            "module": str(module), "androidTools": android_tools, "freeBytes": free, "launchedUnity": False,
            "installedTools": False, "publish": False}


def player_source_binding(root=ROOT):
    result = source_binding(root)
    # The wrapper adds policy/configuration, so it is an input of this receipt.
    name = "Tools/build_last_stand.py"
    result["files"][name] = digest(root / name)
    result["closure"]["files"][name] = portable_entry(root / name)
    result["closure"]["files"] = dict(sorted(result["closure"]["files"].items()))
    result["closure"]["explicitFiles"].append(name)
    result["closure"]["sha256"] = inventory_digest(result["closure"]["files"])
    result["sha256"] = result["closure"]["sha256"]
    return result


def content_binding(root=ROOT):
    scripts = root / "Unity/Assets/Scripts"
    files = list(scripts.glob("LastStand*Catalog.cs")) + list(scripts.glob("LastStandSelection.cs"))
    files += regular_files(scripts / "Content")
    inventory = {p.relative_to(root).as_posix(): portable_entry(p) for p in sorted(set(files))}
    require(bool(inventory), "Missing authored content definitions")
    return {"files": inventory, "sha256": inventory_digest(inventory)}


def player_toolchain_binding(editor, target, *, jdk_root=None, sdk_root=None, ndk_root=None):
    require(not any(p is not None for p in (jdk_root, sdk_root, ndk_root)) or target == "android",
            "Custom Android tools apply only to Android builds")
    if target == "webgl":
        return toolchain_binding(editor)
    base = editor.parent
    module = base / "Data/PlaybackEngines" / TARGETS[target][0]
    urp = base / "Data/Resources/PackageManager/BuiltInPackages/com.unity.render-pipelines.universal"
    require(json.loads((urp / "package.json").read_text(encoding="utf-8"))["version"] == "17.3.0", "Unexpected installed URP")
    roots = [module, urp, base / "Data/Managed"]
    if target == "android":
        # Selected tools have their own closure below. Do not also bind unused
        # embedded SDKs, emulator images, old NDKs, or a superseded embedded JDK.
        require(module.is_dir() and not module.is_symlink() and not module.is_junction(), "Missing or linked Android module")
        files = [editor] + [p for root in roots[1:] for p in regular_files(root)]
        for path in module.iterdir():
            if path.name.lower() in ("sdk", "ndk", "openjdk"):
                continue
            require(not path.is_symlink() and not path.is_junction(), "Linked Android module input: " + str(path))
            if path.is_dir():
                files.extend(regular_files(path))
            else:
                require(path.is_file(), "Non-regular Android module input: " + str(path))
                files.append(path)
    else:
        files = [editor] + [path for root in roots for path in regular_files(root)]
    inventory = {"Editor/" + p.relative_to(base).as_posix(): {"mode": "raw", "sha256": digest(p)} for p in sorted(set(files))}
    inventory["Python/" + Path(sys.executable).name] = {"mode": "raw", "sha256": digest(Path(sys.executable))}
    inventory = dict(sorted(inventory.items()))
    result = {"editorVersion": VERSION, "editorRevision": REVISION, "urpVersion": "17.3.0",
            "target": target, "roots": [p.relative_to(base).as_posix() for p in roots],
            "files": inventory, "sha256": inventory_digest(inventory)}
    if target == "android":
        result["androidTools"] = {
            "jdk": jdk_binding(editor, jdk_root),
            "sdk": android_component_binding(android_root(editor, "SDK", sdk_root),
                                              "custom" if sdk_root is not None else "embedded", SDK_COMPONENTS),
            "ndk": android_component_binding(android_root(editor, "NDK", ndk_root),
                                              "custom" if ndk_root is not None else "embedded")}
        result["sha256"] = inventory_digest({"files": inventory, "androidTools": result["androidTools"]})
    return result


def artifact_inventory(output):
    return {p.relative_to(output).as_posix(): digest(p) for p in regular_files(output)}


def validate_manifest(record, output, *, expected_source, expected_toolchain):
    require(record.get("schema") == "singedterra-last-stand-player-build/v1" and record.get("status") == "pass",
            "Successful player manifest required")
    target = record.get("target"); configuration = record.get("configuration")
    require(target in TARGETS and configuration in ("development", "release"), "Unknown target/configuration")
    require(record.get("scene") == SCENE and record.get("buildOptions") == expected_options(configuration), "Wrong scene/build flags")
    require(record.get("sourceBefore") == record.get("sourceAfter") == expected_source, "Source binding changed")
    require(record.get("toolchainBefore") == record.get("toolchainAfter") == expected_toolchain, "Toolchain binding changed")
    require(record.get("publish") is False, "Build manifest must not imply publication")
    stage = "web-export" if target == "webgl" else "unity-player"
    require(any(s.get("stage") == stage and s.get("exit") == 0 for s in record.get("stages", [])), "Actual player build stage required")
    report = record.get("playerReport", {})
    require(report.get("result") == "Succeeded" and report.get("target") == target
            and report.get("configuration") == configuration and report.get("scene") == SCENE
            and report.get("options") == expected_options(configuration), "Player report identity mismatch")
    actual = artifact_inventory(output)
    require(bool(actual) and actual == record.get("artifacts"), "Player artifact bytes differ from manifest")
    if target == "windows":
        require("LastStand.exe" in actual and any(p.startswith("LastStand_Data/") for p in actual), "Incomplete Windows player artifacts")
    elif target == "android":
        require("LastStand.apk" in actual, "Missing Android player artifact")
        for name in ("jdk", "sdk", "ndk"):
            identity = expected_toolchain.get("androidTools", {}).get(name, {})
            require(all(identity.get(key) for key in ("root", "source", "files", "sha256")),
                    "Android " + name + " byte binding is required")
            require(report.get(name + "Root") == identity["root"] and report.get(name + "Source") == identity["source"],
                    "Player report effective " + name + " mismatch")
        require(report.get("jdkVersion") == expected_toolchain["androidTools"]["jdk"].get("version"),
                "Player report effective JDK version mismatch")
        require(any(s.get("stage") == "java-version" and s.get("exit") == 0 for s in record.get("stages", [])),
                "Actual Java version check required")
    else:
        require("index.html" in actual and any(p.endswith(".wasm") for p in actual), "Incomplete WebGL player artifacts")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True, choices=tuple(TARGETS))
    parser.add_argument("--configuration", choices=("development", "release"), default="development")
    parser.add_argument("--editor", type=Path, default=EDITOR)
    parser.add_argument("--jdk-root", type=Path, help="Explicit Java 17 JDK for this Android build only; no installation or security certification")
    parser.add_argument("--sdk-root", type=Path, help="Existing Android SDK containing API 36, build tools 36, command-line tools 16 and CMake 3.22.1")
    parser.add_argument("--ndk-root", type=Path, help="Explicit Android NDK r27c root for this build only")
    parser.add_argument("--preflight-only", action="store_true")
    parser.add_argument("--stamp")
    parser.add_argument("--approval-binding", help="Caller-observed native identity JSON, forwarded unchanged to WebGL exporter")
    args = parser.parse_args(); editor = args.editor.resolve()
    jdk_root = args.jdk_root.resolve() if args.jdk_root is not None else None
    sdk_root = args.sdk_root.resolve() if args.sdk_root is not None else None
    ndk_root = args.ndk_root.resolve() if args.ndk_root is not None else None
    tool_overrides = {"jdk_root": jdk_root, "sdk_root": sdk_root, "ndk_root": ndk_root}
    available = preflight(editor, args.target, args.configuration, **tool_overrides)
    if args.preflight_only:
        print(json.dumps(available, indent=2)); return 0 if available["ready"] else 2
    require(available["ready"], "; ".join(available["blockers"]))
    if args.target == "webgl":
        require(bool(args.approval_binding), "WebGL requires the caller-observed spec/plan identity metadata")
    stamp = args.stamp or datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:6]
    require(re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}", stamp) is not None, "Invalid frozen output stamp")
    evidence = ROOT / "Evidence/last-stand-architecture" / ("build-" + args.target + "-" + stamp)
    output = ROOT / "Builds" / (("Web-" if args.target == "webgl" else "LastStand-" + args.target + "-") + stamp)
    require(not output.exists(), "Refusing to replace an existing build output")
    evidence.mkdir(parents=True, exist_ok=False)
    record = {"schema": "singedterra-last-stand-player-build/v1", "status": "running",
              "target": args.target, "configuration": args.configuration, "scene": SCENE,
              "buildOptions": expected_options(args.configuration), "build": str(output),
              "editor": str(editor), "preflight": available, "stages": [], "publish": False}
    env = build_environment(args.target, args.configuration, output, evidence / "player-report.json", android_tools=available["androidTools"])
    if os.name == "nt":
        common = Path(env.get("ProgramData", env.get("SystemDrive", "C:") + "/ProgramData"))
        require(common.is_dir(), "ProgramData unavailable")
        env.setdefault("ProgramData", str(common)); env.setdefault("ALLUSERSPROFILE", str(common))
    def save():
        (evidence / "result.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    def run(label, command, timeout=1800):
        with (evidence / (label + ".log")).open("wb") as log:
            child = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                rc = child.wait(timeout)
            except subprocess.TimeoutExpired:
                child.terminate()
                try:
                    child.wait(10)
                except subprocess.TimeoutExpired:
                    child.kill(); child.wait(10)
                record["timedOutChild"] = child.pid
                raise
        record["stages"].append({"stage": label, "exit": rc}); save()
        require(rc == 0, label + " failed; inspect " + str(evidence))
    print("BUILD_EVIDENCE=" + str(evidence), flush=True)
    try:
        if os.name == "nt":
            scan = "$p=$env:ST_ART_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"
            run("editor-not-open", ["powershell.exe", "-NoProfile", "-Command", scan], 30)
        record["sourceBefore"] = player_source_binding()
        record["content"] = content_binding()
        record["toolchainBefore"] = player_toolchain_binding(editor, args.target, **tool_overrides)
        if args.target == "android":
            for name in ("jdk", "sdk", "ndk"):
                require(all(record["toolchainBefore"]["androidTools"][name][key] == value
                            for key, value in available["androidTools"][name].items()), "Android tool changed after preflight: " + name)
            jdk = available["androidTools"]["jdk"]
            run("java-version", [str(Path(jdk["root"]) / "bin/java.exe"), "-version"], 30)
            java_log = (evidence / "java-version.log").read_text(encoding="utf-8", errors="replace")
            require(re.search(r'^(?:openjdk|java) version "' + re.escape(jdk["version"]) + r'"', java_log, re.M),
                    "Java executable version differs from JDK release metadata")
        settings = (PROJECT / "ProjectSettings/ProjectSettings.asset").read_text(encoding="utf-8")
        record["projectPlayerVersion"] = re.search(r"^\s*bundleVersion:\s*(.+)$", settings, re.M).group(1)
        save()
        if args.target == "webgl":
            run("web-export", [sys.executable, str(ROOT / "Tools/build_web.py"), "--editor", str(editor),
                              "--scene", "last-stand", "--configuration", args.configuration,
                              "--stamp", stamp, "--approval-binding", args.approval_binding])
            web_path = ROOT / "Evidence/last-stand-playable-loop/t05" / ("build-" + stamp) / "result.json"
            web = json.loads(web_path.read_text(encoding="utf-8"))
            require(web["status"] == "pass" and web["configuration"] == args.configuration, "Web exporter did not pass")
            record["webExportReceipt"] = {"path": str(web_path), "sha256": digest(web_path)}
            record["playerReport"] = {"result": "Succeeded", "target": "webgl", "configuration": web["configuration"],
                                      "scene": web["scene"], "options": expected_options(web["configuration"])}
        else:
            run("editor-version", [str(editor), "-version"], 30)
            require((evidence / "editor-version.log").read_text(encoding="utf-8").strip() == VERSION, "Unexpected editor version")
            run("unity-player", [str(editor), "-batchmode", "-quit", "-projectPath", str(PROJECT),
                                 "-buildTarget", TARGETS[args.target][1], "-executeMethod", "LastStandPlayerBuild.Build", "-logFile", "-"])
            log = (evidence / "unity-player.log").read_text(encoding="utf-8", errors="replace")
            require(accepts_log(log, "ST_LS_PLAYER_BUILD_PASS target=" + args.target + " configuration=" + args.configuration),
                    "Native player marker/shader diagnostics failed")
            record["playerReport"] = json.loads((evidence / "player-report.json").read_text(encoding="utf-8"))
        record["sourceAfter"] = player_source_binding()
        record["toolchainAfter"] = player_toolchain_binding(editor, args.target, **tool_overrides)
        record["artifacts"] = artifact_inventory(output)
        record["status"] = "pass"
        validate_manifest(record, output, expected_source=record["sourceAfter"], expected_toolchain=record["toolchainAfter"])
    except Exception as exc:
        record.update(status="failed", error=type(exc).__name__ + ": " + str(exc))
        raise
    finally:
        save()
        print(json.dumps({"status": record["status"], "build": str(output), "evidence": str(evidence)}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
