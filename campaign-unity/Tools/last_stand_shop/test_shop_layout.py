"""Compile the actual pure Field Console layout with the pinned Unity tools.

Geometry does not measure imported Graphic contrast or prove runtime masking.
Those obligations remain with the HUD integration and rendered acceptance.
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
PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SOURCE = PROJECT / "Unity/Assets/Scripts/LastStandHudLayout.cs"
DRIVER = Path(__file__).with_name("ShopLayoutChecks.cs")


def file_hash(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


class ShopLayoutTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-shop-layout-")
        cls.executable = Path(cls.output.name) / "ShopLayoutChecks.exe"
        cls.evidence = None
        evidence_root = os.environ.get("ST_SHOP_TEST_EVIDENCE")
        if evidence_root:
            cls.evidence = Path(evidence_root) / (
                datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
            )
            cls.evidence.mkdir(parents=True, exist_ok=False)
        sources = [SOURCE, DRIVER]
        cls.source_hashes = {str(p): file_hash(p) for p in sources}
        cls.tool_hashes = {str(p): file_hash(p) for p in (Path(sys.executable), MONO, CSC)}
        if cls.evidence:
            archive = cls.evidence / "sources"
            archive.mkdir()
            for source in sources + [Path(__file__).resolve()]:
                (archive / source.name).write_bytes(source.read_bytes())
        argv = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{cls.executable}"]
        argv.extend(str(source) for source in sources)
        build = cls.run_bound(argv, timeout=60)
        cls.record("compile", argv, build)
        print(f"Actual-source C# compilation exit={build.returncode}", file=sys.stderr)
        if build.returncode:
            cls.output.cleanup()
            raise AssertionError(f"Pinned C# compilation failed (not behavioral RED):\n{build.stdout}{build.stderr}")

    @classmethod
    def run_bound(cls, argv, timeout):
        process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            if cls.evidence:
                (cls.evidence / f"timeout-{process.pid}.stdout.txt").write_bytes(stdout)
                (cls.evidence / f"timeout-{process.pid}.stderr.txt").write_bytes(stderr)
            raise
        result = subprocess.CompletedProcess(argv, process.returncode,
            stdout.decode("utf-8-sig"), stderr.decode("utf-8-sig"))
        result.pid, result.stdout_raw, result.stderr_raw = process.pid, stdout, stderr
        return result

    @classmethod
    def record(cls, name, argv, result):
        if cls.evidence:
            (cls.evidence / f"{name}.stdout.txt").write_bytes(result.stdout_raw)
            (cls.evidence / f"{name}.stderr.txt").write_bytes(result.stderr_raw)
            (cls.evidence / f"{name}.json").write_text(json.dumps({
                "argv": argv, "cwd": str(Path.cwd()), "pid": result.pid, "exit": result.returncode,
                "source_sha256": cls.source_hashes, "tool_sha256": cls.tool_hashes,
                "executable_sha256": file_hash(cls.executable) if cls.executable.is_file() else None,
            }, indent=2), encoding="utf-8")
            if name == "compile" and result.returncode == 0:
                (cls.evidence / cls.executable.name).write_bytes(cls.executable.read_bytes())

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        argv = [str(MONO), str(self.executable), name]
        result = self.run_bound(argv, timeout=30)
        self.record(name, argv, result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_shop_five_profiles_scroll_and_required_controls(self):
        self.case("shop_five_profiles_scroll_and_required_controls")

    def test_shop_text_contrast_targets_and_refusal_bounds(self):
        self.case("shop_text_contrast_targets_and_refusal_bounds")

    def test_shop_compact_meaningful_summary(self):
        self.case("shop_compact_meaningful_summary")

    def test_shop_measured_long_notice(self):
        self.case("shop_measured_long_notice")

    def test_shop_short_landscape_closed_recovery(self):
        self.case("shop_short_landscape_closed_recovery")
