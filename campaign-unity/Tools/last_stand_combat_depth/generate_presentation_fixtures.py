"""Source-bound DEVELOPMENT saves for presentation, never earned-player proof."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import tempfile

DIRECTORY = Path(__file__).resolve().parent
TOOLS = DIRECTORY.parent
REPO = TOOLS.parent.parent
SCRIPTS = TOOLS.parent / "Unity/Assets/Scripts"
RESEARCH = TOOLS / "last_stand_research"
LEGACY = RESEARCH / "fixtures/legacy-v4.json"
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp, MONO, CSC


def sha(data):
    return hashlib.sha256(data).hexdigest()


def generate(utc_ms=None):
    sources = complete_sources(SCRIPTS, [SCRIPTS / "LastStandProgression.cs"])
    research_driver = RESEARCH / "QualificationFixtureGenerator.cs"
    driver = DIRECTORY / "PresentationFixtureGenerator.cs"
    inputs = sources + [research_driver, driver, Path(__file__),
                        RESEARCH / "generate_qualification_fixtures.py",
                        TOOLS / "last_stand_source_closure.py", TOOLS / "last_stand_test_runtime.py",
                        LEGACY, LEGACY.with_suffix(".manifest.json")]
    hashes = lambda: {path.relative_to(REPO).as_posix(): sha(path.read_bytes()) for path in inputs}
    tool_hashes = lambda: {str(path): sha(path.read_bytes()) for path in (MONO, CSC)}
    before, tools_before = hashes(), tool_hashes()
    commands = []

    def execute(executable, arguments):
        result = run_csharp(executable, arguments, timeout_seconds=120)
        commands.append(dict(argv=[str(MONO), str(executable), *map(str, arguments)],
                             exit=result.returncode, stdoutUtf8Sha256=sha(result.stdout.encode("utf-8")),
                             stderrUtf8Sha256=sha(result.stderr.encode("utf-8"))))
        if result.returncode:
            raise RuntimeError("Actual fixture generator failed:\n" + result.stdout + result.stderr)
        return json.loads(result.stdout)

    def compile_driver(executable, driver_path):
        built = compile_csharp(executable, sources + [driver_path], warnings_as_errors=True, timeout_seconds=120)
        commands.append(dict(argv=list(built.argv), exit=0, executableSha256=sha(executable.read_bytes()),
                             stdoutUtf8Sha256=sha(built.stdout.encode("utf-8")),
                             stderrUtf8Sha256=sha(built.stderr.encode("utf-8"))))

    with tempfile.TemporaryDirectory(prefix="st-presentation-fixtures-") as folder:
        folder = Path(folder)
        # Reuse the unchanged research generator behind its existing Python CLI.
        # Shared compiler plumbing permits both the Windows and Linux CI hosts.
        mature_exe = folder / "ResearchFixtures.exe"
        compile_driver(mature_exe, research_driver)
        research = execute(mature_exe, [LEGACY, "live" if utc_ms is None else utc_ms, 60000])
        mature = next(row for row in research["cases"] if row["id"] == "mature-5x")
        seed = folder / "mature-5x.json"
        seed.write_bytes(mature["save"].encode("utf-8"))
        seed_hash = sha(seed.read_bytes())
        executable = folder / "PresentationFixtures.exe"
        compile_driver(executable, driver)
        payload = execute(executable, [seed, "live" if utc_ms is None else utc_ms])
        if sha(seed.read_bytes()) != seed_hash:
            raise RuntimeError("The source-generated mature input changed during presentation generation")
    if before != hashes() or tools_before != tool_hashes():
        raise RuntimeError("Fixture source or compiler/runtime changed during execution")
    cases = payload["cases"]
    cases.append(dict(id="legacy-v4", save=LEGACY.read_bytes().decode("utf-8"), version=4,
                      clockMode="historical pinned compatibility bytes", createdUtcMilliseconds=None,
                      sourcePath=LEGACY.relative_to(REPO).as_posix(),
                      sourceManifestPath=LEGACY.with_suffix(".manifest.json").relative_to(REPO).as_posix(),
                      scope="Unchanged pinned compatibility input; not a current presentation profile."))
    return dict(schema="last-stand-combat-depth-presentation-fixtures/v1",
                storageKey="singedTerra.lastStand.prototype.v1",
                generatedAt=datetime.now(timezone.utc).isoformat(),
                generatedUtcMilliseconds=max(row["createdUtcMilliseconds"] or 0 for row in cases),
                clockMode="current UTC final anchors; synthetic earlier training" if utc_ms is None else "fixed UTC for generator regression only",
                scope="Explicit isolated DEVELOPMENT seeds: gifted Salvage/permanent strength, synthetic research time and simulated continuous cohorts; not earned progression, elapsed endurance, host gameplay or player acceptance.",
                sourceSha256=before, toolSha256=tools_before, sourceUnchanged=True,
                commands=commands, commandWorkingDirectory=REPO.as_posix(),
                reusedResearchGenerator=research_driver.relative_to(REPO).as_posix(),
                matureSeedSha256=seed_hash, matureSeedProvenance={key: value for key, value in mature.items() if key != "save"},
                cases=cases)


def write(result, destination):
    # Only known sibling names are exported, before creating any output.
    identities = [row["id"] for row in result["cases"]]
    if identities != ["roster-ready", "tier2-before-elite", "legacy-v4"]:
        raise ValueError("Unexpected presentation fixture identities")
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
    parser.add_argument("--output", type=Path, required=True, help="Fresh output directory; never overwrite.")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output directory already exists")
    report = generate()
    report["generatorCommand"] = [sys.executable, str(Path(__file__)), *sys.argv[1:]]
    print(json.dumps({"manifest": str(write(report, args.output)), "cases": len(report["cases"])}))
