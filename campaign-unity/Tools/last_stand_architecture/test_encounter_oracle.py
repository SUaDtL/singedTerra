"""Exercise the browser's real historical compiler without native-window setup.

The Mono-equipped architecture lane discovers this test automatically. Keep the
compiler's owned evidence, including failures, for diagnosis on either host.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import unittest
import uuid


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / "campaign-unity/Unity/Assets/Scripts"
EVIDENCE = ROOT / "campaign-unity/Evidence/last-stand-playable-loop/t06"


class EncounterOracleTests(unittest.TestCase):
    def test_browser_encounter_oracle_compiles_complete_current_source_and_preserves_reference(self):
        prepared = subprocess.run(["node", "scripts/ci/prepareLastStandEvidence.mjs"], cwd=ROOT,
                                  capture_output=True, text=True, encoding="utf-8", timeout=30)
        self.assertEqual(prepared.returncode, 0, prepared.stdout + prepared.stderr)
        prior = set(EVIDENCE.glob("current-model-qualification-*"))
        output = EVIDENCE / ("encounter-oracle-regression-" + uuid.uuid4().hex)
        output.mkdir()
        script = """
import {buildEncounterOracle,encounterOraclePackage} from './e2e/helpers/lastStandJourney.mjs';
import {WAVE_ORACLE_SOURCES} from './e2e/helpers/lastStandWaveOracle.mjs';
import {gunzipSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const profiles=buildEncounterOracle(process.argv[1]);
const reference=encounterOraclePackage();
writeFileSync(join(process.argv[1],'reference.csv'),gunzipSync(Buffer.from(reference.gzip_base64,'base64')));
console.log(JSON.stringify({sources:WAVE_ORACLE_SOURCES,profiles:Object.keys(profiles),
  reference_sha256:reference.output_sha256,reference_sources:Object.keys(reference.source_lf_sha256)}));
"""
        argv = ["node", "--input-type=module", "-e", script, str(output)]
        result = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=300)
        (output / "caller.stdout.txt").write_text(result.stdout, encoding="utf-8")
        (output / "caller.stderr.txt").write_text(result.stderr, encoding="utf-8")
        qualifications = set(EVIDENCE.glob("current-model-qualification-*")) - prior
        (output / "caller.json").write_text(json.dumps({"argv": argv, "cwd": str(ROOT),
            "exit": result.returncode, "qualifications": sorted(map(str, qualifications))}, indent=2), encoding="utf-8")
        diagnostics = result.stdout + result.stderr + "\nRetained evidence: " + str(output)
        for directory in [output, *sorted(qualifications)]:
            for name in ("compile.stdout.txt", "compile.stderr.txt", "run.stdout.txt", "run.stderr.txt"):
                path = directory / "model-oracle" / name
                if result.returncode and path.is_file():
                    diagnostics += "\n" + str(path) + ":\n" + path.read_text(encoding="utf-8-sig")
        self.assertEqual(result.returncode, 0, diagnostics)
        observed = json.loads(result.stdout)
        sources = observed["sources"]
        self.assertEqual(len(sources), 16)
        self.assertEqual(len(observed["reference_sources"]), 2, "The immutable reference keeps its original provenance")
        self.assertEqual(len(observed["profiles"]), 8)
        self.assertEqual(len(qualifications), 1, "Current-source qualification must actually run")
        reference = (output / "reference.csv").read_bytes()
        self.assertEqual(hashlib.sha256(reference).hexdigest(), observed["reference_sha256"])
        canonical_reference = reference.removeprefix(b"\xef\xbb\xbf")
        expected = {name: hashlib.sha256((SCRIPTS / name).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
                    for name in sources}
        for directory in [output, *qualifications]:
            binding = json.loads((directory / "model-oracle/binding.json").read_text(encoding="utf-8"))
            self.assertTrue(binding["fresh_host_compilation"])
            self.assertEqual(binding["source_binding"]["source_lf_sha256"], expected)
            self.assertEqual([command["exit"] for command in binding["commands"]], [0, 0])
            compilation = [value.replace("\\", "/") for value in binding["commands"][0]["argv"]]
            for name in sources:
                self.assertIn(str(SCRIPTS / name).replace("\\", "/"), compilation)
            comparison = binding["comparison"]
            self.assertEqual((comparison["rows"], comparison["fields_per_row"]), (13904, 13))
            self.assertEqual(comparison["reference"]["raw_sha256"], observed["reference_sha256"])
            self.assertEqual(comparison["canonical_sha256"], hashlib.sha256(canonical_reference).hexdigest())
            raw = (directory / "model-oracle/actual-model.csv").read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), binding["output_sha256"])
            self.assertEqual(raw.removeprefix(b"\xef\xbb\xbf"), canonical_reference)
            self.assertEqual(len(raw.decode("utf-8-sig").splitlines()), 13904)
        admission = json.loads((next(iter(qualifications)) / "current-source-admission.json").read_text(encoding="utf-8"))
        self.assertEqual(admission["identity"]["sources"], expected,
                         "Export and cached qualification must bind the complete current compilation, not the old two-file subset")
        print("Retained actual encounter compiler evidence: " + str(output), flush=True)


if __name__ == "__main__":
    unittest.main()
