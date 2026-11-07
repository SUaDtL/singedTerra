"""Actual production owners, immutable historical inputs, and atomic fault cases."""
from pathlib import Path
import hashlib
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class RulesCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="st-rules-")
        cls.exe = Path(cls.temp.name) / "RulesChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        cls.sources = complete_sources(scripts, [scripts / "LastStandProgression.cs", scripts / "LastStandShopPresentation.cs"])
        cls.harness = Path(__file__).with_name("RulesCompatibilityChecks.cs")
        compile_csharp(cls.exe, cls.sources + [cls.harness], warnings_as_errors=True)
        cls.v5 = TOOLS / "last_stand_architecture/fixtures/profile-v5-wave30.json"
        cls.v4 = TOOLS / "last_stand_research/fixtures/legacy-v4.json"
        cls.snapshot = TOOLS / "last_stand_research/fixtures/legacy-v4.snapshot"
        cls.hashes = {
            cls.v5: "ec100d628dfc7e6fa4a17afa5c882615c11b31d36411adf068203fe201409888",
            cls.v4: "e1721668c02b117a32d3b6f64b3af6035d85f5192ca35922065d193697deee42",
            cls.snapshot: "955716a0b2ffca99be6312aabf3c8c73b399285c4ece478d1b82331459a7f978",
        }
        if cls.hashes != {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in cls.hashes}:
            raise AssertionError("Immutable historical compatibility input changed")

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name, self.v5, self.v4, self.snapshot], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)
        self.assertEqual(self.hashes, {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.hashes})

    def test_legacy_run_retains_complete_rules(self): self.case("legacy")
    def test_atomic_profile_migration_and_unlock_backfill(self): self.case("migration")
    def test_unknown_version_preserves_bytes(self): self.case("future")
    def test_unavailable_content_remains_neutral_and_rejected(self):
        exe = self.unavailable_variant("unavailable")
        result = run_csharp(exe, ["reserved"], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
    def test_paid_legacy_prices_and_fractional_income_survive(self): self.case("paid")
    def test_failed_legacy_migration_keeps_neutral_read_projection(self): self.case("blocked-view")
    def test_commit_refuses_a_different_valid_model_edition(self): self.case("commit-edition")

    def variant(self, label, edits):
        folder = Path(self.temp.name) / label
        folder.mkdir()
        inputs = list(self.sources)
        for filename, replacements in edits.items():
            original = next(p for p in inputs if p.name == filename)
            source = original.read_text(encoding="utf-8-sig")
            for before, after in replacements:
                self.assertEqual(source.count(before), 1, "Fault/activation seam moved: " + before)
                source = source.replace(before, after)
            copy = folder / filename
            copy.write_text(source, encoding="utf-8")
            inputs[inputs.index(original)] = copy
        exe = folder / "RulesChecks.exe"
        compile_csharp(exe, inputs + [self.harness], warnings_as_errors=True)
        return exe

    def test_unlock_backfill_waits_for_actual_available_definitions(self):
        # The real catalog enables both arms and tiers. The isolated unavailable
        # catalog retains the negative: no unlock appears before definitions exist.
        self.case("migration-enabled")
        disabled = self.unavailable_variant("disabled-backfill")
        result = run_csharp(disabled, ["migration-disabled", self.v5], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def unavailable_variant(self, label):
        return self.variant(label, {
            "LastStandTierCatalog.cs": [(",1,1,2,300,true,LastStandEnemyCatalog.Cinder)", ",1,1,2,300,false,LastStandEnemyCatalog.Cinder)"),
                                        (",1,1,3,300,true,LastStandEnemyCatalog.Foundry)", ",1,1,3,300,false,LastStandEnemyCatalog.Foundry)")],
            "LastStandSelection.cs": [(",1,500,true)", ",1,500,false)"),
                                      (",2,100,true)", ",2,100,false)")],
            "LastStandUpgradeCatalog.cs": [("LastStandUpgradeApplicability.Mortar,version)", "LastStandUpgradeApplicability.Mortar,version,false)"),
                                            ("LastStandUpgradeApplicability.Railgun,version)", "LastStandUpgradeApplicability.Railgun,version,false)")],
        })

    def test_migration_oracle_rejects_research_history_reset(self):
        exe = self.variant("reset", {"LastStandProgression.cs": [
            ("if(next.Research==null)InitializeResearch(next);", "InitializeResearch(next);")]})
        result = run_csharp(exe, ["migration", self.v5], timeout_seconds=120)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Preserved research", result.stderr)
