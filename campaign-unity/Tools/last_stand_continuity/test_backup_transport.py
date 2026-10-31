"""Actual C# byte, file, callback and native predecessor adapters; no system picker claims."""
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_test_runtime import compile_csharp, run_csharp


class BackupTransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-backup-transport-build-")
        cls.exe = Path(cls.output.name) / "Checks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        compile_csharp(cls.exe, [scripts / "Platform/LastStandBackupTransport.cs",
            scripts / "Platform/LastStandFileStorage.cs", scripts / "LastStandStore.cs",
            scripts / "Platform/LastStandNativeStorageRoot.cs",
            Path(__file__).with_name("BackupTransportChecks.cs")], defines=("UNITY_STANDALONE",))

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        with tempfile.TemporaryDirectory(prefix="st-backup-transport-") as folder:
            result = run_csharp(self.exe, [name, folder])
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_bounded_strict_utf8_and_unseekable_stream(self): self.case("bounded")
    def test_canonical_base64_cannot_expand_past_document_limit(self): self.case("base64")
    def test_cancelled_duplicate_and_stale_callbacks(self): self.case("correlation")
    def test_single_request_and_disposed_receiver(self): self.case("cancel_dispose_busy")
    def test_invalid_callback_cannot_report_success(self): self.case("bad_reply")
    def test_selected_file_roundtrip_atomic_replacement_and_refusal(self): self.case("file_roundtrip")
    def test_durable_predecessor_is_separate_and_requires_live_ownership(self): self.case("predecessor_isolation")
    def test_native_fallback_is_exposed_to_recovery_owner(self): self.case("native_fallback")

    def test_actual_webgl_file_and_predecessor_adapters(self):
        result = subprocess.run(["node", "--test", str(Path(__file__).with_name("backup_browser.test.mjs"))],
            capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__": unittest.main()
