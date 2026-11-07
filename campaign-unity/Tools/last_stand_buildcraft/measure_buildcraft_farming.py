"""Deeper farming and low-touch pacing, retaining actual earned seed and transaction owners."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import time

from measure_buildcraft_balance import sources, hashes, HERE, TOOLS
from last_stand_test_runtime import compile_csharp, run_csharp, CSC, MONO


def measure(funding, output):
    selected = [p for p in sources() if p.name != "BuildcraftBalanceMeasurements.cs"] + [HERE / "BuildcraftFarmingMeasurements.cs"]
    inputs = selected + [Path(__file__), HERE / "measure_buildcraft_balance.py", TOOLS / "last_stand_source_closure.py", TOOLS / "last_stand_test_runtime.py"]
    before = hashes(inputs)
    tool_hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)}
    funding_bytes = funding.read_bytes()
    seed = json.loads(funding_bytes.decode("utf-8-sig"))["seed"]
    if hashlib.sha256(seed["profileJson"].encode()).hexdigest() != seed["profileSha256"]:
        raise ValueError("Earned seed hash mismatch")
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="st-buildcraft-farming-") as folder:
        folder = Path(folder)
        metadata, profile = folder / "seed.json", folder / "profile.json"
        metadata.write_text(json.dumps({k: v for k, v in seed.items() if k != "profileJson"}), encoding="utf-8")
        profile.write_text(seed["profileJson"], encoding="utf-8")
        target = folder / "Farming.exe"
        compile_csharp(target, selected, defines=("BUILDCRAFT_BALANCE",))
        run = run_csharp(target, [metadata, profile], timeout_seconds=900)
        if run.returncode:
            raise RuntimeError(run.stdout + run.stderr)
        result = json.loads(run.stdout)
    if result["parentProfileSha256"] != seed["profileSha256"]:
        raise ValueError("Comparison changed the earned profile")
    if before != hashes(inputs) or funding_bytes != funding.read_bytes() or tool_hashes != {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)}:
        raise RuntimeError("Farming inputs changed")
    result.update(schema=1, sourceSha256=before, toolSha256=tool_hashes,
                  fundingSha256=hashlib.sha256(funding_bytes).hexdigest(), executionSeconds=time.monotonic()-started)
    output.write_text(json.dumps(result, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "lowTouchWave": result["lowTouchDeepRun"]["highestClearedWave"], "seconds": result["executionSeconds"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--funding", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    measure(args.funding, args.output)
