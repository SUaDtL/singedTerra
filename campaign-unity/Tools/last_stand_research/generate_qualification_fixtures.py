"""Production-valid development seeds, not evidence of ordinary earned progression."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import tempfile

DIRECTORY = Path(__file__).resolve().parent
PROJECT = DIRECTORY.parents[1]
REPO = PROJECT.parent
sys.path.insert(0, str(DIRECTORY.parent))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, discover_toolchain, run_csharp

SCRIPTS = PROJECT / "Unity/Assets/Scripts"
LEGACY = DIRECTORY / "fixtures/legacy-v4.json"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def generate(editor=None, lab_remaining_ms=2000, utc_ms=None):
    sources = complete_sources(SCRIPTS, [SCRIPTS / "LastStandProgression.cs"])
    sources += [DIRECTORY / "QualificationFixtureGenerator.cs", Path(__file__),
                DIRECTORY.parent / "last_stand_source_closure.py",
                DIRECTORY.parent / "last_stand_test_runtime.py", LEGACY,
                DIRECTORY / "fixtures/legacy-v4.manifest.json"]
    hashes = lambda: {path.relative_to(REPO).as_posix(): sha(path.read_bytes()) for path in sources}
    before = hashes()
    with tempfile.TemporaryDirectory(prefix="st-research-qualification-") as folder:
        executable = Path(folder) / "QualificationFixtures.exe"
        if editor is None:
            mono, compiler, mode = discover_toolchain()
        else:
            mono = editor / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
            compiler = editor / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
            mode = "managed"
        build = compile_csharp(executable, [path for path in sources if path.suffix == ".cs"],
                               mono=mono, compiler=compiler, compiler_mode=mode,
                               warnings_as_errors=True, timeout_seconds=60)
        result = run_csharp(executable, [LEGACY, "live" if utc_ms is None else utc_ms, lab_remaining_ms],
                            mono=mono, timeout_seconds=60)
        commands = [list(build.argv), result.args]
        if result.returncode:
            raise RuntimeError(f"Command failed ({result.returncode}): {result.args}\n{result.stdout}{result.stderr}")
    if hashes() != before:
        raise RuntimeError("Production or generator sources changed during execution; regenerate with stable sources.")
    payload = json.loads(result.stdout)
    return dict(schema="last-stand-research-qualification-fixtures/v1",
                generatedAt=datetime.now(timezone.utc).isoformat(),
                generatedUtcMilliseconds=max(item["createdUtcMilliseconds"] for item in payload["cases"]),
                storageKey="singedTerra.lastStand.prototype.v1", sourceSha256=before,
                scope="Explicit development seeds for browser qualification. Gifted Salvage/permanent levels and accelerated research time are not ordinary player progression or elapsed endurance evidence.",
                prerequisiteProvenance="Portable pinned legacy-v4 compatibility fixture cleared 100 waves using gifted old maximum investments; its legal flags are preserved and its active run is abandoned through production before seeding a fresh setup.",
                clockMode="current UTC final anchors; synthetic earlier training" if utc_ms is None else "fixed UTC for generator regression only",
                commands=commands, commandWorkingDirectory=Path.cwd().as_posix(), **payload)


def write(result, destination):
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=False)
    for item in result["cases"]:
        raw = item.pop("save").encode("utf-8")
        name = item["id"] + ".json"
        (destination / name).write_bytes(raw)
        item["savePath"], item["saveSha256"] = name, sha(raw)
    path = destination / "manifest.json"
    path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--editor", type=Path, help="Explicit Unity Editor; otherwise use shared toolchain discovery.")
    parser.add_argument("--output", type=Path, required=True, help="New directory; refuses overwrite.")
    parser.add_argument("--lab-remaining-ms", type=int, default=2000)
    args = parser.parse_args()
    report = generate(args.editor, args.lab_remaining_ms)
    report["generatorCommand"] = [sys.executable, str(Path(__file__)), *sys.argv[1:]]
    print(json.dumps({"manifest": str(write(report, args.output)), "cases": len(report["cases"])}))
