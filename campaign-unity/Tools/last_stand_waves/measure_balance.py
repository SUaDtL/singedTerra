"""Source-bound accelerated numerical measurements, never browser endurance proof."""
import csv
from datetime import datetime, timezone
import hashlib
import html
import io
import json
from pathlib import Path
from test_catalogs import execute, SCRIPTS
from test_wave_model import MODEL_SOURCES
from last_stand_source_closure import complete_sources

DIRECTORY = Path(__file__).resolve().parent
PROJECT = DIRECTORY.parents[1]


def measure():
    sources = complete_sources(SCRIPTS, [SCRIPTS / name for name in MODEL_SOURCES]) + [DIRECTORY / "BalanceMeasurements.cs", Path(__file__)]
    before = {str(path.relative_to(PROJECT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sources}
    output = execute(DIRECTORY / "BalanceMeasurements.cs", MODEL_SOURCES, "all")
    after = {str(path.relative_to(PROJECT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sources}
    if after != before:
        raise RuntimeError("Measured sources changed during execution; repeat after sources are stable.")
    rows = list(csv.DictReader(io.StringIO(output)))
    for row in rows:
        for key in row:
            if key not in ("kind", "fitting", "status"):
                row[key] = int(row[key])
        row["hoursAt1x"] = row["ticks"] / 20 / 3600
        row["hoursAtHalfSpeed"] = row["hoursAt1x"] * 2
        row["futureHoursAt5x"] = row["hoursAt1x"] / 5
        row["repeatableSalvagePerMinute"] = row["repeatableSalvage"] / (row["ticks"] / 20 / 60)
        row["intermissionTicks"] = max(0, row["completed"] - (row["status"] == "Running")) * 10
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "method": "Compiled production C# deterministic simulation. Buy cheapest eligible run track after each kill; ties prefer cannon, hull, cadence, armor, then fitting. Permanent progression spends only banked rewards on cheapest eligible permanent tracks between runs.",
        "limits": [
            "Accelerated numerical simulation is not a real elapsed 10-12 hour browser endurance observation.",
            "Build rows gift the declared permanent levels, clamped per track. Earned-trajectory rows start with zero investment and award first-clear milestones once across runs.",
            "Each measurement stops at defeat or wave 5001; the game does not stop or promote there.",
            "Scattergun rows assume it is unlocked for a matched fitting comparison; live unlock remains Tier 1 wave 100.",
            "Tier 10 is an explicit synthetic stress fixture, not balanced or shipped content. Only two real tiers ship; 5x projections assume completed speed research.",
            "Ticks include intermissions; storage, rendering, scheduling, human interaction and paused time add wall time. No unavailable measurements are represented as zero.",
            "The purchase policy is a deterministic benchmark, not a strategy optimizer or an implemented auto-purchase feature.",
        ],
        "sourceSha256": before,
        "measurements": rows,
    }


def save_report(report, destination=None):
    destination = destination or PROJECT / "Evidence/waves-planning"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "balance-report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    body = ["<!doctype html><meta charset='utf-8'><title>Last Stand wave balance measurements</title>",
            "<style>body{font:16px system-ui;max-width:1500px;margin:2rem auto;padding:0 1rem;color:#e9e1cd;background:#20251f}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:.5rem;border-bottom:1px solid #69705f;text-align:right}th{position:sticky;top:0;background:#30362c}td:nth-child(1),td:nth-child(3){text-align:left}p,li{max-width:1000px;line-height:1.5}a{color:#efce83}</style>",
            "<h1>Last Stand: wave and economy measurements</h1>",
            "<p>" + html.escape(report["method"]) + "</p>",
            "<p>Generated " + html.escape(report["generatedAt"]) + ". <a href='balance-report.json'>Source hashes and exact data</a>.</p><ul>",
            *["<li>" + html.escape(item) + "</li>" for item in report["limits"]], "</ul>",
            "<table><thead><tr><th>Case</th><th>Tier</th><th>Fitting</th><th>Perm level / run</th><th>Cleared</th><th>1x hours</th><th>0.5x hours</th><th>Future 5x hours</th><th>Repeat Salvage/min</th><th>Run levels bought</th><th>Permanent investment</th></tr></thead><tbody>"]
    for row in report["measurements"]:
        values = [row["kind"], row["tier"], row["fitting"], row["iteration"] if row["kind"] == "earned-trajectory" else row["permanentLevel"], row["completed"],
                  f'{row["hoursAt1x"]:.2f}', f'{row["hoursAtHalfSpeed"]:.2f}', f'{row["futureHoursAt5x"]:.2f}', f'{row["repeatableSalvagePerMinute"]:.2f}', row["runLevels"], row["permanentInvestment"]]
        body.append("<tr>" + "".join("<td>" + html.escape(str(value)) + "</td>" for value in values) + "</tr>")
    body.append("</tbody></table>")
    (destination / "balance-report.html").write_text("\n".join(body), encoding="utf8")


if __name__ == "__main__":
    result = measure()
    save_report(result)
    print(json.dumps({"measurements": len(result["measurements"]), "report": str(PROJECT / "Evidence/waves-planning/balance-report.html")}, indent=2))
