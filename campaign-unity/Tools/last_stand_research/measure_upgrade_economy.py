"""Compiled production model measurements; never a native or elapsed-time receipt."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import sys

DIRECTORY = Path(__file__).resolve().parent
PROJECT = DIRECTORY.parents[1]
sys.path.insert(0, str(DIRECTORY.parent / "last_stand_waves"))
from test_catalogs import execute, SCRIPTS
from test_wave_model import MODEL_SOURCES
from last_stand_source_closure import complete_sources


def measure(quick=False, trajectory=False):
    names = MODEL_SOURCES + ["LastStandEconomyCatalog.cs", "LastStandResearchCatalog.cs"]
    paths = complete_sources(SCRIPTS, [SCRIPTS / name for name in names]) + [DIRECTORY / "UpgradeEconomyMeasurements.cs", DIRECTORY / "EconomyHorizonMeasurements.cs", Path(__file__)]
    before = {str(p.relative_to(PROJECT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    raw = execute(DIRECTORY / "UpgradeEconomyMeasurements.cs", names, "trajectory" if trajectory else "quick" if quick else "all")
    rows = list(csv.DictReader(io.StringIO(raw)))
    for row in rows:
        for key in row:
            if key not in ("kind", "fitting", "policy"):
                row[key] = int(row[key])
        row["simulationHours"] = row["ticks"] / 20 / 3600
        row["projectedHoursAt5x"] = row["simulationHours"] / 5
        row["repeatableSalvagePerSimulationHour"] = row["repeatableSalvage"] / row["simulationHours"]
    horizon_output = execute(DIRECTORY / "EconomyHorizonMeasurements.cs", names, "horizons")
    horizons = [{key: value if key == "track" else int(value) for key, value in row.items()}
                for row in csv.DictReader(io.StringIO(horizon_output))]
    after = {str(p.relative_to(PROJECT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    if before != after:
        raise RuntimeError("Measured inputs changed during this observation. Repeat after integration settles.")
    return {
        "sourceSha256": before,
        "calibration": {
            "runEconomy": "research-farming-economy-v2",
            "baseScrap": "3 + floor((wave - 1) / 250) per enemy; Scrap Yield and completed Scrap Logistics multiply subsequent kill income.",
            "currentCannonGrowth": "20 + 10L + floor(max(L - 8, 0)^2 / 80). The legacy run retains /5.",
            "rationale": "The first candidate combined /5 attack growth with an income rise every 100 waves and reached the 2,000-wave probe bound from approximately 700 permanent Salvage. The /40 follow-up still reached 5,000 from 1,447. Slower income bands and gentler current Cannon growth preserve intermediate earned farming stages while maintaining a developed 5,000-wave target.",
            "permanentHorizons": horizons,
        },
        "method": "Compiled production C# combat and shop owners. Explicit rotating combat/income/mixed priorities save for their next investment; rewards are credited at admitted kills, purchases occur after kills. First-clear awards appear once on earned trajectories.",
        "limits": [
            "Matched and mature builds are gifted-profile probes, not earned progression claims. Only trajectory rows start from zero funds/levels.",
            "The spending policy is a benchmark, not a player auto-buy feature or a strategy optimizer. Purchase intents do not measure human actions after UI batching.",
            "5x duration is a deterministic simulation projection, not real-time browser performance or endurance.",
            "Research completion/funding timelines are excluded here; specified ranks are fixture inputs. Full shared-Salvage opportunity cost belongs to the combined research measurement.",
            "Two authored tiers only. Runs stop for the measurement at a declared wave bound; actual game runs do not stop there.",
        ],
        "measurements": rows,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--trajectory", action="store_true")
    parser.add_argument("--output", type=Path, default=PROJECT / "Evidence/research-planning/upgrade-economy-report.json")
    args = parser.parse_args()
    report = measure(args.quick,args.trajectory)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf8")
    print(json.dumps({"rows": len(report["measurements"]), "output": str(args.output)}))
