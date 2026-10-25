"""Actual Unity packets replay through both maintained language readers."""
import ast
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import unittest
import uuid

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS / "last_stand_ui"))
from unity_check_runner import ROOT, PROJECT, run_checks


class ObservationContractTests(unittest.TestCase):
    def test_actual_emitter_shared_contract_and_consumers(self):
        contract_path = TOOLS / "contracts/last-stand-observation-v1.json"
        contract = json.loads(contract_path.read_text(encoding="utf8"))
        output = ROOT / "campaign-unity/Evidence/architecture-foundations" / ("observations-" + uuid.uuid4().hex + ".json")
        output.parent.mkdir(parents=True, exist_ok=True)
        previous = os.environ.get("ST_LS_OBSERVATION_OUTPUT")
        os.environ["ST_LS_OBSERVATION_OUTPUT"] = str(output)
        try:
            code, log = run_checks("LastStandObservationContractChecks.Run", [contract_path, Path(__file__), TOOLS / "verify_last_stand_loop.py",
                ROOT / "e2e/helpers/lastStandJourney.mjs"])
        finally:
            if previous is None:
                os.environ.pop("ST_LS_OBSERVATION_OUTPUT", None)
            else:
                os.environ["ST_LS_OBSERVATION_OUTPUT"] = previous
        self.assertEqual(code, 0, log[-10000:])
        self.assertIn("ST_LS_OBSERVATION_CONTRACT_PASS", log)
        packets = json.loads(output.read_text(encoding="utf8"))["packets"]
        self.assertEqual(len(packets), 4)
        # Execute the maintained parser body without starting its browser server.
        source = ast.parse((TOOLS / "verify_last_stand_loop.py").read_text(encoding="utf8"))
        owner = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == "verify_shop_vertical")
        functions = [n for n in owner.body if isinstance(n, ast.FunctionDef) and n.name in ("require", "read_controls")]
        namespace = {"json": json, "math": math, "OBSERVATION_CONTRACT": contract}
        exec(compile(ast.Module(body=functions, type_ignores=[]), "<maintained observation reader>", "exec"), namespace)
        for raw in packets:
            admitted = namespace["read_controls"](raw)
            self.assertEqual(admitted["raw"], raw)
            broken = json.loads(raw[len(contract["tag"]):])
            broken["controls"][0]["width"] = "44"
            with self.assertRaisesRegex(AssertionError, "Malformed control field"):
                namespace["read_controls"](contract["tag"] + json.dumps(broken, separators=(",", ":")))
        script = """import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {readShopControlObservation}=await import(pathToFileURL(process.argv[1]).href);
for(const raw of JSON.parse(readFileSync(process.argv[2],'utf8')).packets){
  assert.equal(readShopControlObservation(raw).raw,raw);
  const packet=JSON.parse(raw.slice('ST_LS_HUD_LAYOUT '.length));packet.controls.pop();
  assert.throws(()=>readShopControlObservation('ST_LS_HUD_LAYOUT '+JSON.stringify(packet)));
}
console.log('PASS actual Unity packets admitted by JavaScript; omitted control rejected');"""
        result = subprocess.run(["node", "--input-type=module", "-e", script,
                                 str(ROOT / "e2e/helpers/lastStandJourney.mjs"), str(output)],
                                cwd=ROOT, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        print(result.stdout.strip())
