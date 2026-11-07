"""Explicit one-time capture from pinned Git source, never from the working tree.

Run only when intentionally establishing/reviewing a new architecture baseline.
Ordinary tests consume frozen observations and do not invoke this tool.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from test_foundation_baseline import BASELINE, FIXTURES, HARNESS, TOOLS, compile_harness, observe, sources


def main():
    repo = TOOLS.parents[1]
    source_prefix = "campaign-unity/Unity/Assets/Scripts/"
    with tempfile.TemporaryDirectory(prefix="st-pinned-foundation-") as folder:
        folder = Path(folder)
        hashes, pinned = {}, []
        # Regeneration must use the captured historical closure, not today's
        # dependency map (which may include newly authored content/services).
        manifest = FIXTURES / "baseline.json"
        declared = json.loads(manifest.read_text(encoding="utf-8"))["source_sha256"] if manifest.exists() else None
        paths = list(declared) if declared is not None else [source_prefix + path.name for path in sources()]
        for relative in paths:
            raw = subprocess.run(["git", "show", f"{BASELINE}:{relative}"], cwd=repo,
                                 capture_output=True, check=True).stdout
            hashes[relative] = hashlib.sha256(raw).hexdigest()
            if declared is not None and hashes[relative] != declared[relative]:
                raise AssertionError("Pinned baseline source digest changed")
            copy = folder / Path(relative).name
            copy.write_bytes(raw)
            pinned.append(copy)
        exe = folder / "Baseline.exe"
        compile_harness(exe, pinned)
        save = folder / "profile-v5-wave30.json"
        captured = observe(exe, "capture", save)
        verified = observe(exe, "verify", save)
        FIXTURES.mkdir(parents=True, exist_ok=True)
        raw_save = save.read_bytes()
        (FIXTURES / save.name).write_bytes(raw_save)
        record = {
            "source_commit": BASELINE,
            "source_sha256": hashes,
            "harness_sha256": hashlib.sha256(HARNESS.read_bytes().replace(b"\r\n", b"\n")).hexdigest(),
            "save_sha256": hashlib.sha256(raw_save).hexdigest(),
            "capture_observations": captured,
            "verification_observations": verified,
            "scope": "Synthetic model/economy/clock/profile observations, not earned progression, rendered UI, device, performance or endurance qualification.",
        }
        (FIXTURES / "baseline.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"source_commit": BASELINE, "sources": len(pinned),
                          "capture_observations": len(captured), "verification_observations": len(verified)}))


if __name__ == "__main__":
    main()
