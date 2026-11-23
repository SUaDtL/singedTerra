"""Kill bounded mutations in temporary production-source copies; never edit Unity inputs."""
import argparse
import json
from pathlib import Path
import sys
import tempfile

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp
from last_stand_provenance import PROVENANCE_INPUTS, SOURCE_LF_NORMALIZATION, hash_files, lf_sha256, source_bindings, source_hashes

ROOT = TOOLS.parents[1]
SCRIPTS = TOOLS.parent / "Unity/Assets/Scripts"
HERE = Path(__file__).parent
MUTATIONS = (
    ("draw-without-debit", "progression", "LastStandProgressionSkills.cs", "draw",
     "next.SkillIntel-=LastStandSkillCatalog.DrawCost;", "next.SkillIntel-=0;", "fixed draw retry"),
    ("draw-resampled-on-confirmation", "progression", "LastStandProgressionSkills.cs", "draw",
     "return Commit(next,()=>LastSkillDraw=receipt);", "return Commit(next,()=>{if(choose!=null)choose(pool.Count);LastSkillDraw=receipt;});", "fixed draw retry"),
    ("spent-active-admitted", "combat", "EncounterSkills.cs", "activation",
     "Skills.Rank(id)>0&&!SkillUsed(id)?1:0;", "Skills.Rank(id)>0?1:0;", "spent repair denied"),
    ("unknown-spent-bits-admitted", "combat", "EncounterSkills.cs", "invalid",
     "||SpentMask<0||(SpentMask&~7)!=0", "||SpentMask<0", "unknown spent bits rejected"),
    ("unequipped-spent-skill-admitted", "combat", "EncounterSkills.cs", "invalid",
     "&&skills.Rank((LastStandSkillId)id)==0)", "&&skills.Rank((LastStandSkillId)id)<0)", "unequipped mine state rejected"),
    ("paid-upgrade-reprices-armed-mines", "combat", "EncounterModel.cs", "armed-boundary",
     "ApplyBuildcraftProjection(shop);", "ApplyBuildcraftProjection(shop);if(minefieldArmed)minefieldDamage=MineDamage(CurrentCannonDamage,Skills.Rank(LastStandSkillId.Minefield));",
     "paid attack improves weapon but cannot reprice armed mines"),
)


def production_sources(group):
    starts = [SCRIPTS / "LastStandProgression.cs"] if group == "progression" else [SCRIPTS / "LastStandRunCheckpoint.cs", SCRIPTS / "EncounterSkills.cs"]
    driver = TOOLS / "last_stand_skills/SkillProgressionChecks.cs" if group == "progression" else HERE / "SkillCombatChecks.cs"
    return complete_sources(SCRIPTS, starts) + [driver]


def hashes(paths):
    return source_hashes(paths, ROOT)


def prove(output):
    inputs = sorted(set(production_sources("combat") + production_sources("progression") + [Path(__file__), TOOLS / "last_stand_source_closure.py", TOOLS / "last_stand_test_runtime.py"] + list(PROVENANCE_INPUTS)))
    before = hashes(inputs)
    report = {"schema": 1, "scope": "Temporary production-source guard mutations; no runtime source/profile changes or native proof", "sourceSha256": before, "baselines": [], "mutations": []}
    with tempfile.TemporaryDirectory(prefix="st-skills-guard-proof-") as temp:
        folder = Path(temp)
        for group in ("progression", "combat"):
            exe = folder / (group + ".exe")
            compile_csharp(exe, production_sources(group))
            for case in sorted({m[3] for m in MUTATIONS if m[1] == group}):
                result = run_csharp(exe, [case], timeout_seconds=30)
                if result.returncode != 0 or result.stdout.strip() != "PASS " + case:
                    raise AssertionError("Unmodified baseline failed: " + result.stdout + result.stderr)
                report["baselines"].append({"group": group, "case": case, "exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr})
        for name, group, filename, case, old, new, expected in MUTATIONS:
            sources = production_sources(group)
            source = next(p for p in sources if p.name == filename)
            content = source.read_text(encoding="utf-8-sig")
            if content.count(old) != 1:
                raise AssertionError("Mutation anchor is not unique: " + name)
            copied = folder / name / filename
            copied.parent.mkdir()
            copied.write_text(content.replace(old, new, 1), encoding="utf-8", newline="\n")
            actual = [copied if p == source else p for p in sources]
            exe = copied.parent / "Mutant.exe"
            build = compile_csharp(exe, actual)
            result = run_csharp(exe, [case], timeout_seconds=30)
            if result.returncode == 0 or expected not in result.stderr or "PASS " + case in result.stdout:
                raise AssertionError("Mutation escaped expected behavioral detection: " + name + "\n" + result.stdout + result.stderr)
            report["mutations"].append({"name": name, "group": group, "case": case,
                "source": source.relative_to(ROOT).as_posix(), "originalSourceSha256": before[source.relative_to(ROOT).as_posix()],
                "mutantSourceSha256": hash_files([copied])[copied.resolve()],
                "originalSourceLfSha256": lf_sha256(source.read_bytes()), "mutantSourceLfSha256": lf_sha256(copied.read_bytes()), "replace": old, "with": new,
                "compileExit": build.returncode, "exit": result.returncode, "expectedAssertion": expected,
                "stdout": result.stdout, "stderr": result.stderr, "killed": True})
            print("KILLED " + name + " / " + expected)
    if hashes(inputs) != before:
        raise AssertionError("Production or test inputs changed during mutation proof")
    report["unchangedInputs"] = True
    report.update(source_bindings(inputs, ROOT))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prove(args.output)
