"""Exercise strict saves and migration against actual production progression.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_shop -p test_shop_persistence.py -v -k migration
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid

sys.dont_write_bytecode = True
cache_dir = Path(__file__).with_name("__pycache__")
cache_file = cache_dir / f"{Path(__file__).stem}.{sys.implementation.cache_tag}.pyc"
cache_file.unlink(missing_ok=True)
if cache_dir.is_dir():
    try:
        cache_dir.rmdir()
    except OSError:
        pass

PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
DRIVER = Path(__file__).with_name("ShopPersistenceChecks.cs")


class ShopPersistenceTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-shop-persistence-")
        cls.executable = Path(cls.output.name) / "ShopPersistenceChecks.exe"
        cls.evidence = None
        evidence_root = os.environ.get("ST_SHOP_TEST_EVIDENCE")
        if evidence_root:
            cls.evidence = Path(evidence_root) / (
                datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
            )
            cls.evidence.mkdir(parents=True, exist_ok=False)
        sources = [SCRIPTS / name for name in (
            "MechanicsShopModel.cs", "LastStandUpgradeCatalog.cs",
            "LastStandProgression.cs", "LastStandStore.cs", "LastStandShopState.cs",
        )] + [DRIVER]
        cls.source_hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
        argv = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{cls.executable}"]
        argv.extend(str(source) for source in sources)
        build = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
        cls.record("compile", argv, build)
        print(f"Actual-source C# compilation exit={build.returncode}", file=sys.stderr)
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(f"Pinned C# compilation failed:\n{build.stdout}{build.stderr}")

    @classmethod
    def record(cls, name, argv, result):
        if cls.evidence:
            (cls.evidence / f"{name}.stdout.txt").write_text(result.stdout, encoding="utf-8")
            (cls.evidence / f"{name}.stderr.txt").write_text(result.stderr, encoding="utf-8")
            (cls.evidence / f"{name}.json").write_text(json.dumps({
                "argv": argv, "cwd": str(Path.cwd()), "exit": result.returncode,
                "source_sha256": cls.source_hashes,
            }, indent=2), encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        argv = [str(MONO), str(self.executable), name]
        result = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8-sig", timeout=30)
        self.record(name, argv, result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_migration_exact_v1_wallet_run_and_pending(self):
        self.case("migration_exact_v1_wallet_run_and_pending")

    def test_migration_strict_v2_and_invalid_records(self):
        self.case("migration_strict_v2_and_invalid_records")

    def test_permanent_all_tracks_prices_caps_and_reload(self):
        self.case("permanent_all_tracks_prices_caps_and_reload")

    def test_permanent_run_pending_and_fitting_boundaries(self):
        self.case("permanent_run_pending_and_fitting_boundaries")

    def test_storage_denied_and_uncertain_write_retry(self):
        self.case("storage_denied_and_uncertain_write_retry")

    def test_storage_external_conflict_preserves_original(self):
        self.case("storage_external_conflict_preserves_original")

    def test_storage_reward_claim_idempotence(self):
        self.case("storage_reward_claim_idempotence")
