"""Actual-loop observer parity and fail-closed input admission."""
import tempfile
import unittest
import copy
import json
import subprocess
import sys
import hashlib
import os
from pathlib import Path
from unittest.mock import patch
import measure_crowded_waves as crowded_measurement
from measure_crowded_waves import HERE, PROJECT, REPORT, BINDINGS, RESULT_FIELDS, admit_canonical, assert_crowded_parity, compile_observer, instrument, run_csharp, validate


class CrowdedWaveTests(unittest.TestCase):
    def test_current_closure_cannot_add_omit_duplicate_or_redirect_measured_sources(self):
        selected = crowded_measurement.sources()
        crowded_measurement.admit_source_closure(selected)
        with tempfile.TemporaryDirectory(prefix="st-crowded-closure-") as temp:
            outside = Path(temp) / "EncounterModel.cs"
            for name, altered in (("added", selected + [HERE / "CrowdedWaveMeasurements.cs"]),
                                  ("omitted", selected[:-1]),
                                  ("duplicate", selected + [selected[0]]),
                                  ("redirected", selected[:-1] + [outside])):
                output = Path(temp) / (name + ".json")
                with self.subTest(fault=name), patch.object(crowded_measurement, "sources", return_value=altered):
                    with self.assertRaisesRegex(ValueError, "source closure differs from frozen inputs"):
                        crowded_measurement.measure(output)
                    self.assertFalse(output.exists(), "Rejected closure cannot publish a report")

    def test_current_execution_helper_does_not_relabel_frozen_capture(self):
        data = REPORT.read_bytes()
        historical = json.loads(data)
        helper = "Tools/last_stand_test_runtime.py"
        with tempfile.TemporaryDirectory(prefix="st-crowded-execution-input-") as temp:
            project = Path(temp)
            for rel in historical["sourceSha256"]:
                target = project / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((PROJECT / rel).read_bytes())
            source = project / helper
            source.write_bytes(source.read_bytes() + b"\n# Owned execution-identity discriminator.\n")
            admitted = admit_canonical(data, project=project)
            self.assertEqual(admitted, historical)
            self.assertNotEqual(hashlib.sha256(source.read_bytes()).hexdigest(), admitted["sourceSha256"][helper])
            for rel in ("Tools/last_stand_source_closure.py",
                        "Tools/last_stand_combat_depth/measure_combat_balance.py",
                        "Tools/last_stand_combat_depth/CombatBalanceMeasurements.cs",
                        "Unity/Assets/Scripts/EncounterModel.cs"):
                target = project / rel
                original = target.read_bytes()
                target.write_bytes(original + b"\n# changed policy or model\n")
                with self.assertRaisesRegex(ValueError, "Canonical source changed"):
                    admit_canonical(data, project=project)
                target.unlink()
                with self.assertRaisesRegex(ValueError, "Canonical source changed"):
                    admit_canonical(data, project=project)
                target.write_bytes(original)
            source.unlink()
            with self.assertRaisesRegex(ValueError, "Canonical source changed"):
                admit_canonical(data, project=project)

    def test_complete_crowded_parity_rejects_plausible_but_changed_role_measurements(self):
        reference = json.loads((PROJECT / "docs/last-stand-combat-depth/crowded-wave-calibrated-report.json").read_text())
        result = {key: copy.deepcopy(reference[key]) for key in RESULT_FIELDS}
        canonical = json.loads(REPORT.read_text())
        validate(result, canonical)
        assert_crowded_parity(result, reference)
        result["runs"][0]["waves"][0]["roleEffects"]["mortarAdditionalTargets"] += 1
        validate(result, canonical)  # Aggregate conservation alone cannot prove the role observation.
        with self.assertRaisesRegex(ValueError, "complete frozen crowded outcomes"):
            assert_crowded_parity(result, reference)

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
            crowded = PROJECT / "docs/last-stand-combat-depth/crowded-wave-calibrated-report.json"
            copied_crowded = project / crowded.relative_to(PROJECT)
            for label, data in (("historical-raw", REPORT.read_bytes()), ("checkout-lf", REPORT.read_bytes().replace(b"\r\n", b"\n"))):
                with self.subTest(reportEncoding=label):
                    copied_report.write_bytes(data)
                    copied_crowded.write_bytes(crowded.read_bytes() if label == "historical-raw" else crowded.read_bytes().replace(b"\r\n", b"\n"))
                    output = Path(temp) / label / "new-output/crowded.json"
                    result = subprocess.run([sys.executable, "-B", str(project / "Tools/last_stand_combat_depth/measure_crowded_waves.py"), "--output", str(output)], capture_output=True, text=True, cwd=temp, timeout=120)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertTrue(output.is_file())
                    measured = json.loads(output.read_text())
                    self.assertEqual(measured["runs"], json.loads(crowded.read_text())["runs"])
                    self.assertEqual(measured["canonicalSourceHistoricalRawSha256"], canonical["sourceSha256"])
                    helper = "Tools/last_stand_test_runtime.py"
                    self.assertEqual(measured["executionHelperSource"]["historicalLfSha256"], BINDINGS["calibrated"]["inputs"][helper])
                    self.assertEqual(measured["executionHelperSource"]["observedRawSha256"], hashlib.sha256((project / helper).read_bytes()).hexdigest())
                    self.assertNotEqual(measured["executionHelperSource"]["observedLfSha256"], measured["executionHelperSource"]["historicalLfSha256"])
                    closure = crowded_measurement.SOURCE_CLOSURE_HELPER
                    self.assertEqual(measured["executionSourceClosure"]["historicalLfSha256"], BINDINGS["calibrated"]["inputs"][closure])
                    self.assertEqual(measured["executionSourceClosure"]["observedRawSha256"], hashlib.sha256((project / closure).read_bytes()).hexdigest())
                    self.assertEqual(measured["executionSourceClosure"]["observedLfSha256"], crowded_measurement.CURRENT_SOURCE_CLOSURE_LF_SHA)
                    self.assertEqual(measured["executionSourceClosure"]["measuredPaths"], sorted(rel for rel in canonical["sourceSha256"] if rel.endswith(".cs")))
                    self.assertNotEqual(measured["executionSourceClosure"]["observedLfSha256"], measured["executionSourceClosure"]["historicalLfSha256"])
            runner = str(project / "Tools/last_stand_combat_depth/measure_crowded_waves.py")
            reference_bytes = {p: p.read_bytes() for p in (copied_report, copied_crowded)}
            alias = project / "owned-reference-hardlink.json"
            os.link(copied_crowded, alias)
            for target in (copied_report, copied_crowded, alias,
                           copied_report.parent / "combat-balance-baseline-report.json",
                           copied_report.parent / "crowded-wave-baseline-report.json"):
                result = subprocess.run([sys.executable, "-B", runner, "--output", str(target)],
                                        capture_output=True, text=True, cwd=temp, timeout=30)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("immutable measurement reference", result.stderr)
                self.assertTrue(all(p.read_bytes() == raw for p, raw in reference_bytes.items()))
            result = subprocess.run([sys.executable, "-B", runner], capture_output=True, text=True, cwd=temp, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("--output", result.stderr)
            helper = project / "Tools/last_stand_test_runtime.py"
            helper_bytes = helper.read_bytes()
            for fault, expected_error in (("helper-drift", "sources/toolchain/canonical report changed"),
                                          ("closure-drift", "sources/toolchain/canonical report changed"),
                                          ("role-metrics", "complete frozen crowded outcomes")):
                output = Path(temp) / (fault + ".json")
                injection = """
import json, pathlib, subprocess, sys
sys.path.insert(0, sys.argv[1])
import measure_crowded_waves as m
original = m.run_csharp
def observed(*args, **kwargs):
    result = original(*args, **kwargs)
    if sys.argv[3] in ('helper-drift', 'closure-drift'):
        helper = m.PROJECT / (m.EXECUTION_HELPER if sys.argv[3] == 'helper-drift' else m.SOURCE_CLOSURE_HELPER)
        helper.write_bytes(helper.read_bytes() + b'\\n# owned drift discriminator\\n')
    else:
        data = json.loads(result.stdout)
        data['runs'][0]['waves'][0]['roleEffects']['mortarAdditionalTargets'] += 1
        result = subprocess.CompletedProcess(result.args, result.returncode, json.dumps(data), result.stderr)
    return result
m.run_csharp = observed
m.measure(pathlib.Path(sys.argv[2]))
"""
                result = subprocess.run([sys.executable, "-B", "-c", injection, str(Path(runner).parent), str(output), fault],
                                        capture_output=True, text=True, cwd=temp, timeout=120)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected_error, result.stderr)
                self.assertFalse(output.exists(), "Rejected execution cannot publish a report")
                helper.write_bytes(helper_bytes)
                (project / crowded_measurement.SOURCE_CLOSURE_HELPER).write_bytes((PROJECT / crowded_measurement.SOURCE_CLOSURE_HELPER).read_bytes().replace(b"\r\n", b"\n"))
            changed = project / "Unity/Assets/Scripts/EncounterModel.cs"
            changed.write_bytes(changed.read_bytes() + b"\n// different source\n")
            result = subprocess.run([sys.executable, "-B", runner, "--output", str(Path(temp) / "refused-source.json")], capture_output=True, text=True, cwd=temp, timeout=30)
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
