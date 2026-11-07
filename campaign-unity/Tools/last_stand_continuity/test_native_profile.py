"""Production native storage owners share an immutable, bounded verification root."""
from pathlib import Path
from contextlib import contextmanager
import os
import subprocess
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp

SCRIPTS = TOOLS.parent / "Unity/Assets/Scripts"
FLAG = "--last-stand-test-profile"


class NativeProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build = tempfile.TemporaryDirectory(prefix="st-native-profile-build-")
        cls.executables = {}
        sources = complete_sources(SCRIPTS, [SCRIPTS / "LastStandProgression.cs",
            SCRIPTS / "LastStandPreferences.cs", SCRIPTS / "LastStandPreferencesStore.cs",
            SCRIPTS / "Platform/LastStandFileStorage.cs", Path(__file__).with_name("NativeProfileChecks.cs")])
        resolver = SCRIPTS / "Platform/LastStandNativeStorageRoot.cs"
        sources.append(resolver)
        for development in (False, True):
            exe = Path(cls.build.name) / ("Development.exe" if development else "Release.exe")
            compile_csharp(exe, sources, defines=("UNITY_STANDALONE", "DEVELOPMENT_BUILD") if development else ("UNITY_STANDALONE",))
            cls.executables[development] = exe

    @classmethod
    def tearDownClass(cls):
        cls.build.cleanup()

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="st-native-profile-")
        self.root = Path(self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def run_owner(self, mode, *options, development=True, success=True):
        result = run_csharp(self.executables[development], [mode, self.root, *options], timeout_seconds=10)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return result

    def files(self):
        return {p.relative_to(self.root).as_posix(): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}

    def test_default_root_and_records_are_unchanged_without_option(self):
        for development in (False, True):
            self.run_owner("write", development=development)
            self.run_owner("read", development=development)
        self.assertFalse((self.root / "VerificationProfiles").exists())
        self.assertEqual(len(list(self.root.glob("*.lock"))), 3)

    def test_development_profile_isolates_every_owner_and_reopens(self):
        self.run_owner("write", development=False)
        before = self.files()
        self.run_owner("write", FLAG, "journey-1")
        self.assertTrue((self.root / "VerificationProfiles/journey-1").is_dir())
        after = self.files()
        self.assertEqual({p: after[p] for p in before}, before)
        self.assertEqual(len(list((self.root / "VerificationProfiles/journey-1").glob("*.lock"))), 3)
        self.run_owner("read", FLAG, "journey-1")

    def test_release_flag_is_refused_without_storage_access(self):
        self.run_owner("reject", FLAG, "journey-1", development=False)
        self.assertEqual(self.files(), {})

    def test_profile_root_is_cached_across_all_storage_owners(self):
        self.run_owner("cached", FLAG, "one-process")
        self.assertFalse((self.root / "changed-after-selection").exists())
        self.run_owner("read", FLAG, "one-process")

    def test_malformed_profile_stays_rejected_without_normal_root_fallback(self):
        for options in ((FLAG,), (FLAG, "../escape"), (FLAG, "one", FLAG, "two"), (FLAG + "=one",)):
            with self.subTest(options=options):
                self.run_owner("reject", *options)
                self.assertEqual(self.files(), {})

    def test_identifier_bounds_and_reserved_device_names_are_refused(self):
        invalid = ("", "a" * 33, ".", "..", "a/b", "a\\b", "a:b", "a.b", "a ", " a",
                   "a\n", "\u00e9", "a\u202e", "-other-option", "_first", "CON", "nul", "PRN", "AUX", "com1", "LPT9")
        for identifier in invalid:
            with self.subTest(identifier=repr(identifier)):
                self.run_owner("reject", FLAG, identifier)
                self.assertEqual(self.files(), {})
        for option in (FLAG.upper(), FLAG + "-extra"):
            self.run_owner("reject", option, "safe")
            self.assertEqual(self.files(), {})

    def test_ascii_identifiers_accept_the_length_bound_and_unrelated_host_flags(self):
        for identifier in ("A", "a" * 32, "native_1-A"):
            self.run_owner("write", "-screen-width", "1024", FLAG, identifier, "-windowed")
            self.run_owner("read", FLAG, identifier)
            self.assertTrue((self.root / "VerificationProfiles" / identifier).is_dir())
        self.assertFalse(list(self.root.glob("*.slot*")))

    @contextmanager
    def linked_directory(self, link, target):
        if os.name == "nt":
            quote = lambda value: "'" + str(value).replace("'", "''") + "'"
            command = "New-Item -ItemType Junction -Path " + quote(link) + " -Target " + quote(target) + " | Out-Null"
            subprocess.run(["powershell", "-NoProfile", "-Command", command], capture_output=True, check=True)
            self.assertTrue(link.is_junction())
        else:
            link.symlink_to(target, target_is_directory=True)
        self.assertEqual(link.resolve(), target.resolve())
        try:
            yield
        finally:
            if os.name == "nt":
                os.rmdir(link)  # Remove only the verified junction, never its target.
            else:
                link.unlink()

    def test_linked_profile_or_parent_refuses_all_owners_and_preserves_target(self):
        target = self.root / "protected-target"
        target.mkdir()
        sentinel = target / "untouched.txt"
        sentinel.write_bytes(b"unrelated target remains unchanged")
        parent = self.root / "VerificationProfiles"
        for link in (parent, parent / "linked"):
            if link != parent:
                parent.mkdir()
            with self.linked_directory(link, target):
                self.run_owner("reject", FLAG, "linked")
                self.assertEqual(list(target.iterdir()), [sentinel])
                self.assertEqual(sentinel.read_bytes(), b"unrelated target remains unchanged")
                self.assertFalse(list(self.root.glob("*.slot*")))
