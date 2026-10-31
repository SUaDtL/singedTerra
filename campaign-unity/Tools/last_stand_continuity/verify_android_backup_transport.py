"""Compile the real first-party Android bridge and execute its portable byte IO.

Requires explicitly selected installed JDK and Android SDK platform. This never
installs tools, launches a device, reads a player profile, or claims picker proof.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess
import tempfile
from android_backup_host_fixtures import SOURCES


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jdk-root", required=True, type=Path)
    parser.add_argument("--android-jar", required=True, type=Path)
    args = parser.parse_args()
    java = args.jdk_root / "bin/java.exe"
    javac = args.jdk_root / "bin/javac.exe"
    if not java.is_file(): java = args.jdk_root / "bin/java"
    if not javac.is_file(): javac = args.jdk_root / "bin/javac"
    for tool in (java, javac, args.android_jar):
        if not tool.is_file(): raise RuntimeError("Explicit Android tool is unavailable: " + str(tool))
    root = Path(__file__).resolve().parents[2]
    sources = sorted((root / "Unity/Assets/Plugins/Android/LastStandBackup.androidlib/src").rglob("*.java"))
    if len(sources) != 3: raise RuntimeError("Unexpected Android transport source closure")
    original = {path: path.read_bytes() for path in sources}
    with tempfile.TemporaryDirectory(prefix="st-android-backup-") as folder:
        subprocess.run([str(javac), "-encoding", "UTF-8", "-Xlint:all,-deprecation", "-Werror", "-cp", str(args.android_jar),
            "-d", folder, *map(str, sources), str(Path(__file__).with_name("BackupDocumentIOChecks.java"))], check=True, timeout=60)
        subprocess.run([str(java), "-cp", folder, "BackupDocumentIOChecks"], check=True, timeout=30)
    # A separate compilation replaces only Android OS calls with inert fixtures,
    # while executing the actual Bridge and Activity control flow. The first
    # compilation above independently checks the genuine Android API surface.
    with tempfile.TemporaryDirectory(prefix="st-android-backup-host-") as folder:
        fixture_root = Path(folder)
        fixtures = []
        for name, content in SOURCES.items():
            path = fixture_root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            fixtures.append(path)
        subprocess.run([str(javac), "-encoding", "UTF-8", "-Xlint:all", "-Werror", "-d", folder,
            *map(str, sources), *map(str, fixtures), str(Path(__file__).with_name("AndroidBackupBridgeChecks.java"))], check=True, timeout=60)
        subprocess.run([str(java), "-cp", folder, "com.singedterra.laststand.backup.AndroidBackupBridgeChecks"], check=True, timeout=30)
        faults = [
            ("LastStandBackupBridge.java", "cleanup.execute(() -> {", "close(stream); cleanup.execute(() -> {", "cancel waited on provider close"),
            ("LastStandBackupActivity.java", "@Override protected void onDestroy() {",
             "@Override protected void onDestroy() { if (request != null && request.deadline != null) "
             "new android.os.Handler(android.os.Looper.getMainLooper()).removeCallbacks(request.deadline);",
             "Activity replacement removed or restarted the request deadline"),
        ]
        for index, (name, before, after, assertion) in enumerate(faults):
            actual = next(path for path in sources if path.name == name)
            text = original[actual].decode("utf-8")
            if text.count(before) != 1: raise RuntimeError("Android negative-control anchor changed: " + name)
            fault_root = fixture_root / ("fault-" + str(index))
            fault_root.mkdir()
            substitute = fault_root / name
            substitute.write_text(text.replace(before, after, 1), encoding="utf-8")
            selected = [substitute if path == actual else path for path in sources]
            subprocess.run([str(javac), "-encoding", "UTF-8", "-Xlint:all", "-Werror", "-d", str(fault_root),
                *map(str, selected), *map(str, fixtures), str(Path(__file__).with_name("AndroidBackupBridgeChecks.java"))], check=True, timeout=60)
            result = subprocess.run([str(java), "-cp", str(fault_root), "com.singedterra.laststand.backup.AndroidBackupBridgeChecks"],
                capture_output=True, text=True, timeout=30)
            if result.returncode == 0 or assertion not in result.stderr:
                raise RuntimeError("Android regression control was not detected: " + name + "\n" + result.stdout + result.stderr)
            print("PASS negative control detected: " + assertion)
    if any(path.read_bytes() != contents for path, contents in original.items()):
        raise RuntimeError("Android production sources changed during verification")
    print("Android source SHA256: " + ", ".join(path.name + "=" + hashlib.sha256(contents).hexdigest() for path, contents in original.items()))
    print("PASS Android source compilation; physical picker/lifecycle qualification remains separate")


if __name__ == "__main__": main()
