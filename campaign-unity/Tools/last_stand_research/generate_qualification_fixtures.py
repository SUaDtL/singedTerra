"""Production-valid development seeds, not evidence of ordinary earned progression."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

DIRECTORY = Path(__file__).resolve().parent
PROJECT = DIRECTORY.parents[1]
REPO = PROJECT.parent
sys.path.insert(0, str(DIRECTORY.parent))
from last_stand_source_closure import complete_sources

EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
LEGACY = DIRECTORY / "fixtures/legacy-v4.json"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def generate(editor=EDITOR, lab_remaining_ms=2000, utc_ms=None):
    sources = complete_sources(SCRIPTS, [SCRIPTS / "LastStandProgression.cs"])
    sources += [DIRECTORY / "QualificationFixtureGenerator.cs", Path(__file__),
                DIRECTORY.parent / "last_stand_source_closure.py", LEGACY,
                DIRECTORY / "fixtures/legacy-v4.manifest.json"]
    hashes = lambda: {path.relative_to(REPO).as_posix(): sha(path.read_bytes()) for path in sources}
    before = hashes()
    with tempfile.TemporaryDirectory(prefix="st-research-qualification-") as folder:
        executable = Path(folder) / "QualificationFixtures.exe"
        mono = editor / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
        compiler = editor / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
        commands = [[str(mono), str(compiler), "-nologo", "-warnaserror+", f"-out:{executable}",
                     *[str(path) for path in sources if path.suffix == ".cs"]],
                    [str(mono), str(executable), str(LEGACY), "live" if utc_ms is None else str(utc_ms), str(lab_remaining_ms)]]
        outputs = []
        for command in commands:
            result = subprocess.run(command, cwd=REPO, capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
            if result.returncode:
                raise RuntimeError(f"Command failed ({result.returncode}): {command}\n{result.stdout}{result.stderr}")
            outputs.append(result.stdout)
    if hashes() != before:
        raise RuntimeError("Production or generator sources changed during execution; regenerate with stable sources.")
    payload = json.loads(outputs[-1])
    return dict(schema="last-stand-research-qualification-fixtures/v1",
                generatedAt=datetime.now(timezone.utc).isoformat(),
                generatedUtcMilliseconds=max(item["createdUtcMilliseconds"] for item in payload["cases"]),
                storageKey="singedTerra.lastStand.prototype.v1", sourceSha256=before,
                scope="Explicit development seeds for browser qualification. Gifted Salvage/permanent levels and accelerated research time are not ordinary player progression or elapsed endurance evidence.",
                prerequisiteProvenance="Portable pinned legacy-v4 compatibility fixture cleared 100 waves using gifted old maximum investments; its legal flags are preserved and its active run is abandoned through production before seeding a fresh setup.",
                clockMode="current UTC final anchors; synthetic earlier training" if utc_ms is None else "fixed UTC for generator regression only",
                commands=commands, commandWorkingDirectory=REPO.as_posix(), **payload)


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
    parser.add_argument("--editor", type=Path, default=EDITOR)
    parser.add_argument("--output", type=Path, required=True, help="New directory; refuses overwrite.")
    parser.add_argument("--lab-remaining-ms", type=int, default=2000)
    args = parser.parse_args()
    report = generate(args.editor, args.lab_remaining_ms)
    report["generatorCommand"] = [sys.executable, str(Path(__file__)), *sys.argv[1:]]
    print(json.dumps({"manifest": str(write(report, args.output)), "cases": len(report["cases"])}))
