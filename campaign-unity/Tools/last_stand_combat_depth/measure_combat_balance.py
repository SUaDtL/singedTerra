"""Source-bound v4 model measurement; no renderer, device or real-duration claim."""
import argparse
import hashlib
import json
import itertools
from pathlib import Path
import sys
import tempfile
import time
import subprocess

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent
PROJECT = TOOLS.parent
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import CSC, MONO, compile_csharp, run_csharp


def sources():
    scripts = PROJECT / "Unity/Assets/Scripts"
    return complete_sources(scripts, [scripts / "Application/LastStandResearchCoordinator.cs"]) + [
        HERE / "CombatBalanceMeasurements.cs", HERE / "CombatBalanceChecks.cs"]


def hashes(paths):
    return {str(p.relative_to(PROJECT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


def validate_report(report):
    """Independent report-boundary checks; never substitutes seeded values for earned rows."""
    expected = set(itertools.product((0, 100, 1000, 10000, 100000, 1000000), range(1, 5),
                                    ("repair", "launcher", "scattergun", "mortar", "railgun"),
                                    ("none", "max900", "afterKill"), range(1, 11)))
    seeds = {s["threshold"]: s for s in report["seeds"] if "profileJson" in s}
    for seed in seeds.values():
        raw = seed["profileJson"].encode("utf-8")
        if hashlib.sha256(raw).hexdigest() != seed["profileSha256"] or len(raw) != seed["profileBytesUtf8"]:
            raise ValueError("Earned profile bytes do not match identity")
        if seed["cumulativeEarnedSalvage"] != seed["wallet"] + seed["permanentSpent"] + seed["researchSpent"]:
            raise ValueError("Seed investment is not funded")
    seen = set()
    for row in report["matrix"]:
        key = tuple(row[k] for k in ("budgetThreshold", "tier", "fitting", "policy", "speedHalfSteps"))
        if key not in expected or key in seen:
            raise ValueError("Foreign/duplicate matrix cell")
        seen.add(key)
        if set(row["checkpoints"]) != {"1", "100", "300", "500", "2000", "5000"}:
            raise ValueError("Missing required wave outcome")
        seed = seeds.get(row["budgetThreshold"])
        if seed:
            if row.get("parentProfileSha256") != seed["profileSha256"] or row.get("cumulativeEarnedSalvageAtFork") != seed["cumulativeEarnedSalvage"]:
                raise ValueError("Comparison does not bind the same earned profile")
        elif row["outcome"] != "unavailable":
            raise ValueError("No earned profile exists for observed comparison")
        if row["outcome"] != "unavailable":
            if row["earnedScrap"] != row["spentScrap"] + row["remainingScrap"]:
                raise ValueError("Run Scrap is not conserved")
            if row["salvageGross"] != row["repeatableSalvage"] + row["researchBonusSalvage"] + row["firstClearSalvage"]:
                raise ValueError("First-clear/repeatable Salvage double counted")
            if row["policy"] == "none" and row["purchaseIntents"] != 0:
                raise ValueError("No-purchase control bought upgrades")
            if row["policy"] == "max900" and not (row["purchaseIntents"] <= row["purchaseOpportunities"] <= row["activeMilliseconds"] // 900000):
                raise ValueError("Max cadence used extra purchase opportunities")
            if row["speedHalfSteps"] > seed["maximumSpeedHalfSteps"]:
                raise ValueError("Comparison speed was not earned at admission")
    if seen != expected:
        raise ValueError("Matrix omitted required comparison cells")
    if report["policyId"] == "v4-expanded-2":
        triggers = set()
        for cohort in report["unlockCohorts"]:
            if cohort["trigger"] in triggers:
                raise ValueError("Duplicate unlock cohort")
            triggers.add(cohort["trigger"])
            seed = cohort["seed"]
            if hashlib.sha256(seed["profileJson"].encode()).hexdigest() != seed["profileSha256"]:
                raise ValueError("Unlock cohort lacks its exact earned bytes")
            if seed["cumulativeEarnedSalvage"] != seed["wallet"] + seed["permanentSpent"] + seed["researchSpent"]:
                raise ValueError("Unlock cohort has unearned currency")
            for key, policy in (("comparisons", "max900"), ("supplementalComparisons", "none")):
                keys = [(r["tier"], r["fitting"]) for r in cohort[key]]
                if len(keys) != 20 or set(keys) != set(itertools.product(range(1, 5), ("repair", "launcher", "scattergun", "mortar", "railgun"))):
                    raise ValueError("Unlock cohort omits a fitting/tier comparison")
                for row in cohort[key]:
                    if row["parentProfileSha256"] != seed["profileSha256"] or row["cumulativeEarnedSalvageAtFork"] != seed["cumulativeEarnedSalvage"]:
                        raise ValueError("Unlock comparison has foreign investment")
                    if row["policy"] != policy or row["speedHalfSteps"] != 2:
                        raise ValueError("Unlock policy was changed")
                    if row["outcome"] == "unavailable":
                        continue
                    if row["earnedScrap"] != row["spentScrap"] + row["remainingScrap"] or row["salvageGross"] != row["repeatableSalvage"] + row["researchBonusSalvage"] + row["firstClearSalvage"]:
                        raise ValueError("Unlock run currency is not conserved")
                    if policy == "none":
                        a = row["oneTimeAllocation"]
                        if a["commonBudget"] + a["auxiliaryBudget"] != a["walletBefore"] or a["commonSpent"] > a["commonBudget"] or a["auxiliarySpent"] > a["auxiliaryBudget"] or a["walletBefore"] != a["walletAfter"] + a["commonSpent"] + a["auxiliarySpent"] or row["purchaseIntents"]:
                            raise ValueError("Supplemental policy silently changes the allocation")
                    elif row["purchaseIntents"] > row["activeMilliseconds"] // 900000:
                        raise ValueError("Unlock run exceeds Max cadence")
                    if sum(effect["kills"] for effect in row["roleEffects"]["damageByWeaponAndEnemy"]) != row["kills"]:
                        raise ValueError("Role attribution duplicates or omits actual kills")
        if "final-earned" not in triggers:
            raise ValueError("Final earned state is omitted")


def measure(destination):
    inputs = sources() + [Path(__file__), TOOLS / "last_stand_source_closure.py", TOOLS / "last_stand_test_runtime.py"]
    before = hashes(inputs)
    head_before = subprocess.run(["git", "rev-parse", "HEAD"], cwd=PROJECT, capture_output=True, text=True, check=True).stdout.strip()
    tool_hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)}
    with tempfile.TemporaryDirectory(prefix="st-combat-balance-") as temp:
        target = Path(temp) / "CombatBalance.exe"
        build = compile_csharp(target, sources(), warnings_as_errors=True)
        started = time.monotonic()
        result = run_csharp(target, timeout_seconds=1800)
        elapsed = time.monotonic() - started
        if result.returncode:
            raise RuntimeError(result.stderr)
        report = json.loads(result.stdout)
        validate_report(report)
    if before != hashes(inputs) or tool_hashes != {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)}:
        raise RuntimeError("Measurement source/toolchain changed; refusing report")
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=PROJECT, capture_output=True, text=True, check=True).stdout.strip()
    report.update(sourceSha256=before, toolSha256=tool_hashes, executionSeconds=elapsed,
                  compileArgv=list(build.argv), command=[sys.executable, *sys.orig_argv[1:]],
                  cwd=str(Path.cwd()), gitHeadBefore=head_before, gitHeadAfter=head, sourceIdentityNote="The explicit input digests identify the dirty candidate; HEAD alone is not the measured source.")
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(destination), "executionSeconds": elapsed, "sourceFiles": len(before)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=PROJECT / "docs/last-stand-combat-depth/combat-balance-calibrated-report.json")
    measure(parser.parse_args().output)
