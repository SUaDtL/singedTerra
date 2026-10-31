"""Compile or manually exercise the actual Windows backup picker on fixture bytes.

--compile-only launches no dialog. --mode opens one real OS picker for the
operator; this script does not select files, send input or load a player profile.
Each invocation creates fresh local Evidence with source/tool/output bindings.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

TOOLS = Path(__file__).resolve().parents[1]
ROOT = TOOLS.parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_test_runtime import compile_csharp, discover_toolchain

FIXTURE = TOOLS / "last_stand_architecture/fixtures/profile-v5-wave30.json"
HEADER = b"SINGED_TERRA_LAST_STAND_BACKUP 1\n"
MAXIMUM_BYTES = 128 * 1024


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def new_json(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--compile-only", action="store_true")
    action.add_argument("--mode", choices=("export", "import", "cancel"))
    parser.add_argument("--timeout", type=int, default=180,
                        help="Actual picker deadline in seconds (30 through 600)")
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("The actual Windows picker check requires a Windows host.")
    if not 30 <= args.timeout <= 600:
        parser.error("--timeout must be between 30 and 600 seconds.")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    evidence = ROOT / "campaign-unity/Evidence/continuity/native-picker" / stamp
    evidence.mkdir(parents=True, exist_ok=False)
    scripts = ROOT / "campaign-unity/Unity/Assets/Scripts"
    sources = [scripts / "Platform/LastStandBackupTransport.cs",
               scripts / "Platform/LastStandWindowsBackupPicker.cs",
               Path(__file__).with_name("NativeBackupPickerCheck.cs")]
    bound = [*sources, Path(__file__), TOOLS / "last_stand_test_runtime.py", FIXTURE]
    inputs = {p.relative_to(ROOT).as_posix(): digest(p) for p in bound}
    executable = evidence / "NativeBackupPickerCheck.exe"
    fixture = evidence / "fixture-v5-wave30.laststand"
    export_path = evidence / "selected-export.laststand"
    native_result = evidence / "picker-result.json"
    record = {
        "schema": "singedterra-native-backup-picker-evidence/v1",
        "recordedUtc": datetime.now(timezone.utc).isoformat(),
        "mode": args.mode,
        "status": "preparing",
        "sourceBindings": inputs,
        "bindingMode": "raw SHA-256",
        "fixtureOrigin": FIXTURE.relative_to(ROOT).as_posix(),
        "fixtureKind": "Explicit retained test profile; no owner profile access",
        "limit": "Actual Windows adapter dialog only; not a full native-player journey or device qualification.",
        "launchedPicker": False,
    }
    process = None
    exit_code = 1
    try:
        payload = HEADER + FIXTURE.read_bytes()
        payload.decode("utf-8", "strict")
        if not 0 < len(payload) <= MAXIMUM_BYTES:
            raise ValueError("Retained fixture is not a bounded backup document.")
        with fixture.open("xb") as stream:
            stream.write(payload)
        mono, compiler, compiler_mode = discover_toolchain()
        record["tools"] = {"mono": {"path": str(mono), "sha256": digest(mono)},
                           "compiler": {"path": str(compiler), "sha256": digest(compiler)}}
        compiled = compile_csharp(executable, sources, defines=("UNITY_STANDALONE_WIN",),
                                  mono=mono, compiler=compiler, compiler_mode=compiler_mode)
        record["compile"] = {"argv": list(compiled.argv), "exitCode": compiled.returncode,
                             "sourceSha256": compiled.source_sha256,
                             "executableSha256": digest(executable)}
        new_json(evidence / "compile.json", record["compile"])
        (evidence / "compile.stdout.log").write_text(compiled.stdout, encoding="utf-8")
        (evidence / "compile.stderr.log").write_text(compiled.stderr, encoding="utf-8")
        record["fixture"] = {"path": str(fixture), "bytes": len(payload), "sha256": digest(fixture)}
        print("EVIDENCE_DIR=" + str(evidence), flush=True)
        print("FIXTURE_INPUT=" + str(fixture), flush=True)
        print("EXPECTED_EXPORT_PATH=" + str(export_path), flush=True)
        if args.compile_only:
            record["status"] = "compiled; picker not launched"
            exit_code = 0
        else:
            argv = [str(mono), str(executable), args.mode, str(fixture), str(native_result)]
            record["picker"] = {"argv": argv, "cwd": str(ROOT), "timeoutSeconds": args.timeout}
            new_json(evidence / "invocation.json", record["picker"])
            with (evidence / "picker.stdout.log").open("xb") as stdout, (evidence / "picker.stderr.log").open("xb") as stderr:
                process = subprocess.Popen(argv, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                           creationflags=subprocess.CREATE_NO_WINDOW)
                record["launchedPicker"] = True
                record["picker"]["pid"] = process.pid
                print("PICKER_PID=" + str(process.pid), flush=True)
                try:
                    actual_exit = process.wait(timeout=args.timeout)
                except subprocess.TimeoutExpired:
                    record["picker"]["timedOut"] = True
                    process.terminate()  # Only this harness process; never name-based cleanup.
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=10)
                    actual_exit = process.returncode
                record["picker"]["exitCode"] = actual_exit
            if native_result.is_file() and 0 < native_result.stat().st_size <= 8192:
                record["picker"]["result"] = json.loads(native_result.read_text(encoding="utf-8"))
                record["picker"]["resultSha256"] = digest(native_result)
            passed = actual_exit == 0 and record["picker"].get("result", {}).get("adapterCheckPassed") is True
            if args.mode == "export":
                # The operator selects this printed path in the actual dialog.
                # The production picker never receives a preselected output path.
                output_size = export_path.stat().st_size if export_path.is_file() else None
                matches = output_size == len(payload) and export_path.read_bytes() == payload
                record["exportReadback"] = {"expectedPath": str(export_path), "bytesMatch": matches,
                                            "bytes": output_size,
                                            "sha256": digest(export_path) if output_size is not None and output_size <= MAXIMUM_BYTES else None}
                passed = passed and matches
            record["status"] = "pass" if passed else "fail"
            exit_code = 0 if passed else 1
    except Exception as error:
        record["status"] = "fail"
        record["failureType"] = type(error).__name__
        record["failure"] = str(error)[:1000]
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
            record["picker"]["interrupted"] = True
            record["picker"]["exitCode"] = process.returncode
            record["status"] = "fail; interrupted"
            exit_code = 1
        record["sourceUnchanged"] = all((ROOT / p).is_file() and digest(ROOT / p) == h for p, h in inputs.items())
        if not record["sourceUnchanged"]:
            record["status"] = "fail; source changed during check"
            exit_code = 1
        record["finishedUtc"] = datetime.now(timezone.utc).isoformat()
        new_json(evidence / "result.json", record)
        print("CHECK_RESULT=" + str(evidence / "result.json"), flush=True)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
