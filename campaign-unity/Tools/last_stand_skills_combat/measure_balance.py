"""Bounded, source-bound production combat comparison; never touches a saved profile."""
import argparse,json,sys,tempfile
from pathlib import Path
TOOLS=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp,run_csharp
from last_stand_provenance import PROVENANCE_INPUTS, SOURCE_LF_NORMALIZATION, lf_sha256, source_bindings
SCRIPTS=TOOLS.parent/"Unity/Assets/Scripts"
PROJECT=TOOLS.parents[1]
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--output",type=Path,required=True);args=parser.parse_args()
 sources=complete_sources(SCRIPTS,[SCRIPTS/"LastStandRunCheckpoint.cs",SCRIPTS/"LastStandSaveJson.cs"])+[Path(__file__).with_name("SkillBalanceMeasurements.cs")]
 with tempfile.TemporaryDirectory(prefix="st-skills-balance-") as folder:
  exe=Path(folder)/"SkillBalanceMeasurements.exe";compile_csharp(exe,sources)
  result=run_csharp(exe,[],timeout_seconds=180)
  if result.returncode:raise RuntimeError(result.stdout+result.stderr)
  report=json.loads(result.stdout)
 for row in report["rows"]:
  row["simulatedSeconds"]=row["simulatedMilliseconds"]/1000
  row["effectiveDamagePerSimulationSecond"]=row["effectiveDamage"]*20/max(1,row["ticks"])
 if len(report["rows"])!=18:raise ValueError("Incomplete comparison")
 for scenario in ("early-pressure","mid-pressure","deep-pressure","early-sustained","mid-sustained","deep-sustained"):
  rows=[r for r in report["rows"] if r["scenario"]==scenario]
  if {r["mode"] for r in rows}!={"none","active","passive"}:raise ValueError("Missing comparison mode")
  for key in ("tier","startingWave","permanentLevel","skillRank","fitting","researchRanks"):
   if any(r[key]!=rows[0][key] for r in rows):raise ValueError("Unequal comparison "+key)
  if not all(r["repeatProjectionUnchanged"] for r in rows):raise ValueError("Skill projection stacks")
 inputs=sources+[Path(__file__),TOOLS/"last_stand_source_closure.py",TOOLS/"last_stand_test_runtime.py"]
 report.update(source_bindings(inputs+list(PROVENANCE_INPUTS),PROJECT))
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8",newline="\n")
 for r in report["rows"]:print(r["scenario"],r["mode"],r["outcome"],"waves",r["wavesCleared"],"seconds",r["simulatedSeconds"],"damage",r["effectiveDamage"],"uses",len(r["uses"]))
if __name__=="__main__":main()
