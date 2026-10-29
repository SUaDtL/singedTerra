"""Actual-loop observer parity and fail-closed input admission."""
import tempfile
import unittest
import copy
import json
import subprocess
import sys
from pathlib import Path
from measure_crowded_waves import HERE, PROJECT, REPORT, BINDINGS, admit_canonical, compile_observer, instrument, run_csharp, validate


class CrowdedWaveTests(unittest.TestCase):
    def test_calibrated_and_historical_bindings_are_not_interchangeable(self):
        current = REPORT.read_bytes()
        historical = BINDINGS["baseline"]["report"].read_bytes()
        admit_canonical(current)
        with self.assertRaisesRegex(ValueError, "canonical report changed"):
            admit_canonical(historical)
        with self.assertRaisesRegex(ValueError, "canonical report changed"):
            admit_canonical(current, binding_name="baseline")
        with tempfile.TemporaryDirectory(prefix="st-crowded-archive-") as temp:
            archive = Path(temp)
            admit_canonical(current, archive=archive)
            (archive / "combat-balance-report.json").write_bytes(historical)
            with self.assertRaisesRegex(ValueError, "archive differs"):
                admit_canonical(current, archive=archive)

    def test_fresh_lf_checkout_without_archive_creates_owned_destinations(self):
        canonical = json.loads(REPORT.read_text())
        with tempfile.TemporaryDirectory(prefix="st-crowded-checkout-") as temp:
            project = Path(temp) / "campaign-unity"
            paths = [PROJECT / rel for rel in canonical["sourceSha256"]] + [HERE / name for name in ("CrowdedWaveMeasurements.cs", "measure_crowded_waves.py", "test_crowded_waves.py")]
            for source in paths:
                target = project / source.relative_to(PROJECT)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(source.read_bytes().replace(b"\r\n", b"\n"))
            copied_report = project / "docs/last-stand-combat-depth/combat-balance-calibrated-report.json"
            copied_report.parent.mkdir(parents=True, exist_ok=True)
            for label, data in (("historical-raw", REPORT.read_bytes()), ("checkout-lf", REPORT.read_bytes().replace(b"\r\n", b"\n"))):
                with self.subTest(reportEncoding=label):
                    copied_report.write_bytes(data)
                    output = Path(temp) / label / "new-output/crowded.json"
                    result = subprocess.run([sys.executable, "-B", str(project / "Tools/last_stand_combat_depth/measure_crowded_waves.py"), "--output", str(output)], capture_output=True, text=True, cwd=temp, timeout=120)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertTrue(output.is_file())
            changed = project / "Unity/Assets/Scripts/EncounterModel.cs"
            changed.write_bytes(changed.read_bytes() + b"\n// different source\n")
            result = subprocess.run([sys.executable, "-B", str(project / "Tools/last_stand_combat_depth/measure_crowded_waves.py")], capture_output=True, text=True, cwd=temp, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Canonical source changed", result.stderr)

    def test_rejects_impossible_currency_pressure_and_disconnected_hull(self):
        canonical = json.loads(REPORT.read_text())
        report = json.loads((PROJECT / "docs/last-stand-combat-depth/crowded-wave-calibrated-report.json").read_text())
        for field, value in (("earnedScrap", -1), ("salvageGross", -1), ("minimumHull", -1), ("peakLivingBeforeAttacks", 33), ("livingEnemyTickSum", 1.5)):
            with self.subTest(field=field):
                broken = copy.deepcopy(report)
                broken["runs"][0]["waves"][0][field] = value
                with self.assertRaises(ValueError):
                    validate(broken, canonical)
        broken = copy.deepcopy(report)
        broken["runs"][0]["waves"][0].update(startingHull=777777, endingHull=777777)
        with self.assertRaises(ValueError):
            validate(broken, canonical)
        for mutate in (
            lambda r: r["runs"][0]["windowStart"].update(wave=279),
            lambda r: r["runs"][0]["waves"][1]["beforeBoundary"].update(hull=1),
            lambda r: r["runs"][0]["waves"][-1]["afterBoundary"].update(earnedScrap=999999),
            lambda r: r["runs"][0]["waves"][0].update(earnedScrap=999999),
        ):
            broken = copy.deepcopy(report)
            mutate(broken)
            with self.assertRaises(ValueError):
                validate(broken, canonical)

    def test_actual_wave_metrics_and_readonly_state_parity(self):
        with tempfile.TemporaryDirectory(prefix="st-crowded-checks-") as temp:
            exe, _, _ = compile_observer(Path(temp))
            result = run_csharp(exe, ["check"])
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("PASS actual-wave-observer-and-parity", result.stdout)

    def test_observer_rejects_changed_or_missing_canonical_seam(self):
        source = (HERE / "CombatBalanceMeasurements.cs").read_text()
        instrument(source)
        for changed in (source + "\n", source.replace("model.Step();effects.Observe(model);", "effects.Observe(model);")):
            with self.assertRaisesRegex(ValueError, "Canonical harness changed"):
                instrument(changed)

    def test_actual_report_rejects_foreign_funding_missing_wave_and_false_pressure(self):
        canonical = json.loads(REPORT.read_text())
        report = json.loads((PROJECT / "docs/last-stand-combat-depth/crowded-wave-calibrated-report.json").read_text())
        validate(report, canonical)
        for mutation in (
            lambda r: r.update(parentProfileSha256="0" * 64),
            lambda r: r["runs"].pop(),
            lambda r: r["runs"][0]["waves"].pop(),
            lambda r: r["runs"][0]["oneTimeAllocation"].update(auxiliarySpent=0),
            lambda r: r["runs"][0]["run"].update(purchaseIntents=1),
            lambda r: r["runs"][0]["waves"][0].update(startTick=0),
            lambda r: r["runs"][0]["waves"][0].update(endingHull=1),
            lambda r: r["runs"][0]["waves"][0].update(kills=999),
            lambda r: r["runs"][0]["waves"][0].update(livingEnemyTickSum=-1),
        ):
            broken = copy.deepcopy(report)
            mutation(broken)
            with self.assertRaises(ValueError):
                validate(broken, canonical)
