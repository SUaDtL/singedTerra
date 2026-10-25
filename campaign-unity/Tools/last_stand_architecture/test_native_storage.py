"""Actual file-backed C# adapter, including independent-process reopen and faults."""
from pathlib import Path
from contextlib import contextmanager
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import zlib

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_test_runtime import MONO, compile_csharp, run_csharp
from last_stand_source_closure import complete_sources

SCRIPTS = TOOLS.parent / "Unity/Assets/Scripts"


class NativeStorageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build = tempfile.TemporaryDirectory(prefix="st-native-storage-build-")
        cls.exe = Path(cls.build.name) / "NativeStorageChecks.exe"
        cls.inputs = complete_sources(SCRIPTS, [SCRIPTS / "LastStandProgression.cs", SCRIPTS / "LastStandPreferences.cs",
            SCRIPTS / "Platform/LastStandFileStorage.cs",
            Path(__file__).with_name("NativeStorageChecks.cs")])
        compile_csharp(cls.exe, cls.inputs)

    @classmethod
    def tearDownClass(cls):
        cls.build.cleanup()

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="st-native-storage-")
        self.root = Path(self.folder.name)
        self.key = "singedTerra.lastStand.prototype.v1"

    def tearDown(self):
        self.folder.cleanup()

    def call(self, mode, *values, key=None, success=True):
        result = run_csharp(self.exe, [mode, self.root, key or self.key, *values], timeout_seconds=10)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, "Invalid storage state was accepted")
        return result

    def test_native_storage_restart_and_interrupted_write_recovery(self):
        self.assertEqual(self.call("read").stdout.strip(), "<missing>")
        self.call("write", '{"wave":1,"scrap":4}', '{"wave":2,"scrap":9}')
        self.assertEqual(self.call("read").stdout.strip(), '{"wave":2,"scrap":9}')
        newest = next(self.root.glob("*.slot1"))
        newest.write_bytes(newest.read_bytes()[:19])
        self.assertEqual(self.call("read").stdout.strip(), '{"wave":1,"scrap":4}')
        self.call("write", '{"wave":2,"scrap":9}')
        self.assertEqual(self.call("read").stdout.strip(), '{"wave":2,"scrap":9}')

    def test_checksum_corruption_and_two_invalid_slots_never_create_fresh_profile(self):
        self.call("write", "previous", "latest")
        newest = next(self.root.glob("*.slot1"))
        data = bytearray(newest.read_bytes()); data[-1] ^= 1; newest.write_bytes(data)
        self.assertEqual(self.call("read").stdout.strip(), "previous")
        next(self.root.glob("*.slot0")).write_bytes(b"partial")
        result = self.call("read", success=False)
        self.assertIn("InvalidDataException", result.stderr)
        self.call("write", "must-not-reset", success=False)

    def test_record_isolation_and_rejected_path_escape(self):
        self.call("write", "progress")
        self.call("write", "preferences", key="singedTerra.lastStand.preferences.v1")
        self.assertEqual(self.call("read").stdout.strip(), "progress")
        self.assertEqual(self.call("read", key="singedTerra.lastStand.preferences.v1").stdout.strip(), "preferences")
        for key in ("../escape", "..", "/absolute", "a\\b", "a:b", "a/b", "a" * 65):
            self.call("write", "invalid", key=key, success=False)
        self.call("write", "upper", key="A" * 64)
        self.call("write", "lower", key="a" * 64)
        self.assertEqual(self.call("read", key="A" * 64).stdout.strip(), "upper")
        self.assertEqual(self.call("read", key="a" * 64).stdout.strip(), "lower")
        self.assertFalse((self.root.parent / "escape").exists())

    @contextmanager
    def linked_directory(self, link, target):
        # All paths are owned by this test. Remove the junction itself before
        # TemporaryDirectory cleanup; never recursively traverse its target.
        self.assertTrue(link.parent.resolve().is_relative_to(self.root.resolve()))
        self.assertTrue(target.resolve().is_relative_to(self.root.resolve()))
        self.assertFalse(link.exists())
        if sys.platform == "win32":
            shell = shutil.which("pwsh") or shutil.which("powershell")
            self.assertIsNotNone(shell, "PowerShell is required for the actual Windows junction proof")
            environment = dict(os.environ, ST_NATIVE_LINK_PATH=str(link), ST_NATIVE_LINK_TARGET=str(target))
            result = subprocess.run([shell, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
                "$ErrorActionPreference = 'Stop'; New-Item -ItemType Junction -Path $env:ST_NATIVE_LINK_PATH -Target $env:ST_NATIVE_LINK_TARGET | Out-Null"],
                env=environment, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, "Cannot create required junction: " + result.stdout + result.stderr)
        else:
            link.symlink_to(target, target_is_directory=True)
        try:
            self.assertTrue(link.is_dir())
            if sys.platform == "win32":
                self.assertTrue(link.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
            else:
                self.assertTrue(link.is_symlink())
            yield
        finally:
            if sys.platform == "win32":
                os.rmdir(link)  # Non-recursive: remove only our verified junction.
            else:
                link.unlink()

    def directory_bytes(self, path):
        return {str(item.relative_to(path)): item.read_bytes() if item.is_file() else None
                for item in path.rglob("*")}

    def refuse_link(self, executable, root, message, mode="read"):
        result = run_csharp(executable, [mode, root, self.key, "must-not-write"], timeout_seconds=10)
        self.assertNotEqual(result.returncode, 0, "Linked native save path was accepted")
        self.assertIn("IOException", result.stderr)
        self.assertIn(message, result.stderr)

    def without_link_guard(self, message, name):
        original = SCRIPTS / "Platform/LastStandFileStorage.cs"
        raw = original.read_text(encoding="utf-8-sig")
        guard = 'throw new IOException("' + message + '");'
        self.assertEqual(raw.count(guard), 1)
        altered = self.root / (name + ".cs")
        altered.write_text(raw.replace(guard, "return;"), encoding="utf-8")
        executable = self.root / (name + ".exe")
        compile_csharp(executable, [altered if path == original else path for path in self.inputs])
        return executable

    def test_linked_root_and_ancestor_refuse_access_without_changing_target(self):
        target = self.root / "protected-root"
        result = run_csharp(self.exe, ["write", target, self.key, "committed-progress"], timeout_seconds=10)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        (target / "unrelated.txt").write_text("preserve this target", encoding="utf-8")
        before = self.directory_bytes(target)
        message = "Native save root cannot traverse a linked directory."
        fault = self.without_link_guard(message, "NoRootLinkGuard")
        with self.linked_directory(self.root / "linked-root", target):
            for root in (self.root / "linked-root", self.root / "linked-root/not-created"):
                for mode in ("read", "write"):
                    with self.subTest(root=root.name, mode=mode):
                        self.refuse_link(self.exe, root, message, mode)
                        self.assertEqual(self.directory_bytes(target), before)
            # The same behavior oracle rejects compiled production code with
            # its root guard removed. This mutant only reads the target.
            with self.assertRaisesRegex(AssertionError, "Linked native save path was accepted"):
                self.refuse_link(fault, self.root / "linked-root", message)
            self.assertEqual(self.directory_bytes(target), before)
        self.assertEqual(self.directory_bytes(target), before)

    def test_link_at_record_file_position_refuses_access_and_preserves_target(self):
        target = self.root / "protected-record"
        target.mkdir()
        (target / "unrelated.txt").write_text("preserve this target", encoding="utf-8")
        before = self.directory_bytes(target)
        message = "Native save path is not a regular file."
        fault = self.without_link_guard(message, "NoRecordLinkGuard")
        for suffix in (".lock", ".slot0", ".slot1"):
            folder = self.root / suffix[1:]
            folder.mkdir()
            link = folder / ("ls-" + self.key.encode("ascii").hex() + suffix)
            with self.linked_directory(link, target):
                for mode in ("read", "write"):
                    with self.subTest(suffix=suffix, mode=mode):
                        self.refuse_link(self.exe, folder, message, mode)
                        self.assertEqual(self.directory_bytes(target), before)
                # A directory junction at a file position must not look like
                # missing data. The isolated guard-removal mutant does exactly
                # that and is rejected by the same refusal oracle.
                if suffix != ".lock":
                    # A directory cannot be opened as a lease file even without
                    # our guard; the slot-read mutation is the meaningful
                    # negative control for mistaken fresh-progress fallback.
                    with self.assertRaisesRegex(AssertionError, "Linked native save path was accepted"):
                        self.refuse_link(fault, folder, message)
                self.assertEqual(self.directory_bytes(target), before)
            self.assertEqual(self.directory_bytes(target), before)

    def test_crc_covers_identity_sequence_and_payload_without_crypto(self):
        self.call("write", "previous", "latest")
        newest = self.root / ("ls-" + self.key.encode("ascii").hex() + ".slot1")
        encoded = newest.read_bytes()
        self.assertEqual(int.from_bytes(encoded[-4:], "little"), zlib.crc32(encoded[:-4]))
        # Independently mutate the sequence, key identity, and payload. No
        # mutation may outrank/replace the preceding committed valid record.
        for offset in (12, 24, len(encoded) - 5):
            changed = bytearray(encoded); changed[offset] ^= 1; newest.write_bytes(changed)
            self.assertEqual(self.call("read").stdout.strip(), "previous")
        newest.write_bytes(encoded)
        self.assertEqual(self.call("read").stdout.strip(), "latest")

    def test_ambiguous_sequence_is_not_silently_selected(self):
        self.call("write", "previous", "latest")
        zero, one = next(self.root.glob("*.slot0")), next(self.root.glob("*.slot1"))
        zero.write_bytes(one.read_bytes())
        self.assertIn("InvalidDataException", self.call("read", success=False).stderr)

    def test_future_container_version_is_not_downgraded(self):
        self.call("write", "previous", "latest")
        newest = next(self.root.glob("*.slot1"))
        data = bytearray(newest.read_bytes()); data[8:12] = (2).to_bytes(4, "little"); newest.write_bytes(data)
        self.assertIn("Unsupported", self.call("read", success=False).stderr)

    def test_native_writer_lease_excludes_another_process_and_releases_on_exit(self):
        # Native writer exclusion uses real processes and OS handles. Browser
        # ownership has its own existing bridge checks; this tests the native port.
        ready = self.root / "writer-ready"
        owner = subprocess.Popen([str(MONO), str(self.exe), "hold", str(self.root), self.key, str(ready)],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 5
            while not ready.exists() and time.monotonic() < deadline and owner.poll() is None:
                time.sleep(.02)
            self.assertTrue(ready.exists(), "First process did not acquire writer lease")
            self.assertEqual(self.call("contended").stdout.strip(), "read-only")
        finally:
            owner.terminate()
            owner.communicate(timeout=5)
        self.call("write", "after-shutdown")
        self.assertEqual(self.call("read").stdout.strip(), "after-shutdown")

    def wait_for(self, path, process):
        deadline = time.monotonic() + 5
        while not path.exists() and time.monotonic() < deadline and process.poll() is None:
            time.sleep(.02)
        details = ""
        if not path.exists() and process.poll() is not None:
            stdout, stderr = process.communicate(timeout=5)
            details = "\n" + stdout + stderr
        self.assertTrue(path.exists(), "Native process did not reach the expected lease boundary" + details)

    def contended_process(self, mode, contender=None):
        ready = self.root / (mode + "-ready")
        owner = subprocess.Popen([str(MONO), str(self.exe), mode, str(self.root), self.key, str(ready)],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8-sig")
        try:
            self.wait_for(ready, owner)
            return run_csharp(contender or self.exe, ["contended", self.root, self.key], timeout_seconds=10)
        finally:
            if owner.poll() is None:
                owner.terminate()
            owner.communicate(timeout=5)

    def test_same_process_observers_do_not_release_the_cross_process_lease(self):
        result = self.contended_process("hold-with-observers")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "read-only")
        self.call("write", "after-owner-exit")
        self.assertEqual(self.call("read").stdout.strip(), "after-owner-exit")

    def test_native_lease_honors_an_independent_os_range_lock(self):
        self.call("write", "held")
        result = self.contended_process("hold-range-lock")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "read-only")
        self.call("write", "after-range-release")
        self.assertEqual(self.call("read").stdout.strip(), "after-range-release")

    def test_missing_os_range_lock_is_detected_by_an_independent_process(self):
        original = SCRIPTS / "Platform/LastStandFileStorage.cs"
        raw = original.read_text(encoding="utf-8-sig")
        locking = "candidate.Lock(0, 1);"
        self.assertEqual(raw.count(locking), 1)
        altered = self.root / "NoRangeLock.cs"
        altered.write_text(raw.replace(locking, ""), encoding="utf-8")
        fault = self.root / "NoRangeLock.exe"
        compile_csharp(fault, [altered if path == original else path for path in self.inputs])
        self.call("write", "held")
        result = self.contended_process("hold-range-lock", contender=fault)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("A second writer acquired the record", result.stderr)
        self.assertEqual(self.call("read").stdout.strip(), "held")

    def surviving_waiter(self, executable, folder):
        folder.mkdir(); ready = folder / "owner-ready"; waiting = folder / "waiter-ready"; released = folder / "released"
        owner = subprocess.Popen([str(MONO), str(self.exe), "hold", str(folder), self.key, str(ready)],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8-sig")
        waiter = None
        try:
            self.wait_for(ready, owner)
            waiter = subprocess.Popen([str(MONO), str(executable), "waiter", str(folder), self.key, str(waiting), str(released)],
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8-sig")
            self.wait_for(waiting, waiter)
            owner.terminate(); owner.communicate(timeout=5)
            released.write_text("owner exited")
            stdout, stderr = waiter.communicate(timeout=10)
            return waiter.returncode, stdout, stderr
        finally:
            for child in (waiter, owner):
                if child is not None and child.poll() is None:
                    child.terminate(); child.communicate(timeout=5)

    def test_surviving_waiter_retries_after_the_owner_process_exits(self):
        code, stdout, stderr = self.surviving_waiter(self.exe, self.root / "recovery")
        self.assertEqual(code, 0, stdout + stderr)
        self.assertEqual(stdout.strip(), "survived")
        # Compile the pre-fix behavior: the capability getter never attempts
        # reacquisition. The same surviving-process journey must reject it.
        original = SCRIPTS / "Platform/LastStandFileStorage.cs"
        raw = original.read_text(encoding="utf-8-sig")
        before = "if (disposed) return false;\n                    TryAcquireLease();"
        self.assertEqual(raw.count(before), 1)
        altered = self.root / "LastStandFileStorage.cs"
        altered.write_text(raw.replace(before, "if (disposed) return false;"), encoding="utf-8")
        inputs = [altered if p == original else p for p in self.inputs]
        fault = self.root / "NoLeaseRecovery.exe"; compile_csharp(fault, inputs)
        code, stdout, stderr = self.surviving_waiter(fault, self.root / "fault")
        self.assertNotEqual(code, 0)
        self.assertIn("did not reacquire", stderr)

    def test_preferences_retry_reacquires_before_read_and_preserves_newer_records(self):
        for mode in ("prefs-retry", "prefs-stale", "prefs-race"):
            with self.subTest(mode=mode):
                self.assertEqual(self.call(mode, key=mode).stdout.strip(), "preferences-safe")
        self.assertEqual(self.call("profile-stale", key="profile").stdout.strip(), "profile-safe")
