"""Generate source-bound accelerated development saves, never player qualification."""
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


def sha(data):
    return hashlib.sha256(data).hexdigest()


def generate(editor=EDITOR):
    sources = complete_sources(SCRIPTS, [SCRIPTS / name for name in (
        "EncounterModel.cs", "EncounterProfile.cs", "LastStandProgression.cs", "LastStandStore.cs",
        "LastStandRunClock.cs", "LastStandSpeedPolicy.cs", "LastStandShopState.cs")])
    sources += [DIRECTORY / "EarnedMilestoneFixtures.cs", Path(__file__), DIRECTORY.parent / "last_stand_source_closure.py"]
    hashes = lambda: {path.relative_to(REPO).as_posix(): sha(path.read_bytes()) for path in sources}
    before = hashes()
    with tempfile.TemporaryDirectory(prefix="st-earned-milestones-") as folder:
        executable = Path(folder) / "EarnedMilestones.exe"
        mono = editor / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
        compiler = editor / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
        commands = [[str(mono), str(compiler), "-nologo", "-warnaserror+", f"-out:{executable}",
                     *[str(path) for path in sources if path.suffix == ".cs"]], [str(mono), str(executable)]]
        outputs = []
        for command in commands:
            result = subprocess.run(command, cwd=REPO, capture_output=True, text=True, encoding="utf-8-sig", timeout=120)
            if result.returncode:
                raise RuntimeError(f"Command failed ({result.returncode}): {command}\n{result.stdout}{result.stderr}")
            outputs.append(result.stdout)
    if hashes() != before:
        raise RuntimeError("Production or generator sources changed during execution; regenerate with stable sources.")
    result = json.loads(outputs[-1])
    if {(item["fitting"], item["targetWave"]) for item in result["cases"]} != {
            (fitting, wave) for fitting in ("repair", "launcher") for wave in (100, 300)}:
        raise RuntimeError("Missing earned prerequisite fixture.")
    return dict(schema="last-stand-earned-milestone-fixtures/v1", generatedAt=datetime.now(timezone.utc).isoformat(),
                scope="Accelerated deterministic production-earned development setup; seeded browser fixtures, not ordinary player, elapsed endurance, native or media acceptance.",
                storageKey="singedTerra.lastStand.prototype.v1", sourceSha256=before,
                commands=commands, commandWorkingDirectory=REPO.as_posix(),
                policy="Start empty; buy cheapest eligible run track after kills, tie order cannon/hull/cadence/armor/auxiliary. After natural defeat, buy cheapest eligible permanent tracks using only committed Salvage. Save each actual wave. Independently restore each fixture and clear the next wave without purchases.",
                expectedComparison="Every parsed save field must match expected next-wave output except checkpoint.shop.purchaseSequence, a validated volatile quote/lifecycle epoch rebased on restore and affected by browser pause/catch-up. No fixture save field is rewritten.",
                **result)


def write(result, destination):
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=False)
    for item in result["cases"]:
        for key, path_key, sha_key, suffix in (("save", "savePath", "saveSha256", "before"),
                                              ("expectedSave", "expectedSavePath", "expectedSaveSha256", "expected-next-clear")):
            raw = item.pop(key).encode("utf-8")
            path = destination / f'{item["fitting"]}-tier1-wave{item["targetWave"]}-{suffix}.json'
            path.write_bytes(raw)
            item[path_key], item[sha_key] = path.as_posix(), sha(raw)
    path = destination / "manifest.json"
    path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--editor", type=Path, default=EDITOR)
    parser.add_argument("--output", type=Path, required=True, help="New directory; refuses overwrite.")
    args = parser.parse_args()
    result = generate(args.editor)
    result["generatorCommand"] = [sys.executable, str(Path(__file__)), *sys.argv[1:]]
    path = write(result, args.output)
    print(json.dumps({"manifest": path.as_posix(), "cases": len(result["cases"]),
                      "trajectories": len(result["trajectories"]), "scope": result["scope"]}))


if __name__ == "__main__":
    main()
