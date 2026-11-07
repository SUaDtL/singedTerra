"""Explicit inventory and isolated execution of campaign test modules.

Every test file must have an owner, including host-only and long calibration
checks. Listing a requirement is not evidence that its host check has passed.
"""
import argparse
import ast
from collections import Counter
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "last_stand_test_inventory.json"
LANES = frozenset({"portable", "calibration", "unity-editor", "native-browser", "artifact", "alias"})


def declared_cases(path):
    tree = ast.parse(Path(path).read_text(encoding="utf-8-sig"))
    return sorted(owner.name + "." + method.name for owner in tree.body if isinstance(owner, ast.ClassDef)
                  for method in owner.body if isinstance(method, ast.FunctionDef) and method.name.startswith("test_"))


def inventory(root=ROOT, manifest=MANIFEST):
    root = Path(root)
    entries = json.loads(Path(manifest).read_text(encoding="utf-8"))["tests"]
    indexed = {}
    for entry in entries:
        name = entry["path"]
        if name in indexed:
            raise ValueError("Duplicate test entry: " + name)
        if entry.get("lane") not in LANES or not entry.get("reason") or not entry.get("owner"):
            raise ValueError("Unclassified test entry: " + name)
        indexed[name] = entry
    discovered = {path.relative_to(root).as_posix() for path in root.rglob("test_*.py")}
    if discovered != set(indexed):
        raise ValueError("Test inventory drift; unclassified=" + repr(sorted(discovered - set(indexed))) +
                         "; removed=" + repr(sorted(set(indexed) - discovered)))
    for name, entry in indexed.items():
        if entry.get("cases") != declared_cases(root / name):
            raise ValueError("Removed or unclassified test case: " + name)
        if entry["lane"] == "alias":
            target = indexed.get(entry.get("alias_of"))
            if target is None or target["lane"] != "portable":
                raise ValueError("Alias requires an inventoried portable owner: " + name)
    return entries


def command(path, root=ROOT):
    path = Path(root) / path
    return [sys.executable, "-B", "-m", "unittest", "discover", "-s", str(path.parent), "-p", path.name, "-v"]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    # Host qualification and calibration own setup and immutable report paths.
    # Never launch those accidentally from the portable CI runner.
    parser.add_argument("--run", choices=["portable"])
    args = parser.parse_args(argv)
    entries = inventory()
    print("Inventory modules: " + json.dumps(dict(sorted(Counter(row["lane"] for row in entries).items()))), flush=True)
    print("Inventory cases: " + json.dumps({lane: sum(len(row["cases"]) for row in entries if row["lane"] == lane)
                                           for lane in sorted(LANES)}), flush=True)
    for row in entries:
        print(row["lane"] + " " + row["path"] + " — " + row["reason"], flush=True)
    if args.run is None:
        return 0
    selected = [row for row in entries if row["lane"] == args.run]
    if not selected:
        raise RuntimeError("Empty test selection: " + args.run)
    failed = []
    # Separate processes prevent same-named modules and sys.path side effects
    # from changing discovery or fixture ownership across feature folders.
    for row in selected:
        print("RUN " + row["path"], flush=True)
        try:
            result = subprocess.run(command(row["path"]), cwd=ROOT.parents[1],
                                    timeout=row.get("timeout_seconds", 600))
            if result.returncode:
                failed.append(row["path"])
        except subprocess.TimeoutExpired:
            failed.append(row["path"] + " (timeout)")
    print("Executed " + str(len(selected)) + " " + args.run + " modules; failed=" + repr(failed), flush=True)
    return int(bool(failed))


if __name__ == "__main__":
    raise SystemExit(main())
