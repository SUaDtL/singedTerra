"""Integrated v5 owner transactions; legacy fixture comes from the real v4 owner."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
REPO = PROJECT.parent
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
BASELINE = "a17e2ff5cbe5d0bc765f57a55edb4f9404000150"
BASE_SOURCES = ["MechanicsShopModel.cs", "LastStandUpgradeCatalog.cs", "LastStandTierCatalog.cs",
                "LastStandProgression.cs", "LastStandStore.cs", "LastStandRunClock.cs", "LastStandSpeedPolicy.cs",
                "EncounterModel.cs", "EncounterProfile.cs", "LastStandShopState.cs", "LastStandWaveCatalog.cs",
                "LastStandRewardCatalog.cs", "LastStandSaveJson.cs", "LastStandRunCheckpoint.cs",
                "LastStandProgressionSave.cs", "LastStandLegacySave.cs", "LastStandSelection.cs"]
NEW_SOURCES = ["LastStandEconomyCatalog.cs", "LastStandResearchCatalog.cs", "LastStandResearchClock.cs",
               "LastStandResearchState.cs", "LastStandRunHistory.cs", "LastStandProgressionResearch.cs",
               "LastStandProgressionResearchSave.cs"]


class ResearchProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-research-profile-")
        folder = Path(cls.output.name)
        cls.legacy_raw = folder / "legacy-v4.json"
        cls.legacy_snapshot = folder / "legacy-v4.snapshot"
        fixtures = Path(__file__).with_name("fixtures")
        manifest = json.loads((fixtures / "legacy-v4.manifest.json").read_text())
        if manifest["source_commit"] != BASELINE:
            raise AssertionError("Legacy fixture source changed")
        generator = Path(__file__).with_name("ResearchLegacyV4Fixture.cs")
        if hashlib.sha256(generator.read_bytes().replace(b"\r\n", b"\n")).hexdigest() != manifest["generator_sha256"]:
            raise AssertionError("Legacy fixture generator changed without provenance update")
        for name, digest in manifest["files_sha256"].items():
            data = (fixtures / name).read_bytes()
            if hashlib.sha256(data).hexdigest() != digest:
                raise AssertionError("Legacy fixture digest mismatch")
            (folder / name).write_bytes(data)
        # Shallow CI checkouts consume the checked-in, hashed production fixture.
        # Maintainers can regenerate from the pinned old owner when Git history
        # is present; the resulting bytes must exactly match the fixture.
        if os.environ.get("ST_RESEARCH_REGENERATE_V4") == "1":
            legacy = folder / "legacy"
            legacy.mkdir()
            for name in BASE_SOURCES:
                result = subprocess.run(["git", "show", f"{BASELINE}:campaign-unity/Unity/Assets/Scripts/{name}"],
                                        cwd=REPO, capture_output=True, check=True)
                if hashlib.sha256(result.stdout).hexdigest() != manifest["source_sha256"][name]:
                    raise AssertionError("Pinned legacy source digest mismatch")
                (legacy / name).write_bytes(result.stdout)
            legacy_exe = folder / "LegacyV4.exe"
            cls.compile(legacy_exe, [legacy / name for name in BASE_SOURCES], "ResearchLegacyV4Fixture.cs")
            result = subprocess.run([str(MONO), str(legacy_exe), str(cls.legacy_raw), str(cls.legacy_snapshot)],
                                    capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
            if result.returncode:
                raise AssertionError("Old owner failed to produce valid checkpoint:\n" + result.stdout + result.stderr)
            for name, digest in manifest["files_sha256"].items():
                if hashlib.sha256((folder / name).read_bytes()).hexdigest() != digest:
                    raise AssertionError("Regenerated old-owner fixture changed")
        cls.exe = folder / "ResearchProfileChecks.exe"
        cls.compile(cls.exe, [SCRIPTS / name for name in BASE_SOURCES + NEW_SOURCES], "ResearchProfileChecks.cs")
        cls.evidence = PROJECT / "Evidence/research-engine/profile"
        cls.evidence.mkdir(parents=True, exist_ok=True)
        (cls.evidence / "legacy-v4.json").write_bytes(cls.legacy_raw.read_bytes())
        (cls.evidence / "legacy-v4.snapshot").write_bytes(cls.legacy_snapshot.read_bytes())

    @classmethod
    def compile(cls, target, sources, harness):
        args = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{target}"]
        result = subprocess.run(args + [str(s) for s in sources] + [str(Path(__file__).with_name(harness))],
                                capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
        if result.returncode:
            raise AssertionError("Compilation failed, not behavioral RED:\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls): cls.output.cleanup()

    def check(self, case):
        command = [str(MONO), str(self.exe), case, str(self.legacy_raw), str(self.legacy_snapshot)]
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8-sig", timeout=90)
        record = {"case": case, "legacy_source_commit": BASELINE, "exit_code": result.returncode,
                  "stdout": result.stdout, "stderr": result.stderr}
        (self.evidence / (case + (".green.json" if result.returncode == 0 else ".red.json"))).write_text(json.dumps(record, indent=2))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + case)

    def test_fresh_envelope_and_reload(self): self.check("fresh")
    def test_v1_v2_v3_claim_migrations(self): self.check("legacy")
    def test_real_v4_run_economy_migration(self): self.check("v4")
    def test_research_charge_refund_completion_storage_faults(self): self.check("faults")
    def test_completion_precedes_stale_action_and_no_duplicate_grant(self): self.check("stale")
    def test_workshop_and_research_shared_wallet_conflicts(self): self.check("wallet")
    def test_midwave_research_save_preserves_boundary(self): self.check("checkpoint")
    def test_salvage_carry_history_and_duplicate_finalization(self): self.check("carry")
    def test_run_upgrade_contexts_follow_deployment_and_boundaries(self): self.check("contexts")
    def test_writer_ownership_guards_migration_and_pending_confirmation(self): self.check("ownership")
