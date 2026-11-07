"""Source-bound bulk purchase cadence probes; excludes UI and storage latency."""
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


def measure():
    names = MODEL_SOURCES + ["LastStandResearchCatalog.cs"]
    sources = complete_sources(SCRIPTS, [SCRIPTS / name for name in names])
    sources += [DIRECTORY / "PeriodicBulkMeasurements.cs", Path(__file__)]
    hashes = lambda: {str(path.relative_to(PROJECT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sources}
    before = hashes()
    raw = execute(DIRECTORY / "PeriodicBulkMeasurements.cs", names, "all")
    rows = list(csv.DictReader(io.StringIO(raw)))
    for row in rows:
        for key in row:
            if key not in ("fitting", "quantity", "status"):
                row[key] = int(row[key])
        hours = row["ticks"] / 20 / 3600 / 5
        row["projectedHoursAt5x"] = hours
        row["acceptedPurchaseIntentsPerHourAt5x"] = row["acceptedPurchaseIntents"] / hours
        row["minimumShopOpenBuyCloseGestures"] = row["acceptedPurchaseIntents"] * 3
        row["repeatableSalvagePerProjectedHourAt5x"] = row["repeatableSalvage"] / hours
    if hashes() != before:
        raise RuntimeError("Measured sources changed during the observation.")
    return {"sourceSha256": before,
            "build": "Tier1, permanent500 clamped per track, GameSpeed8 at constant5x, SalvageRecovery25, ScrapLogistics25. Gifted development build, not an earned timeline.",
            "policy": "At each real interval, attempt ONE bulk purchase in rotating Cannon/Hull/Yield/Cannon/Cycle/fitted auxiliary/Armor order. Skip capped tracks; save for an unaffordable next track. QuantityMax spends every affordable rank on that track. Interval0 is a no-purchases control.",
            "limits": ["Simulation projection only. No rendering, storage, pause, menu or human scheduling overhead.",
                       "Purchase intents are not all user gestures. Opening the shop, choosing a track and closing it typically costs at least3 gestures; quantity/focus changes may add more.",
                       "An ideal after-every-kill purchase policy is a different baseline. Bulk cadence does not inherit its outcome or duration claim."],
            "measurements": rows}


if __name__ == "__main__":
    result = measure()
    destination = PROJECT / "Evidence/research-planning/periodic-bulk-report.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps({"rows": len(result["measurements"]), "report": str(destination)}))
