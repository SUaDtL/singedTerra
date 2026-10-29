"""Compile actual preference/storage sources and exercise isolated persistence.

Run: C:/Python314/python.exe -B -m unittest discover -s campaign-unity/Tools/last_stand_controls -p test_preferences.py -v
No Unity Editor process is started. These checks do not qualify browser storage.
"""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp

PROJECT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
SOURCE_NAMES = ("LastStandStore.cs", "LastStandPreferences.cs", "LastStandPreferencesStore.cs")


def compile_checks(executable, overrides=None):
    overrides = overrides or {}
    sources = [overrides.get(name, SCRIPTS / name) for name in SOURCE_NAMES]
    sources.append(Path(__file__).with_name("PreferencesChecks.cs"))
    return compile_csharp(executable, sources, warnings_as_errors=True, timeout_seconds=60, defines=('UNITY_EDITOR',))


class PreferencesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-preferences-")
        cls.executable = Path(cls.output.name) / "PreferencesChecks.exe"
        result = compile_checks(cls.executable)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Actual-source C# compilation failed (not behavioral RED):\n" +
                                 result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = run_csharp(self.executable, [name], timeout_seconds=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_defaults_and_immutable_copy(self):
        self.case("defaults_and_immutable_copy")

    def test_roundtrip_all_preferences(self):
        self.case("roundtrip_all_preferences")

    def test_strict_types_bounds_and_versions(self):
        self.case("strict_types_bounds_and_versions")

    def test_denied_write_applies_session_and_retry(self):
        self.case("denied_write_applies_session_and_retry")

    def test_uncertain_write_and_later_edits(self):
        self.case("uncertain_write_and_later_edits")

    def test_protected_records_need_confirmed_reset(self):
        self.case("protected_records_need_confirmed_reset")

    def test_cross_tab_conflict_does_not_overwrite(self):
        self.case("cross_tab_conflict_does_not_overwrite")

    def test_read_failure_cannot_overwrite_unseen_settings(self):
        self.case("read_failure_cannot_overwrite_unseen_settings")

    def test_readback_mismatch_is_not_saved(self):
        self.case("readback_mismatch_is_not_saved")

    def test_store_isolates_gameplay_key(self):
        self.case("store_isolates_gameplay_key")

    def assert_fault_detected(self, source_name, before, after, case, expected_assertion):
        """Mutate only a disposable copy; compile errors never establish detection."""
        source_path = SCRIPTS / source_name
        original_bytes = source_path.read_bytes()
        original = original_bytes.decode("utf-8-sig").replace("\r\n", "\n")
        self.assertEqual(original.count(before), 1, "Fault fixture anchor changed; review the fixture")
        with tempfile.TemporaryDirectory(prefix="st-preferences-fault-") as folder:
            mutant = Path(folder) / source_name
            mutant.write_text(original.replace(before, after, 1), encoding="utf-8")
            executable = Path(folder) / "PreferencesFault.exe"
            result = compile_checks(executable, {source_name: mutant})
            self.assertEqual(result.returncode, 0, "Fault fixture must compile:\n" + result.stdout + result.stderr)
            result = run_csharp(executable, [case], timeout_seconds=30)
            self.assertNotEqual(result.returncode, 0, "Fault escaped behavioral detection: " + case)
            self.assertIn(expected_assertion, result.stderr, result.stdout + result.stderr)
            self.assertNotIn("PASS " + case, result.stdout)
        self.assertEqual(source_path.read_bytes(), original_bytes, "Production source changed during fault check")

    def test_fault_gameplay_key_write_is_detected(self):
        self.assert_fault_detected("LastStandPreferencesStore.cs",
            "UnityEngine.PlayerPrefs.SetString(LastStandPreferences.StorageKey, value);",
            "UnityEngine.PlayerPrefs.SetString(LastStandProgression.StorageKey, value);",
            "store_isolates_gameplay_key", "preference adapter touched gameplay key")

    def test_fault_protected_record_overwrite_is_detected(self):
        self.assert_fault_detected("LastStandPreferences.cs",
            "private bool Persist()\n        {\n            if (RequiresReset) return false;",
            "private bool Persist()\n        {\n            if (RequiresReset) { basis = storage.Read(); basisKnown = true; RequiresReset = false; }",
            "protected_records_need_confirmed_reset", "protected preference record was overwritten")

    def test_fault_external_record_overwrite_is_detected(self):
        self.assert_fault_detected("LastStandPreferences.cs",
            "basisKnown ? observed != basis : observed != null",
            "basisKnown ? false : observed != null",
            "cross_tab_conflict_does_not_overwrite", "external preference record was overwritten")
