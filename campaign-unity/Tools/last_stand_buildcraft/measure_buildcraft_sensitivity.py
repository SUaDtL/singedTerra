"""Bounded cost/damage sensitivity using disposable catalog copies and one earned seed."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import time

from measure_buildcraft_balance import sources, hashes, PROJECT, HERE, TOOLS
from last_stand_test_runtime import compile_csharp, run_csharp, CSC, MONO


def perturb_catalog(text, cost_percent, damage_percent):
    """Wrap public projections in a temporary copy; all retained editions bypass it."""
    for signature, renamed in (("public int RunPrice(int purchaseIndex)", "int OriginalRunPrice(int purchaseIndex)"),
                               ("public int PermanentPrice(int purchaseIndex)", "int OriginalPermanentPrice(int purchaseIndex)"),
                               ("public int EffectAt(int totalLevel, int rawHit)", "int OriginalEffectAt(int totalLevel, int rawHit)")):
        if text.count(signature) != 1:
            raise ValueError("Sensitivity target changed: " + signature)
        text = text.replace(signature, renamed)
    marker = "        int OriginalRunPrice(int purchaseIndex)"
    wrappers = f"""        int SensitivityPrice(int value) => EconomyVersion==LastStandUpgradeCatalog.EconomyVersion
            ? Math.Max(1,checked((int)(((long)value*{cost_percent}+50)/100))) : value;
        public int RunPrice(int purchaseIndex) => SensitivityPrice(OriginalRunPrice(purchaseIndex));
        public int PermanentPrice(int purchaseIndex) => SensitivityPrice(OriginalPermanentPrice(purchaseIndex));
        public int EffectAt(int totalLevel,int rawHit) {{
            int value=OriginalEffectAt(totalLevel,rawHit);
            bool damage=Id==LastStandUpgradeTrackId.CannonAttack||Id==LastStandUpgradeTrackId.LauncherAttack||
                Id==LastStandUpgradeTrackId.ScattergunAttack||Id==LastStandUpgradeTrackId.MortarAttack||
                Id==LastStandUpgradeTrackId.RailgunAttack||Id==LastStandUpgradeTrackId.ArcOutput;
            return EconomyVersion==LastStandUpgradeCatalog.EconomyVersion&&damage
                ? Math.Max(OriginalEffectAt(0,rawHit),checked((int)(((long)value*{damage_percent}+50)/100))) : value;
        }}
"""
    return text.replace(marker, wrappers + marker)


def measure(funding, output):
    bound = sources()
    bound = [p for p in bound if p.name != "BuildcraftBalanceMeasurements.cs"]
    bound += [HERE / "BuildcraftSensitivityMeasurements.cs"]
    inputs = bound + [Path(__file__), HERE / "measure_buildcraft_balance.py", TOOLS / "last_stand_source_closure.py", TOOLS / "last_stand_test_runtime.py"]
    before = hashes(inputs)
    funding_bytes = funding.read_bytes()
    seed = json.loads(funding_bytes.decode("utf-8-sig"))["seed"]
    if hashlib.sha256(seed["profileJson"].encode()).hexdigest() != seed["profileSha256"]:
        raise ValueError("Earned seed hash mismatch")
    catalog = next(p for p in bound if p.name == "LastStandUpgradeCatalog.cs")
    variants = []
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="st-buildcraft-sensitivity-") as folder:
        folder = Path(folder)
        seed_path = folder / "seed.json"
        seed_path.write_text(json.dumps({key: value for key, value in seed.items() if key != "profileJson"}), encoding="utf-8")
        profile_path = folder / "profile.json"
        profile_path.write_text(seed["profileJson"], encoding="utf-8")
        for cost, damage in ((100, 100), (95, 100), (105, 100), (100, 95), (100, 105)):
            changed = folder / "LastStandUpgradeCatalog.cs"
            changed.write_text(perturb_catalog(catalog.read_text(), cost, damage), encoding="utf-8")
            target = folder / "Sensitivity.exe"
            build = compile_csharp(target, [changed if p == catalog else p for p in bound], defines=("BUILDCRAFT_BALANCE",))
            result = run_csharp(target, [seed_path, profile_path], timeout_seconds=900)
            if result.returncode:
                raise RuntimeError(result.stdout + result.stderr)
            report = json.loads(result.stdout)
            if report["parentProfileSha256"] != seed["profileSha256"] or len(report["rows"]) != 18:
                raise ValueError("Sensitivity seed/cells drifted")
            for row in report["rows"]:
                if row["outcome"] == "unavailable":
                    continue
                if row["allocation"]["walletBefore"] != seed["wallet"] or row["earnedScrap"] != row["spentScrap"] + row["remainingScrap"]:
                    raise ValueError("Sensitivity accounting failed")
            variants.append({"costPercent": cost, "damagePercent": damage,
                             "temporaryCatalogSha256": hashlib.sha256(changed.read_bytes()).hexdigest(), **report})
            print(f"Measured sensitivity cost={cost}% damage={damage}%", flush=True)
    if before != hashes(inputs) or funding_bytes != funding.read_bytes():
        raise RuntimeError("Sensitivity inputs changed")
    output.write_text(json.dumps({"schema": 1, "sourceSha256": before,
        "toolSha256": {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)},
        "fundingSha256": hashlib.sha256(funding_bytes).hexdigest(), "executionSeconds": time.monotonic() - started,
        "variants": variants}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--funding", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    measure(args.funding, args.output)
