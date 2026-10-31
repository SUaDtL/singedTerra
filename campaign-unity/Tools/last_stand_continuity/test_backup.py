"""Actual-source backup and restore transaction checks; no player profile access."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class BackupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="st-backup-")
        cls.exe = Path(cls.folder.name) / "BackupChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        sources = complete_sources(scripts, [scripts / "LastStandProgression.cs",
            scripts / "LastStandProgressionBackup.cs"])
        compile_csharp(cls.exe, [*sources, Path(__file__).with_name("BackupChecks.cs")])

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name, TOOLS / "last_stand_architecture/fixtures/profile-v5-wave30.json"])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_confirmed_profile_round_trip_preserves_retained_checkpoint(self):
        self.case("roundtrip")

    def test_preview_has_no_mutation_and_is_bound_to_owner(self):
        self.case("preview")

    def test_invalid_future_oversize_and_malformed_utf8_leave_profile_unchanged(self):
        self.case("invalid")

    def test_external_change_after_preview_is_rejected(self):
        self.case("conflict")

    def test_lost_ownership_never_writes(self):
        self.case("ownership")

    def test_predecessor_write_and_readback_are_required_before_replacement(self):
        self.case("predecessor")

    def test_ambiguous_write_reconciles_once_and_preserves_previous_save(self):
        self.case("ambiguous")

    def test_failed_write_exports_confirmed_profile_and_retries_same_restore(self):
        self.case("retry")

    def test_previous_backup_restores_through_same_explicit_transaction(self):
        self.case("previous")

    def test_restart_retains_restored_profile_and_predecessor(self):
        self.case("restart")

    def test_restored_research_clock_completes_once_without_duplicate_charge(self):
        self.case("research")

    def test_damaged_future_and_unreadable_destination_fail_closed(self):
        self.case("health")

    def test_successful_ordinary_save_does_not_erase_restore_predecessor(self):
        self.case("retention")

    def test_bounded_corrupt_destination_requires_preview_and_explicit_restore(self):
        self.case("repair")

    def test_corrupt_destination_uncertain_restore_retries_same_candidate(self):
        self.case("repair_retry")

    def test_corrupt_destination_conflict_and_oversize_refuse_replacement(self):
        self.case("repair_conflict")
