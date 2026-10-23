"""Compile actual Last Stand sources and exercise the catalog's public behavior.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_shop -p test_shop_vertical.py -v -k catalog
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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources


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
DRIVER = Path(__file__).with_name("ShopVerticalChecks.cs")


def file_hash(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


class ShopVerticalTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-shop-vertical-")
        cls.executable = Path(cls.output.name) / "ShopVerticalChecks.exe"
        cls.evidence = None
        evidence_root = os.environ.get("ST_SHOP_TEST_EVIDENCE")
        if evidence_root:
            cls.evidence = Path(evidence_root) / (
                datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
            )
            cls.evidence.mkdir(parents=True, exist_ok=False)
        sources = [SCRIPTS / name for name in (
            "MechanicsShopModel.cs", "LastStandTierCatalog.cs", "EncounterModel.cs", "EncounterProfile.cs",
            "LastStandProgression.cs", "LastStandStore.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs",
        )]
        catalog = SCRIPTS / "LastStandUpgradeCatalog.cs"
        cls.fault_fixture = None
        fault = os.environ.get("ST_SHOP_CATALOG_FAULT")
        catalog_source = catalog
        if fault:
            # These closed, deliberate faults validate new assertions against
            # a temporary copy of the actual source. Production bytes stay intact.
            faults = {
                "typed-mapping": (
                    "return Tracks[index];",
                    "return Tracks[(index + 1) % Tracks.Count];",
                ),
                "typed-refusal": (
                    "if (index < 0 || index >= Tracks.Count) throw new ArgumentOutOfRangeException(nameof(id));",
                    "// Deliberate fault fixture: typed ID guard removed.",
                ),
                "armor-raw-hit-guard": (
                    "if (rawHit < 1) throw new ArgumentOutOfRangeException(nameof(rawHit));",
                    "// Deliberate fault fixture: armor raw-hit guard removed.",
                ),
            }
            if fault not in faults or not catalog.is_file():
                cls.output.cleanup()
                raise AssertionError("Unknown fault fixture or absent actual catalog source.")
            actual_bytes = catalog.read_bytes()
            actual_source = actual_bytes.decode("utf-8")
            target, replacement = faults[fault]
            if actual_source.count(target) != 1:
                cls.output.cleanup()
                raise AssertionError("Fault fixture target must occur exactly once in actual source.")
            catalog_source = Path(cls.output.name) / catalog.name
            catalog_source.write_text(actual_source.replace(target, replacement), encoding="utf-8", newline="")
            cls.fault_fixture = {
                "name": fault, "actual_catalog": str(catalog),
                "actual_catalog_sha256": hashlib.sha256(actual_bytes).hexdigest(),
                "before": target, "after": replacement,
                "temporary_catalog": str(catalog_source),
            }
        # An absent new catalog is asserted at runtime through test-only
        # reflection. The actual baseline must compile, without a substitute.
        if catalog.exists():
            sources.append(catalog_source)
        ledger = SCRIPTS / "LastStandShopState.cs"
        if ledger.exists():
            sources.append(ledger)
        presentation = SCRIPTS / "LastStandShopPresentation.cs"
        if presentation.exists():
            sources.append(presentation)
        sources.append(DRIVER)
        sources = complete_sources(SCRIPTS, sources)
        argv = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{cls.executable}"]
        argv.extend(str(source) for source in sources)
        cls.source_hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
        cls.tool_hashes = {str(p): file_hash(p) for p in (Path(sys.executable), MONO, CSC)}
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
                "tool_sha256": cls.tool_hashes,
                "executable_sha256": file_hash(cls.executable) if cls.executable.is_file() else None,
                "fault_fixture": cls.fault_fixture,
            }, indent=2), encoding="utf-8")
            if name == "compile" and result.returncode == 0:
                (cls.evidence / cls.executable.name).write_bytes(cls.executable.read_bytes())

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        argv = [str(MONO), str(self.executable), name]
        result = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8-sig", timeout=30)
        self.record(name, argv, result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_catalog_exact_tracks_and_effects(self):
        self.case("catalog_exact_tracks_and_effects")

    def test_catalog_intervals_use_seconds_without_rounding_levels(self):
        self.case("catalog_intervals_use_seconds_without_rounding_levels")

    def test_catalog_caps_prices_and_fitting(self):
        self.case("catalog_caps_prices_and_fitting")

    def test_ledger_independent_prices_and_caps(self):
        self.case("ledger_independent_prices_and_caps")

    def test_ledger_unique_kill_income(self):
        self.case("ledger_unique_kill_income")

    def test_transaction_atomic_charge_and_level(self):
        self.case("transaction_atomic_charge_and_level")

    def test_transaction_stale_replay_and_refusal(self):
        self.case("transaction_stale_replay_and_refusal")

    def test_attack_cannon_exact_damage(self):
        self.case("attack_cannon_exact_damage")

    def test_attack_launcher_fitting_isolation(self):
        self.case("attack_launcher_fitting_isolation")

    def test_defense_hull_purchase_and_clamp(self):
        self.case("defense_hull_purchase_and_clamp")

    def test_defense_armor_close_and_ranged_hits(self):
        self.case("defense_armor_close_and_ranged_hits")

    def test_cycle_future_schedule_and_next_tick(self):
        self.case("cycle_future_schedule_and_next_tick")

    def test_cycle_partition_and_legacy_parity(self):
        self.case("cycle_partition_and_legacy_parity")

    def test_repair_amount_and_maximum(self):
        self.case("repair_amount_and_maximum")

    def test_repair_fitting_and_terminal_refusal(self):
        self.case("repair_fitting_and_terminal_refusal")

    def test_presentation_levels_effects_prices_and_reasons(self):
        self.case("presentation_levels_effects_prices_and_reasons")
