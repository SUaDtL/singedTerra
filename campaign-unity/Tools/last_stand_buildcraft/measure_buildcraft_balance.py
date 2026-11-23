"""Earned v5 production-model comparisons. This does not qualify a real-duration game session."""
import argparse
import hashlib
import itertools
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent
PROJECT = TOOLS.parent
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import CSC, MONO, compile_csharp


def sources():
    scripts = PROJECT / "Unity/Assets/Scripts"
    return complete_sources(scripts, [scripts / "Application/LastStandResearchCoordinator.cs"]) + [
        TOOLS / "last_stand_combat_depth/CombatBalanceMeasurements.cs",
        TOOLS / "last_stand_combat_depth/CombatBalanceChecks.cs", HERE / "BuildcraftBalanceMeasurements.cs"]


def hashes(paths):
    return {p.relative_to(PROJECT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


def validate_report(report):
    if report["schema"] != 1 or report["policy"] != "buildcraft-earned-pairs-v1" or report["rulesVersion"] not in ("last-stand-waves-v3", "last-stand-waves-v4") or report["economyVersion"] != "buildcraft-economy-v5":
        raise ValueError("Unknown measurement identity")
    seed = report["seed"]
    if hashlib.sha256(seed["profileJson"].encode()).hexdigest() != seed["profileSha256"]:
        raise ValueError("Earned seed bytes changed")
    profile = json.loads(seed["profileJson"])
    if report["rulesVersion"] == "last-stand-waves-v4" and profile.get("skills", {}).get("loadout") != []:
        raise ValueError("Buildcraft baseline requires a neutral skill loadout")
    if seed["grossSalvage"] != seed["wallet"] + seed["permanentSpent"] + seed["researchSpent"] or profile["credits"] != seed["wallet"]:
        raise ValueError("Seed investment is not earned")
    if sum(row["cost"] for row in report["researchPurchases"]) != seed["researchSpent"]:
        raise ValueError("Research costs omitted")
    fittings = ("repair", "launcher", "scattergun", "mortar", "railgun", "arc", "shield")
    builds = set(fittings) | {a + "+" + b for a, b in itertools.combinations(fittings, 2)}
    expected = set(itertools.product(range(1, 7), builds))
    seen = set()
    for row in report["matrix"]:
        key = (row["tier"], row["fitting"])
        if key not in expected or key in seen:
            raise ValueError("Missing, duplicate or foreign build comparison")
        seen.add(key)
        if row["parentProfileSha256"] != seed["profileSha256"]:
            raise ValueError("Comparison uses a different earned profile")
        available = profile["tierRecords"]["tier-" + str(row["tier"])]["unlocked"] and all(
            fitting in profile["unlockedFittings"] for fitting in row["fitting"].split("+")) and ("+" not in row["fitting"] or seed["equipmentBays"] == 2)
        if (row["outcome"] != "unavailable") != available:
            raise ValueError("Unavailable earned path was hidden or manufactured")
        if not available:
            continue
        if row["grossAtFork"] != seed["grossSalvage"] or row["speedHalfSteps"] != seed["maximumSpeed"] * 2:
            raise ValueError("Unequal investment or unearned speed")
        allocation = row["allocation"]
        if allocation["walletBefore"] != seed["wallet"] or allocation["commonBudget"] + allocation["auxiliaryBudget"] != seed["wallet"] or allocation["commonSpent"] > allocation["commonBudget"] or allocation["auxiliarySpent"] > allocation["auxiliaryBudget"] or allocation["walletAfter"] + allocation["commonSpent"] + allocation["auxiliarySpent"] != seed["wallet"]:
            raise ValueError("Unequal or unaccounted allocation")
        if row["earnedScrap"] != row["spentScrap"] + row["remainingScrap"] or row["salvageGross"] != row["repeatableSalvage"] + row["firstClearSalvage"] + row["researchBonusSalvage"]:
            raise ValueError("Run currency is not conserved")
        if row["purchaseIntents"] > row["purchaseOpportunities"] or row["purchaseOpportunities"] > row["activeMilliseconds"] // 900000:
            raise ValueError("Comparison exceeded its purchase cadence")
        if sum(effect["kills"] for effect in row["roleEffects"]["damageByWeaponAndEnemy"]) != row["kills"]:
            raise ValueError("Actual unique kills omitted or duplicated")
        if row["damage"] != sum(effect["effectiveDamage"] for effect in row["roleEffects"]["damageByWeaponAndEnemy"]):
            raise ValueError("Reported damage differs from actual events")
        rate = (row["repeatableSalvage"] + row["researchBonusSalvage"]) * 3600000 / max(1, row["activeMilliseconds"])
        if abs(row["salvagePerActiveHour"] - rate) > 1e-9:
            raise ValueError("First-clear income leaked into farming rate")
    if seen != expected:
        raise ValueError("Missing build comparison")
    # Recompute the frontier independently of the C# reporting code.
    frontier = set()
    universal = {name for name in builds if "+" in name}
    all_pairs = True
    for tier in range(1, 7):
        pairs = [row for row in report["matrix"] if row["tier"] == tier and "+" in row["fitting"] and row["outcome"] != "unavailable"]
        all_pairs &= len(pairs) == 21
        def scores(row):
            damage = sum(effect["effectiveDamage"] for effect in row["roleEffects"]["damageByWeaponAndEnemy"])
            return (row["highestClearedWave"], row["finalHull"], damage * 20 / max(1, row["ticks"]),
                    (row["repeatableSalvage"] + row["researchBonusSalvage"]) * 3600000 / max(1, row["activeMilliseconds"]))
        def dominates(a, b):
            x, y = scores(a), scores(b)
            return all(a + 1e-9 >= b for a, b in zip(x, y)) and any(a > b + 1e-9 for a, b in zip(x, y))
        for row in pairs:
            if not any(dominates(other, row) for other in pairs):
                frontier.add(row["fitting"])
        universal &= {row["fitting"] for row in pairs if all(other is row or dominates(row, other) for other in pairs)}
    observed = report["frontier"]
    if set(observed["distinctFrontierPairs"]) != frontier or set(observed["universalDominators"]) != universal or observed["allPairsEarned"] != all_pairs or observed["passes"] != (all_pairs and len(frontier) >= 3 and not universal):
        raise ValueError("Frontier conclusion differs from actual observations")


def measure(destination, quick=False):
    inputs = sources() + [Path(__file__), TOOLS / "last_stand_source_closure.py", TOOLS / "last_stand_test_runtime.py"]
    before = hashes(inputs)
    tool_hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)}
    head_before = subprocess.run(["git", "rev-parse", "HEAD"], cwd=PROJECT, capture_output=True, text=True, check=True).stdout.strip()
    destination.parent.mkdir(parents=True, exist_ok=True)
    progress = destination.with_suffix(".progress.log")
    funding = destination.with_suffix(".funding.json")
    destination.with_suffix(".inputs.json").write_text(json.dumps({"sourceSha256": before, "toolSha256": tool_hashes,
        "gitHeadBefore": head_before, "state": "capture-inputs-only-until-successful-completion"}, indent=2) + "\n", encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="st-buildcraft-balance-") as temp:
        target = Path(temp) / "BuildcraftBalance.exe"
        build = compile_csharp(target, sources(), defines=("BUILDCRAFT_BALANCE",))
        raw = Path(temp) / "report.json"
        started = time.monotonic()
        with raw.open("w", encoding="utf-8") as stdout, progress.open("w", encoding="utf-8") as stderr:
            run = subprocess.run([str(MONO), str(target), "quick" if quick else "full", str(funding.resolve())], stdout=stdout, stderr=stderr, timeout=3600)
        elapsed = time.monotonic() - started
        if run.returncode:
            raise RuntimeError(progress.read_text())
        report = json.loads(raw.read_text(encoding="utf-8-sig"))
        validate_report(report)
    if before != hashes(inputs) or tool_hashes != {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)}:
        raise RuntimeError("Measurement inputs changed; report refused")
    report.update(sourceSha256=before, toolSha256=tool_hashes, executionSeconds=elapsed, compileArgv=list(build.argv),
                  gitHeadBefore=head_before, sourceIdentityNote="Explicit digests bind the dirty candidate; HEAD alone does not identify measured code.")
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(destination), "seconds": elapsed, "frontier": report["frontier"], "bestWaves": report["seed"]["bestWaves"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    measure(args.output, args.quick)
