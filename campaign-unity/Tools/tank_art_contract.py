"""Finite interchange contract for the original Last Stand tank art pack."""
import itertools
import json
from pathlib import Path
import subprocess

FAMILIES = ("foundry", "ranger", "bulwark", "jackal")
SLOTS = ("treads", "hull", "turret", "barrel")
MUZZLE = (0, 3.294, 0)


def require_new_outputs(source, output):
    for path in (source, output):
        if Path(path).exists():
            raise FileExistsError(f"Preserve existing authored output: {path}")


def sha256(path):
    source = str(Path(path).resolve())
    helper = Path(__file__).resolve().parents[2] / "scripts/lib/provenance-hash.mjs"
    result = subprocess.run(["node", str(helper), "--hash-files"],
                            input=json.dumps({"paths": [source]}), text=True, encoding="utf-8",
                            capture_output=True, timeout=30, check=True)
    files = json.loads(result.stdout)["files"]
    if len(files) != 1 or files[0]["path"] != source:
        raise ValueError("Checksum response does not match authored input")
    digest = files[0]["sha256"]
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError("Malformed provenance checksum")
    return digest


def validate_parts(parts):
    expected = {(family, slot) for family in FAMILIES for slot in SLOTS}
    if len(parts) != 16 or {(p["family"], p["slot"]) for p in parts} != expected:
        raise ValueError("Exactly sixteen unique family/slot parts are required")
    for part in parts:
        if part["id"] != f'{part["family"]}-{part["slot"]}' or part["triangles"] <= 0 or part["meshes"] <= 0:
            raise ValueError("Invalid geometry identity/count")
        if part["slot"] == "barrel" and tuple(part["muzzle"]) != MUZZLE:
            raise ValueError("Cosmetic barrel moved the common muzzle")
    combinations = list(itertools.product(*[[p for p in parts if p["slot"] == slot] for slot in SLOTS]))
    maximum = max(sum(p["triangles"] for p in combination) for combination in combinations)
    if maximum >= 25000:
        raise ValueError(f"Core triangle budget exceeded: {maximum}")
    return dict(compositions=len(combinations), maximum_core_triangles=maximum)


def validate_files(catalog, asset_root, campaign_root):
    if catalog["schema"] != "singedterra-tank-kits/1":
        raise ValueError("Unknown art catalog")
    files = [(Path(campaign_root) / catalog["source"], catalog["source_sha256"])]
    files += [(Path(asset_root) / p["model"], p["sha256"]) for p in catalog["parts"]]
    files += [(Path(asset_root) / t["path"], t["sha256"]) for m in catalog["materials"] for t in m["textures"]]
    for path, expected in files:
        if sha256(path) != expected:
            raise ValueError(f"Authored asset hash mismatch: {path}")
