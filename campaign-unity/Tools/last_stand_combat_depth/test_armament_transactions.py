"""Actual armament purchase owners and strict edition-specific durable checkpoints."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class ArmamentTransactionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="st-armament-transactions-")
        cls.exe = Path(cls.temp.name) / "ArmamentTransactionChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        cls.sources = complete_sources(scripts, [scripts / "LastStandProgression.cs", scripts / "LastStandShopPresentation.cs"])
        compile_csharp(cls.exe, cls.sources + [Path(__file__).with_name("ArmamentTransactionChecks.cs")], warnings_as_errors=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_new_fitting_quote_and_failed_save_atomicity(self): self.case("permanent")
    def test_locked_and_inapplicable_new_permanent_tracks_cannot_charge(self): self.case("locked")
    def test_new_weapon_run_bulk_stale_cap_and_wrong_fitting(self): self.case("run")
    def test_paid_new_weapon_checkpoint_close_reopen_is_exact(self): self.case("checkpoint")
    def test_new_weapon_paid_projection_cannot_be_forged(self): self.case("projection")
    def test_new_weapon_schema_requires_exact_fields_and_retains_old_shape(self): self.case("schema")
    def test_new_weapon_cards_match_purchase_admission(self): self.case("presentation")
    def test_new_weapon_boundary_failure_preserves_paid_state_on_retry(self): self.case("boundary-faults")
