"""Execute read-only history decisions against actual production C# sources."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import compile_csharp, run_csharp

SCRIPTS = Path(__file__).resolve().parents[2] / "Unity/Assets/Scripts"
CHECKS = Path(__file__).with_name("HistoryComparisonChecks.cs")


class HistoryComparisonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-history-comparison-")
        cls.executable = Path(cls.output.name) / "HistoryComparisonChecks.exe"
        result = compile_csharp(cls.executable, [SCRIPTS / "LastStandRunHistory.cs",
            SCRIPTS / "LastStandHistoryComparison.cs", CHECKS], warnings_as_errors=True, timeout_seconds=60)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Actual-source compilation failed:\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = run_csharp(self.executable, [name], timeout_seconds=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_exact_conditions_and_normalized_speed(self): self.case("cohort_identity")
    def test_legacy_short_and_provisional_exclusions(self): self.case("eligibility")
    def test_minimum_samples_and_per_tier_medians(self): self.case("tier_medians")
    def test_mixed_edition_median_is_withheld(self): self.case("mixed_conditions")
    def test_pair_rates_and_condition_differences(self): self.case("pair_differences")
    def test_pair_measurement_limits(self): self.case("pair_limits")
    def test_signed_cleared_wave_deltas_and_boundaries(self): self.case("pair_wave_deltas")
    def test_projection_never_mutates_history(self): self.case("projection_only")

    def negative_control(self, before, after, case, expected):
        original = (SCRIPTS / "LastStandHistoryComparison.cs").read_text(encoding="utf-8")
        self.assertEqual(original.count(before), 1)
        with tempfile.TemporaryDirectory(prefix="st-history-comparison-fault-") as folder:
            altered = Path(folder) / "LastStandHistoryComparison.cs"
            altered.write_text(original.replace(before, after), encoding="utf-8")
            executable = Path(folder) / "HistoryComparisonFault.exe"
            compile_csharp(executable, [SCRIPTS / "LastStandRunHistory.cs", altered, CHECKS],
                           warnings_as_errors=True, timeout_seconds=60)
            result = run_csharp(executable, [case], timeout_seconds=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(expected, result.stderr)

    def test_negative_control_two_sample_median(self):
        self.negative_control("MinimumSamples=3", "MinimumSamples=2", "eligibility",
                              "two samples never produce meaningful median")

    def test_negative_control_mixed_edition_pooling(self):
        self.negative_control("String.Equals(Anchor.EconomyVersion,run.EconomyVersion,StringComparison.Ordinal)",
                              "true", "mixed_conditions", "unfiltered mixed editions withhold pooled median")

    def test_negative_control_provisional_rate(self):
        self.negative_control("run.Finalized&&!run.SinceUpdate", "!run.SinceUpdate", "pair_limits",
                              "short since-update provisional and zero-time deltas are withheld")
