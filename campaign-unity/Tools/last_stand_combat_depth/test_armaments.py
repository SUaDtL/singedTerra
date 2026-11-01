"""Actual armament mechanics; bounded seeded cases do not claim earned progression."""
from pathlib import Path
import hashlib
import json
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import CSC, MONO, compile_csharp, run_csharp


class ArmamentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="st-armaments-")
        cls.exe = Path(cls.temp.name) / "ArmamentChecks.exe"
        scripts = TOOLS.parent / "Unity/Assets/Scripts"
        cls.build = compile_csharp(cls.exe, complete_sources(scripts, [scripts / "LastStandRunCheckpoint.cs"]) +
                                  [Path(__file__).with_name("ArmamentChecks.cs")], warnings_as_errors=True)
        print("SOURCE_BINDING " + json.dumps({"sources": cls.build.source_sha256,
            "tools": {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)}}, sort_keys=True), flush=True)

    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name], timeout_seconds=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_mortar_hits_each_target_once(self): self.case("mortar")
    def test_mortar_paid_projection_covers_its_calibrated_area(self): self.case("mortar-calibration")
    def test_current_scatter_interception_preserves_every_retained_range(self): self.case("scatter-interception")
    def test_railgun_penetration_and_old_weapon_mitigation(self): self.case("railgun")
    def test_new_weapon_timing_and_paid_projection_resume(self): self.case("checkpoint")
    def test_integer_geometry_edges_symmetry_and_maximum_distance(self): self.case("geometry")
    def test_mortar_dead_center_keeps_aim_and_unique_kill_identities(self): self.case("center-death")
    def test_railgun_priority_uses_armor_then_distance_then_id(self): self.case("priority")
    def test_new_auxiliary_cadence_is_exactly_sixty_ticks(self): self.case("cadence")
    def test_inactive_armament_timers_remain_neutral_on_restore(self): self.case("inactive-timer")
    def test_inactive_armament_damage_remains_neutral_on_restore(self): self.case("inactive-damage")
    def test_unfired_armament_cannot_change_initial_timer(self): self.case("unfired")
    def test_checkpoint_rejects_impossible_armament_shot_count(self): self.case("shot-count")
    def test_checkpoint_rejects_impossible_armament_cadence_timer(self): self.case("shot-timer")
