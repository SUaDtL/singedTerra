"""Write explicitly requested isolated Skills review profiles; never install saves."""
import argparse
import json
from pathlib import Path
import sys
import tempfile

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp
from last_stand_provenance import PROVENANCE_INPUTS, hash_bytes, hash_files, source_hashes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--combat-from", type=Path,
                        help="Derive a separate low-offense combat fixture from an existing explicit review collection")
    args = parser.parse_args()
    output = args.output.resolve()
    origin = args.combat_from.resolve() if args.combat_from else None
    if origin and (output == origin or output.exists()):
        raise ValueError("Combat review requires a new output path; retained inputs must not be overwritten")
    origin_bytes = origin.read_bytes() if origin else None
    origin_profile = None
    if origin:
        original = json.loads(origin_bytes)
        if original.get("kind") != "isolated-skills-review-fixtures" or original.get("saveVersion") != 9:
            raise ValueError("Declared development review fixture required")
        origin_profile = original["profiles"]["collection"]
        if not isinstance(origin_profile, str):
            raise ValueError("Original collection must contain production save bytes")
    scripts = TOOLS.parent / "Unity/Assets/Scripts"
    sources = complete_sources(scripts, [scripts / "LastStandProgression.cs"]) + [Path(__file__).with_name("SkillProgressionChecks.cs")]
    inputs = sources + [Path(__file__), TOOLS / "last_stand_source_closure.py", TOOLS / "last_stand_test_runtime.py"] + list(PROVENANCE_INPUTS)
    root = TOOLS.parents[1]
    input_hashes = source_hashes(inputs, root)
    with tempfile.TemporaryDirectory(prefix="st-skills-review-") as folder:
        exe = Path(folder) / "SkillProgressionChecks.exe"
        compile_csharp(exe, sources)
        if origin:
            extracted = Path(folder) / "collection.profile.json"
            extracted.write_text(origin_profile, encoding="utf-8", newline="\n")
        run = run_csharp(exe, ["combat-fixture", str(extracted), str(output)] if origin else ["fixture", str(output)], timeout_seconds=180)
        if run.returncode:
            raise RuntimeError(run.stdout + run.stderr)
        if input_hashes != source_hashes(inputs, root):
            raise ValueError("Fixture inputs changed during preflight")
        if origin:
            if origin.read_bytes() != origin_bytes:
                raise ValueError("Retained review fixture changed")
            report = json.loads(output.read_text(encoding="utf-8-sig"))
            report["origin"] = {"path": str(origin), "sha256": hash_bytes([origin_bytes])[0], "profile": "collection"}
            report["profileSha256"] = hash_bytes([report["profile"].encode()])[0]
            report["sourceSha256"] = input_hashes
            output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
            print(json.dumps(report["preflight"]))
        # Keep fixture/profile bytes stable; bind the generator and approved
        # provenance implementation separately for historical player reuse.
        provenance = {"kind": "skills-review-generator-provenance", "output": str(output),
                      "outputSha256": hash_files([output])[output], "sourceSha256": input_hashes}
        output.with_suffix(output.suffix + ".provenance.json").write_text(
            json.dumps(provenance, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(run.stdout.strip())


if __name__ == "__main__": main()
