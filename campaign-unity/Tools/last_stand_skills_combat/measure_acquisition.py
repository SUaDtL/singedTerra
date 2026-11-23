"""Reproducible earned Skill Intel/copy/slot trajectory from a fresh profile."""
import argparse
import json
from pathlib import Path
import sys
import tempfile

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp
from last_stand_provenance import PROVENANCE_INPUTS, SOURCE_LF_NORMALIZATION, hash_bytes, lf_sha256, source_bindings, source_hashes

SCRIPTS = TOOLS.parent / "Unity/Assets/Scripts"
ROOT = TOOLS.parents[1]
IDS = ("overdrive", "emergencyRepairs", "minefield", "reinforcedHull", "ballistics", "reactiveLining")
UNLOCKS = (25, 100, 300, 25, 100, 300)
def sources():
    return complete_sources(SCRIPTS, [SCRIPTS / "Application/LastStandResearchCoordinator.cs"]) + [
        TOOLS / "last_stand_combat_depth/CombatBalanceMeasurements.cs",
        Path(__file__).with_name("SkillAcquisitionMeasurements.cs")]


def validate_report(report):
    if report["schema"] != 1 or report["policy"] != "skills-fresh-acquisition-v1" or report["rulesVersion"] != "last-stand-waves-v4":
        raise ValueError("Unexpected acquisition identity")
    profiles = []
    for prefix in ("origin", "final"):
        raw = report[prefix + "ProfileJson"]
        if hash_bytes([raw.encode()])[0] != report[prefix + "ProfileSha256"]:
            raise ValueError("Profile bytes changed")
        profiles.append(json.loads(raw))
    origin, final = profiles
    if origin["credits"] or any(origin["permanentLevels"].values()) or origin["skills"]["intel"] or any(origin["skills"]["copies"]) or origin["skills"]["loadout"] or origin["checkpoint"] or any(t["bestWave"] for t in origin["tierRecords"].values()):
        raise ValueError("Origin is not fresh")
    copies = [0] * 6
    state = report["drawSeed"]
    if state != 20261111:
        raise ValueError("Draw seed changed")
    earned = ticks = gross = 0
    best = 0
    checkpoints = {}
    draws_by_run = {}
    for draw in report["draws"]:
        draws_by_run.setdefault(draw["run"], []).append(draw)
    intel = 0
    for number, run in enumerate(report["runs"], 1):
        if run["run"] != number or run["tier"] != 1 or run["speedHalfSteps"] != 2 or run["bestWaveBefore"] != best:
            raise ValueError("Run origin/cadence changed")
        wave = run["highestClearedWave"]
        delta = wave // 100 + sum(best < milestone <= wave for milestone in (25, 50))
        if run["intelEarned"] != delta:
            raise ValueError("Intel does not match confirmed wave rewards")
        earned += delta
        intel += delta
        best = max(best, wave)
        ticks += run["ticks"]
        gross += run["salvageGross"]
        if run["earnedScrap"] != run["spentScrap"] + run["remainingScrap"] or run["salvageGross"] != run["repeatableSalvage"] + run["firstClearSalvage"] + run["researchBonusSalvage"] or run["researchBonusSalvage"]:
            raise ValueError("Run currency does not conserve")
        if gross != run["grossSalvageTotal"] or gross != run["walletAfterRun"] + run["permanentSpentTotal"]:
            raise ValueError("Permanent funding is not earned")
        for draw in draws_by_run.pop(number, []):
            pool = [key for key, unlock, count in zip(IDS, UNLOCKS, copies) if best >= unlock and count < 6]
            threshold = (2**32 - len(pool)) % len(pool)
            while True:
                state = (state * 1664525 + 1013904223) % 2**32
                if state >= threshold:
                    break
            selected = state % len(pool)
            if draw["bestWave"] != best or draw["pool"] != pool or draw["selectedIndex"] != selected or draw["skill"] != pool[selected] or draw["copiesBefore"] != copies or draw["intelBefore"] != intel or intel < 1:
                raise ValueError("Draw was not the disclosed eligible random outcome")
            copies[IDS.index(pool[selected])] += 1
            intel -= 1
            rank = 3 if copies[IDS.index(pool[selected])] >= 6 else 2 if copies[IDS.index(pool[selected])] >= 3 else 1
            if draw["copiesAfter"] != copies or draw["intelAfter"] != intel or draw["rank"] != rank:
                raise ValueError("Copy, rank, or Intel arithmetic changed")
        slots = 3 if best >= 500 else 2 if best >= 100 else 1 if best >= 25 else 0
        selected = "+".join(key for key in ("reinforcedHull", "ballistics", "reactiveLining") if copies[IDS.index(key)] > 0)
        selected = "+".join(selected.split("+")[:slots]) if slots else ""
        checkpoints[number] = {
            "bestWave": best, "skillIntel": intel, "copies": list(copies), "slots": slots,
            "eligiblePool": [key for key, unlock, count in zip(IDS, UNLOCKS, copies) if best >= unlock and count < 6],
            "selectedSkills": selected, "grossSalvage": gross, "wallet": run["walletAfterRun"],
            "permanentSpent": run["permanentSpentTotal"], "activeMilliseconds": ticks * 50,
        }
    if draws_by_run or report["earnedIntel"] != earned or report["ticks"] != ticks or ticks > report["limits"]["ticks"] or len(report["runs"]) > report["limits"]["runs"] or report["activeMilliseconds"] != ticks * 50 or report["researchSpent"] or report["closedMilliseconds"]:
        raise ValueError("Acquisition budget/time accounting changed")
    if final["skills"]["copies"] != copies or final["skills"]["intel"] != intel or final["tierRecords"]["tier-1"]["bestWave"] != best or final["checkpoint"]:
        raise ValueError("Final persisted collection differs")
    if [row["wave"] for row in report["milestones"]] != [25, 50, 100, 300, 500]:
        raise ValueError("Missing acquisition milestone")
    for row in report["milestones"]:
        observed = row["state"]
        slots = 3 if observed["bestWave"] >= 500 else 2 if observed["bestWave"] >= 100 else 1 if observed["bestWave"] >= 25 else 0
        if observed["slots"] != slots or (row["outcome"] == "earned") != (best >= row["wave"]):
            raise ValueError("Unreached milestone or slot was invented")
        expected = checkpoints[row["run"]] if row["outcome"] == "earned" else checkpoints[len(report["runs"])]
        if observed != expected or row["outcome"] == "earned" and observed["bestWave"] < row["wave"]:
            raise ValueError("Milestone state differs from earned transactions")
    if report["finalState"] != checkpoints[len(report["runs"])] or "+".join(final["skills"]["loadout"]) != report["finalState"]["selectedSkills"]:
        raise ValueError("Final equipment/collection differs")
    if report["finalState"]["grossSalvage"] != gross or report["finalState"]["wallet"] != final["credits"] or gross != final["credits"] + report["finalState"]["permanentSpent"]:
        raise ValueError("Final funding changed")


