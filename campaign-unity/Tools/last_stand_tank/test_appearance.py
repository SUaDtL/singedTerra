"""Actual profile authority and cosmetic value checks; no player storage access."""
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class AppearanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="st-appearance-")
        cls.exe = Path(cls.folder.name) / "AppearanceChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        sources = complete_sources(scripts, [scripts / "LastStandProgression.cs"])
        compile_csharp(cls.exe, [*sources, Path(__file__).with_name("AppearanceChecks.cs")])

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name, TOOLS])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_all_256_compositions_and_five_exact_legacy_paints(self): self.case("catalog")
    def test_value_is_immutable_and_rejects_unknown_ids(self): self.case("value")
    def test_fresh_profile_defaults_and_restart_preserves_applied_appearance(self): self.case("restart")
    def test_legacy_profiles_receive_default_without_changing_retained_rules(self): self.case("legacy")
    def test_v6_migration_preserves_all_other_profile_fields(self): self.case("v6")
    def test_new_schema_rejects_missing_extra_malformed_and_unknown_appearance(self): self.case("invalid")
    def test_future_schema_remains_protected(self): self.case("future")
    def test_cosmetics_leave_checkpoint_and_every_gameplay_field_unchanged(self): self.case("gameplay")
    def test_backup_preview_restore_and_predecessor_retain_appearance(self): self.case("backup")
    def test_old_backup_preview_defaults_without_rewriting_original_bytes(self): self.case("oldbackup")
    def test_failed_write_retains_confirmed_appearance_until_retry(self): self.case("retry")
    def test_ambiguous_write_reconciles_without_duplicate_write(self): self.case("ambiguous")
    def test_stale_revision_is_rejected_without_mutating_other_progress(self): self.case("revision")
    def test_external_raw_change_and_lost_ownership_refuse_apply(self): self.case("ownership")
    def test_unchanged_apply_checks_authority_without_extra_save(self): self.case("noop")
    def test_read_failure_preserves_confirmed_profile(self): self.case("read")
