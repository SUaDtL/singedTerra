"""Behavioral checks compile the real catalog/state/clock with pinned Roslyn.

Optional ST_RESEARCH_FAULT creates a temporary mutation for negative controls;
it never changes the production source or launches the Unity editor.
"""
from pathlib import Path
import os
import sys
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT / "Unity/Assets/Scripts"
sys.path.insert(0, str(PROJECT / "Tools"))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class ResearchEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-research-")
        cls.exe = Path(cls.output.name) / "ResearchEngineChecks.exe"
        names = ["LastStandResearchCatalog.cs", "LastStandResearchClock.cs", "LastStandResearchState.cs"]
        sources = [SCRIPTS / name for name in names]
        fault = os.environ.get("ST_RESEARCH_FAULT")
        if fault:
            faults = {
                "self-acceleration": (names[0], "if (Id == LastStandResearchTrackId.ResearchSpeed) return duration;", "// Negative control: incorrectly boost own timer."),
                "lost-switch-progress": (names[2], "if (partial != null) { project = partial; next.partials[(int)intent.Track] = null; }", "if (partial != null) { project = partial; project.earnedMilliseconds = 0; next.partials[(int)intent.Track] = null; }"),
                "wall-clock-open": (names[1], "Math.Max(0, monotonicSeconds - anchor) * 1000 + fraction", "Math.Max(0, utcMilliseconds - observedUtc) + fraction"),
                "slot-order-bonus": (names[2], "slot.active = null;\n                }\n                foreach", "slot.active = null; if (slot.queued != null) Promote(next, slot);\n                }\n                foreach"),
            }
            if fault not in faults:
                raise AssertionError("Unknown mutation")
            name, before, after = faults[fault]
            original = SCRIPTS / name
            source = original.read_text(encoding="utf-8")
            if source.count(before) != 1:
                raise AssertionError("Mutation requires exact unique source")
            replacement = Path(cls.output.name) / name
            replacement.write_text(source.replace(before, after), encoding="utf-8")
            sources[sources.index(original)] = replacement
        try:
            compile_csharp(cls.exe, complete_sources(SCRIPTS, sources) + [Path(__file__).with_name("ResearchEngineChecks.cs")])
        except Exception:
            cls.output.cleanup()
            raise

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def check(self, case):
        result = run_csharp(self.exe, [case], timeout_seconds=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + case)

    def test_catalog_and_reward_remainders(self): self.check("catalog")
    def test_unlock_funding_and_noops(self): self.check("funding")
    def test_four_prepaid_offline_completions(self): self.check("offline")
    def test_simultaneous_completion_before_queue_start(self): self.check("simultaneous")
    def test_started_partial_and_queued_duration_ownership(self): self.check("duration_locks")
    def test_switch_refund_resume_and_locked_duration(self): self.check("switch")
    def test_switch_queue_validity_and_atomic_affordability(self): self.check("queue_switch")
    def test_suspended_queued_partial_retains_progress(self): self.check("partial_queue")
    def test_snapshot_validation_and_copy_isolation(self): self.check("validation")
    def test_clock_monotonic_open_and_retry(self): self.check("clock")
    def test_clock_closed_rollback_bounds_and_fraction(self): self.check("clock_edges")
