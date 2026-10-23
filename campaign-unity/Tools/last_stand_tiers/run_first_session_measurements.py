"""Run bounded first-session measurements using actual compiled production owners.

This is numerical source evidence, not a timed browser journey or owner acceptance.
The first upgrade uses committed wave income and the production purchase/reload
cycle. Temporary purchases follow the declared cheapest-eligible benchmark policy.
Long-run bounds and future 5x projections are measured by last_stand_waves/measure_balance.py.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import subprocess
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources


PROJECT = Path(__file__).resolve().parents[2]
REPO = PROJECT.parent
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
PINNED_EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
SOURCE_NAMES = (
    "EncounterModel.cs", "EncounterProfile.cs", "LastStandTierCatalog.cs",
    "LastStandUpgradeCatalog.cs", "MechanicsShopModel.cs", "LastStandProgression.cs",
    "LastStandStore.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs",
)
FIELDS = (
    "tier", "fitting", "scenario", "ticks", "kills", "hull", "status",
    "first_kill_tick", "first_incoming_hit_tick", "completed_waves", "banked_salvage",
    "cannon_shots", "launcher_shots", "hull_restored", "close_hits", "ranged_hits",
    "cannon_damage", "maximum_hull", "cannon_period_ticks", "launcher_damage", "repair_amount",
)


def run(command, timeout=60, cwd=None):
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True,
                            encoding="utf-8-sig", timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {command}\n{result.stdout}{result.stderr}")
    return result.stdout


def hashes(paths):
    result = {}
    for path in paths:
        content = path.read_bytes()
        result[path.relative_to(REPO).as_posix()] = {
            "sha256": hashlib.sha256(content).hexdigest(),
            "lf_sha256": hashlib.sha256(content.replace(b"\r\n", b"\n")).hexdigest(),
        }
    return result


def measure(editor):
    mono = editor / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
    compiler = editor / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
    sources = [SCRIPTS / name for name in SOURCE_NAMES] + [Path(__file__).with_suffix(".py"),
              Path(__file__).with_name("FirstSessionMeasurements.cs")]
    sources = complete_sources(SCRIPTS, sources)
    before = hashes(sources)
    with tempfile.TemporaryDirectory(prefix="st-first-session-measurements-") as folder:
        executable = Path(folder) / "FirstSessionMeasurements.exe"
        run([str(mono), str(compiler), "-nologo", "-warnaserror+", f"-out:{executable}",
             *[str(path) for path in sources if path.suffix == ".cs"]])
        raw = run([str(mono), str(executable)], timeout=30)
    if hashes(sources) != before:
        raise RuntimeError("Measured sources changed during compilation/execution; repeat with stable sources.")
    measurements, earned = [], []
    for line in raw.splitlines():
        record, *values = line.split(",")
        if record == "measurement" and len(values) == len(FIELDS):
            item = {key: value if key in ("fitting", "scenario", "status") else int(value)
                    for key, value in zip(FIELDS, values)}
            item["seconds"] = item["ticks"] / 20
            item["advancement_wave_reached"] = item["completed_waves"] >= 300
            measurements.append(item)
        elif record == "earned" and len(values) == 6:
            earned.append(dict(fitting=values[0], tier_one_ticks=int(values[1]),
                               tier_one_kills=int(values[2]), cannon_level=int(values[3]),
                               remaining_salvage=int(values[4]), tier_two_unlocked=values[5] == "True"))
        else:
            raise RuntimeError(f"Unexpected measurement output: {line}")
    if len(measurements) != 4 or len(earned) != 2:
        raise RuntimeError("Missing scenarios or production purchase proofs.")
    return {
        "schema": "last-stand-first-session-measurements-v2",
        "measured_at_utc": datetime.now(timezone.utc).isoformat(),
        "git_head": run(["git", "rev-parse", "HEAD"], cwd=REPO).strip(),
        "editor": str(editor), "scope": "compiled production model; no browser timing or player acceptance",
        "policy": "After each kill buy the cheapest eligible run track; ties prefer cannon, hull, cadence, armor, then fitting. Persist each actual wave boundary. Buy one permanent Cannon Attack level between measured runs.",
        "sources": before, "earned_upgrade_proofs": earned,
        "measurements": sorted(measurements, key=lambda item: (item["tier"], item["fitting"], item["scenario"])),
        "raw_output": raw.splitlines(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--editor", type=Path, default=PINNED_EDITOR)
    parser.add_argument("--output", type=Path, help="Write a new JSON evidence file; refuses overwrite.")
    args = parser.parse_args()
    result = measure(args.editor)
    text = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8", newline="\n") as output:
            output.write(text)
        print(f"Wrote {len(result['measurements'])} measurements and {len(result['earned_upgrade_proofs'])} upgrade proofs: {args.output}")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