def measure(output, quick=False):
    inputs = sources() + [Path(__file__), TOOLS / "last_stand_source_closure.py", TOOLS / "last_stand_test_runtime.py"] + list(PROVENANCE_INPUTS)
    before = source_hashes(inputs, ROOT)
    with tempfile.TemporaryDirectory(prefix="st-skills-acquisition-") as folder:
        exe = Path(folder) / "Acquisition.exe"
        compile_csharp(exe, sources(), defines=("BUILDCRAFT_BALANCE",))
        result = run_csharp(exe, ["quick"] if quick else [], timeout_seconds=240)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        print(result.stderr, end="")
        report = json.loads(result.stdout)
    # The C# measurement emits exact profile strings, not a new crypto call.
    # Hash them in one approved Node batch and remove milestone transport bytes.
    milestones = [row for row in report["milestones"] if row["outcome"] == "earned"]
    raw_profiles = [report["originProfileJson"], report["finalProfileJson"]] + [row.pop("_profileJson") for row in milestones]
    digests = hash_bytes([raw.encode("utf-8") for raw in raw_profiles])
    report["originProfileSha256"], report["finalProfileSha256"] = digests[:2]
    for row, digest in zip(milestones, digests[2:]):
        row["profileSha256"] = digest
    validate_report(report)
    if before != source_hashes(inputs, ROOT):
        raise ValueError("Source changed while measuring")
    report.update(source_bindings(inputs, ROOT))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--quick", action="store_true")
    args = parser.parse_args()
    measure(args.output, args.quick)
