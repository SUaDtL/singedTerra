"""Deterministic build/source provenance through the ADR-0017 Node boundary only."""
import json
from pathlib import Path
import re
import subprocess
import tempfile

NODE_HELPER = Path(__file__).resolve().parents[2] / "scripts/lib/provenance-hash.mjs"
PROVENANCE_INPUTS = (Path(__file__).resolve(), NODE_HELPER)
SOURCE_LF_NORMALIZATION = "CRLF-and-CR-to-LF; all other bytes preserved"


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate provenance response field")
        result[key] = value
    return result


def hash_files(paths):
    """Hash an ordered file batch; reject missing, partial or substituted replies."""
    paths = [Path(path).resolve() for path in paths]
    if len(set(paths)) != len(paths):
        raise ValueError("Duplicate provenance input")
    result = {}
    for offset in range(0, len(paths), 256):
        batch = paths[offset:offset + 256]
        names = [str(path) for path in batch]
        completed = subprocess.run(["node", str(NODE_HELPER), "--hash-files"],
            input=json.dumps({"paths": names}), text=True, encoding="utf-8",
            capture_output=True, timeout=30, check=True)
        reply = json.loads(completed.stdout, object_pairs_hook=_unique_object)
        if not isinstance(reply, dict) or set(reply) != {"files"} or not isinstance(reply["files"], list) or len(reply["files"]) != len(batch):
            raise ValueError("Malformed provenance response")
        for path, name, row in zip(batch, names, reply["files"]):
            if not isinstance(row, dict) or set(row) != {"path", "sha256"} or row["path"] != name or not isinstance(row["sha256"], str) or re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) is None:
                raise ValueError("Provenance response does not match input")
            result[path] = row["sha256"]
    return result


def hash_bytes(values, normalize_lf=False):
    """Retain exact bytes in owned temporary files for the approved file CLI."""
    values = list(values)
    if any(not isinstance(value, bytes) for value in values):
        raise TypeError("Provenance values must be bytes")
    with tempfile.TemporaryDirectory(prefix="st-provenance-") as folder:
        paths = []
        for index, value in enumerate(values):
            if normalize_lf:
                value = value.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
            path = Path(folder) / (str(index) + ".bin")
            path.write_bytes(value); paths.append(path)
        digests = hash_files(paths)
        return [digests[path.resolve()] for path in paths]


def lf_sha256(raw):
    return hash_bytes([raw], normalize_lf=True)[0]


def source_hashes(paths, root):
    root = Path(root).resolve()
    return {path.relative_to(root).as_posix(): digest for path, digest in hash_files(paths).items()}


def source_bindings(paths, root):
    """Pair raw/LF identities from one read without decoding or dropping BOMs."""
    root = Path(root).resolve(); paths = [Path(path).resolve() for path in paths]
    if len(set(paths)) != len(paths):
        raise ValueError("Duplicate provenance input")
    values = [path.read_bytes() for path in paths]
    normalized = [value.replace(b"\r\n", b"\n").replace(b"\r", b"\n") for value in values]
    digests = hash_bytes(values + normalized); count = len(paths)
    names = [path.relative_to(root).as_posix() for path in paths]
    return {"sourceSha256": dict(zip(names, digests[:count])),
            "sourceLfNormalization": SOURCE_LF_NORMALIZATION,
            "sourceLfSha256": dict(zip(names, digests[count:]))}
