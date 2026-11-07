"""Generate source-bound accelerated development saves, never player qualification."""
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
from last_stand_test_runtime import discover_toolchain, compile_csharp, run_csharp

EDITOR = Path(r"C:\Program Files\Unity 6000.3.27f2")
SCRIPTS = PROJECT / "Unity/Assets/Scripts"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def generate(editor=None):
    sources = complete_sources(SCRIPTS, [SCRIPTS / name for name in (
        "EncounterModel.cs", "EncounterProfile.cs", "LastStandProgression.cs", "LastStandStore.cs",
        "LastStandRunClock.cs", "LastStandSpeedPolicy.cs", "LastStandShopState.cs")])
    sources += [DIRECTORY / "EarnedMilestoneFixtures.cs", Path(__file__), DIRECTORY.parent / "last_stand_source_closure.py",
                DIRECTORY.parent / "last_stand_test_runtime.py"]
    hashes = lambda: {path.relative_to(REPO).as_posix(): sha(path.read_bytes()) for path in sources}
    before = hashes()
    with tempfile.TemporaryDirectory(prefix="st-earned-milestones-") as folder:
        executable = Path(folder) / "EarnedMilestones.exe"
        if editor is None:
            mono, compiler, mode = discover_toolchain()
        else:
            mono = editor / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
            compiler = editor / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
            mode = "managed"
        build = compile_csharp(executable, [path for path in sources if path.suffix == ".cs"],
                               warnings_as_errors=True, timeout_seconds=120, mono=mono, compiler=compiler, compiler_mode=mode)
        result = run_csharp(executable, timeout_seconds=120, mono=mono)
        commands = [list(build.argv), [str(mono), str(executable)]]
        if result.returncode:
            raise RuntimeError(f"Command failed ({result.returncode}): {commands[-1]}\n{result.stdout}{result.stderr}")
    if hashes() != before:
        raise RuntimeError("Production or generator sources changed during execution; regenerate with stable sources.")
    result = json.loads(result.stdout)
    if {(item["fitting"], item["targetWave"]) for item in result["cases"]} != {
            (fitting, wave) for fitting in ("repair", "launcher") for wave in (100, 300)}:
        raise RuntimeError("Missing earned prerequisite fixture.")
    return dict(schema="last-stand-earned-milestone-fixtures/v1", generatedAt=datetime.now(timezone.utc).isoformat(),
                scope="Accelerated deterministic production-earned development setup; seeded browser fixtures, not ordinary player, elapsed endurance, native or media acceptance.",
                storageKey="singedTerra.lastStand.prototype.v1", sourceSha256=before,
                commands=commands, commandWorkingDirectory=Path.cwd().as_posix(),
                policy="Start empty; buy cheapest eligible run track after kills, tie order cannon/hull/cadence/armor/auxiliary. After natural defeat, buy cheapest eligible permanent tracks using only committed Salvage. Save each actual wave. Independently restore each fixture and clear the next wave without purchases.",
                expectedComparison="Every parsed save field must match expected next-wave output except checkpoint.shop.purchaseSequence (validated volatile quote epoch), monotonic idle research clock/profile revision metadata validated by assertWaveSavePreserved, and current-run time buckets independently validated against exact committed 1x ticks, native resume/unpause observations and seed/load UTC bounds. Research ranks, projects, queues and all non-temporal gameplay, history and reward fields remain exact. No fixture save field is rewritten.",
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
    parser.add_argument("--editor", type=Path, help="Use this explicit Unity Editor's Mono/Roslyn; otherwise discover the host toolchain.")
    parser.add_argument("--output", type=Path, required=True, help="New directory; refuses overwrite.")
    args = parser.parse_args()
    result = generate(args.editor)
    result["generatorCommand"] = [sys.executable, str(Path(__file__)), *sys.argv[1:]]
    path = write(result, args.output)
    print(json.dumps({"manifest": path.as_posix(), "cases": len(result["cases"]),
                      "trajectories": len(result["trajectories"]), "scope": result["scope"]}))


if __name__ == "__main__":
    main()
