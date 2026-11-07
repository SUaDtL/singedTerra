"""Actual enemy/readmodel owners; synthetic roster probes are not earned play."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import CSC, MONO, compile_csharp, run_csharp


class EnemyInformationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="st-enemy-information-")
        cls.exe = Path(cls.temp.name) / "EnemyInformationChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        cls.build = compile_csharp(cls.exe, complete_sources(scripts, [
            scripts / "EncounterModel.cs", scripts / "LastStandWaveInformation.cs"
        ]) + [Path(__file__).with_name("EnemyInformationChecks.cs")], warnings_as_errors=True)
        print("SOURCE_BINDING " + json.dumps({
            "sources": cls.build.source_sha256,
            "tools": {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)},
        }, sort_keys=True), flush=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_per_type_wave_information_matches_actual_spawned_cohorts(self): self.case("roster")
    def test_retained_wave_information_preserves_exact_combat_values(self): self.case("retained")
    def test_per_type_rewards_match_actual_kills_and_shared_fractional_carry(self): self.case("rewards")
    def test_rejects_mismatched_economy_without_state_mutation(self): self.case("identity-economy")
    def test_rejects_mismatched_rules_and_content_without_state_mutation(self): self.case("identity-edition")
    def test_rejects_mismatched_tier_without_state_mutation(self): self.case("identity-tier")
    def test_rejects_mismatched_fitting_without_state_mutation(self): self.case("identity-fitting")


if __name__ == "__main__":
    unittest.main()
