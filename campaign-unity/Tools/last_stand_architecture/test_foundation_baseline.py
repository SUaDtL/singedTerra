"""Frozen production observations; the assertion oracle is never regenerated here.

The stored v5 save is an input for compatibility checks. Observations use public
domain values rather than serialization layout or code-text snapshots. The
capture tool is explicit and pinned to the pre-foundation Git commit.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp

SCRIPTS = TOOLS.parent / "Unity/Assets/Scripts"
FIXTURES = Path(__file__).with_name("fixtures")
HARNESS = Path(__file__).with_name("FoundationBaselineChecks.cs")
BASELINE = "07dc13c0ea0b31af973b24402ea9bdedfb8cc815"


def sources(root=SCRIPTS):
    return complete_sources(root, [root / "LastStandProgression.cs"])


def compile_harness(target, inputs):
    compile_csharp(target, [*inputs, HARNESS], warnings_as_errors=True, timeout_seconds=60)


def observe(executable, mode="verify", save=None):
    result = run_csharp(executable, [mode, save or FIXTURES / "profile-v5-wave30.json"], timeout_seconds=120)
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    return result.stdout.splitlines()


class FoundationBaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((FIXTURES / "baseline.json").read_text(encoding="utf-8"))
        if cls.fixture["source_commit"] != BASELINE:
            raise AssertionError("Pre-foundation source identity changed")
        save = (FIXTURES / "profile-v5-wave30.json").read_bytes()
        if hashlib.sha256(save).hexdigest() != cls.fixture["save_sha256"]:
            raise AssertionError("Frozen compatibility input changed")
        cls.output = tempfile.TemporaryDirectory(prefix="st-foundation-")
        cls.exe = Path(cls.output.name) / "FoundationChecks.exe"
        compile_harness(cls.exe, sources())

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def test_refactor_preserves_frozen_model_and_save_fixtures(self):
        self.assertEqual(observe(self.exe), self.fixture["verification_observations"])
        # Fresh runs also reproduce the same deterministic wave trace; the
        # serialized output is disposable and cannot overwrite the frozen save.
        generated = Path(self.output.name) / "current-wave30.json"
        self.assertEqual(observe(self.exe, "capture", generated), self.fixture["capture_observations"])

    def test_frozen_fixture_rejects_reward_drift(self):
        # Execute a deliberately faulty production calculation, not a mocked
        # observation or a mutation of the expected fixture.
        inputs = sources()
        original = next(path for path in inputs if path.name == "LastStandEconomyCatalog.cs")
        raw = original.read_text(encoding="utf-8-sig")
        expression = "return checked(3+Math.Min(wave,200)/10+Math.Max(wave-200,0)/20);"
        self.assertEqual(raw.count(expression), 1, "Update this fault injection if the calculation moves")
        altered = Path(self.output.name) / "LastStandEconomyCatalog.cs"
        altered.write_text(raw.replace(expression, expression.replace("checked(3+", "checked(4+")), encoding="utf-8")
        inputs[inputs.index(original)] = altered
        broken = Path(self.output.name) / "FaultyReward.exe"
        compile_harness(broken, inputs)
        # The changed reward may either invalidate the retained ledger on load
        # or produce different observable rewards. Both must reject parity.
        try:
            actual = observe(broken)
        except AssertionError:
            return
        with self.assertRaises(AssertionError):
            self.assertEqual(actual, self.fixture["verification_observations"])
