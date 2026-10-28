"""Compile the browser wave oracle's exact source list with its real host tools.

This belongs to the Mono-equipped architecture lane, not dependency-free scope
checks. Source-only output proves compile/binding behavior, not a player export.
"""
import hashlib
import itertools
import json
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / "campaign-unity/Unity/Assets/Scripts"


class WaveOracleTests(unittest.TestCase):
    def test_browser_oracle_compiles_its_complete_bound_source_list(self):
        script = """
import {buildWaveOracle,WAVE_ORACLE_SOURCES} from './e2e/helpers/lastStandWaveOracle.mjs';
const {binding}=buildWaveOracle(process.argv[1],{requireExport:false,maximumTicks:100});
console.log(JSON.stringify({sources:WAVE_ORACLE_SOURCES,binding}));
"""
        with tempfile.TemporaryDirectory(prefix="st-browser-wave-oracle-") as folder:
            result = subprocess.run(["node", "--input-type=module", "-e", script, folder],
                                    cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=120)
            evidence = Path(folder) / "wave-model-oracle"
            diagnostics = result.stdout + result.stderr
            for name in ("compile.stdout", "compile.stderr", "run.stdout", "run.stderr"):
                path = evidence / name
                if path.is_file() and result.returncode:
                    diagnostics += "\n" + name + ":\n" + path.read_text(encoding="utf-8-sig")
            self.assertEqual(result.returncode, 0, diagnostics)
            observed = json.loads(result.stdout)
            sources, binding = observed["sources"], observed["binding"]
            self.assertIn("LastStandRewardCatalog.cs", sources)
            self.assertIn("LastStandSelection.cs", sources)
            self.assertEqual(set(binding["source_lf_sha256"]), set(sources))
            for name in sources:
                path = SCRIPTS / name
                normalized = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
                self.assertEqual(binding["source_lf_sha256"][name], hashlib.sha256(normalized.encode()).hexdigest())
                self.assertIn(str(path).replace("\\", "/"), [value.replace("\\", "/")
                              for value in binding["commands"][0]["argv"]])
            self.assertEqual([command["exit"] for command in binding["commands"]], [0, 0])
            expected = {f"{tier}:{fitting}:{damage}" for tier, fitting, damage in
                        itertools.product((1, 2), ("repair", "launcher", "scattergun"), (20, 30, 40, 50))}
            self.assertEqual(set(binding["profiles"]), expected)
            self.assertEqual(binding["maximumTicks"], 100)
            self.assertIsNone(binding["export_binding"])
            self.assertEqual(binding["qualification"], "source-only; no player export qualification")


if __name__ == "__main__":
    unittest.main()
