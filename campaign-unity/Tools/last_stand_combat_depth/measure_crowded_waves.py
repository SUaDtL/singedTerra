"""Replay the frozen v4 crowded-wave calibration without adopting current v5 rules.

The original producer and exact admitted source closure are retained in a bounded
archive. Current buildcraft measurements have their own producer. No report,
source pin or old outcome is rewritten to accommodate a new game edition.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path, PurePosixPath
import shutil
import sys
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
FIXTURE = HERE / "fixtures/crowded-v4-replay.zip"
MANIFEST = FIXTURE.with_suffix(".json")
REPORT_NAMES = ("combat-balance-baseline-report.json", "combat-balance-calibrated-report.json",
                "crowded-wave-baseline-report.json", "crowded-wave-calibrated-report.json")


def extract_retained_sources(archive, manifest, destination):
    """Admit the exact bounded archive before executing any retained Python."""
    raw = Path(archive).read_bytes()
    record = json.loads(Path(manifest).read_text(encoding="utf-8"))
    if record.get("schema") != "last-stand-retained-crowded-sources/v1" or record.get("sourceCommit") != "219239001787993cf6e71fab33cd87a26f16eff7":
        raise ValueError("Unknown retained replay identity")
    if hashlib.sha256(raw).hexdigest() != record.get("archiveSha256"):
        raise ValueError("Retained replay archive changed")
    files = record["files"]
    if not 1 <= len(files) <= 64 or sum(row["bytes"] for row in files.values()) > 1024 * 1024:
        raise ValueError("Retained replay archive exceeds its bounded closure")
    destination = Path(destination).resolve()
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        if len(entries) != len(files) or {entry.filename for entry in entries} != set(files):
            raise ValueError("Retained replay archive membership changed")
        admitted = []
        for entry in entries:
            name = PurePosixPath(entry.filename)
            if name.is_absolute() or ".." in name.parts or "\\" in entry.filename or entry.file_size != files[entry.filename]["bytes"]:
                raise ValueError("Invalid retained replay member")
            data = source.read(entry)
            if hashlib.sha256(data).hexdigest() != files[entry.filename]["sha256"]:
                raise ValueError("Retained replay source changed")
            target = destination.joinpath(*name.parts)
            if not target.resolve().is_relative_to(destination) or target.exists():
                raise ValueError("Retained replay destination is not empty")
            admitted.append((target, data))
        for target, data in admitted:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    return record


def load_retained_replay():
    owner = tempfile.TemporaryDirectory(prefix="st-crowded-v4-replay-")
    replay = Path(owner.name) / "campaign-unity"
    record = extract_retained_sources(FIXTURE, MANIFEST, replay)
    reports = replay / "docs/last-stand-combat-depth"
    reports.mkdir(parents=True)
    protected = [PROJECT / "docs/last-stand-combat-depth" / name for name in REPORT_NAMES]
    for path in protected:
        shutil.copyfile(path, reports / path.name)
    # Load exact retained modules by path, without inheriting a previously loaded
    # current producer or closure helper from the caller's Python process.
    prior = {}
    selected = [("last_stand_test_runtime", "Tools/last_stand_test_runtime.py"),
                ("last_stand_source_closure", "Tools/last_stand_source_closure.py"),
                ("measure_combat_balance", "Tools/last_stand_combat_depth/measure_combat_balance.py"),
                ("_retained_crowded_v4", "Tools/last_stand_combat_depth/measure_crowded_waves.py")]
    try:
        for name, relative in selected:
            prior[name] = sys.modules.get(name)
            spec = importlib.util.spec_from_file_location(name, replay / relative)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
        retained = module
    finally:
        for name, previous in prior.items():
            if previous is None:sys.modules.pop(name, None)
            else:sys.modules[name] = previous
    retained._snapshot_owner = owner
    retained.extract_retained_sources = extract_retained_sources
    retained.retained_fixture = FIXTURE
    retained.retained_manifest = MANIFEST
    original_admit = retained.admit_destination
    def admit_destination(destination):
        target = Path(destination).resolve()
        for source in protected:
            if target == source.resolve() or target.exists() and source.exists() and target.samefile(source):
                raise ValueError("Output cannot overwrite an immutable measurement reference")
        return original_admit(target)
    retained.admit_destination = admit_destination
    original_measure = retained.measure
    def measure(destination, binding_name="calibrated"):
        destination = admit_destination(destination)
        harness = destination.with_suffix(".observer.cs")
        if destination.exists() or harness.exists():
            raise ValueError("Preserve existing retained replay output")
        original_measure(destination, binding_name)
        result = json.loads(destination.read_text(encoding="utf-8"))
        with harness.open("xb") as output:
            output.write(Path(result["generatedHarnessPath"]).read_bytes())
        result["generatedHarnessPath"] = str(harness)
        result["retainedReplay"] = {"sourceCommit": record["sourceCommit"],
            "archiveSha256": record["archiveSha256"],
            "qualification": "Historical v4 source replay only; current v5 behavior is measured separately."}
        destination.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    retained.measure = measure
    return retained


retained = load_retained_replay()
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binding", choices=tuple(retained.BINDINGS), default="calibrated")
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    retained.measure(arguments.output, arguments.binding)
else:
    # Existing tests patch the actual producer globals, including its deliberate
    # corruption seams. A copied facade namespace would hide those mutations.
    sys.modules[__name__] = retained
