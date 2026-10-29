"""Exercise actual audio routing and synthesis with a bounded Unity API double.

Run: C:/Python314/python.exe -B -m unittest discover -s campaign-unity/Tools/last_stand_controls -p test_audio_settings.py -v
No Unity Editor or audio device is started. Rendered/browser audio needs separate checks.
"""
from pathlib import Path
import re
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp

PROJECT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT / "Unity/Assets/Scripts"


class AudioSettingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-audio-settings-")
        cls.executable = Path(cls.output.name) / "AudioSettingsChecks.exe"
        sources = complete_sources(SCRIPTS, [SCRIPTS / name for name in (
            "LastStandAudio.cs", "LastStandMusic.cs", "LastStandPreferences.cs", "LastStandStore.cs",
            "LastStandRunClock.cs", "LastStandSpeedPolicy.cs", "EncounterModel.cs", "LastStandProgression.cs")])
        # Exercise the actual controller call site and admission owner without
        # importing Unity UI. Only platform/session inputs are bounded doubles.
        controller = (SCRIPTS / "LastStandLoopController.cs").read_text(encoding="utf-8-sig")
        def method(name):
            marker = "        void " + name + "("
            if controller.count(marker) != 1:
                raise AssertionError("Actual caller seam moved: " + name)
            start = controller.index(marker)
            brace = controller.index("{", start)
            depth, end = 1, brace + 1
            while depth:
                depth += (controller[end] == "{") - (controller[end] == "}")
                end += 1
            return controller[start:end].replace("        void ", "        public void ", 1)
        constants = re.findall(r"const double MaximumForegroundFeedbackInterval = [^;]+;", controller)
        if len(constants) != 1:
            raise AssertionError("Actual admission interval seam moved")
        caller = Path(cls.output.name) / "ActualAudioCaller.cs"
        caller.write_text("using SingedTerra.LastStand; using SingedTerra.Encounter;\n"
                          "public partial class ActualAudioCaller {\n" + constants[0] + "\n" +
                          method("OnSessionStepped") + "\n" + method("SyncAudioAdmission") + "\n}\n", encoding="utf-8")
        compile_csharp(cls.executable, sources + [Path(__file__).with_name("AudioSettingsChecks.cs"), caller], warnings_as_errors=True)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = run_csharp(self.executable, [name], timeout_seconds=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_each_combat_cue_uses_its_own_fresh_playback_boundary(self):
        self.case("each_combat_cue_uses_its_own_fresh_playback_boundary")

    def test_playback_boundary_clocks_preparation_and_diagnostics(self):
        self.case("playback_boundary_clocks_preparation_and_diagnostics")

    def test_existing_effect_admission(self):
        self.case("existing_effect_admission")

    def test_scattergun_feedback_and_holds(self):
        self.case("scattergun_feedback_and_holds")

    def test_initialize_does_not_duplicate_sources(self):
        self.case("initialize_does_not_duplicate_sources")

    def test_master_and_channel_gains_change_active_sources(self):
        self.case("master_and_channel_gains_change_active_sources")

    def test_music_requires_gesture_and_ignores_combat_pause(self):
        self.case("music_requires_gesture_and_ignores_combat_pause")

    def test_visibility_and_failure_stop_without_effect_replay(self):
        self.case("visibility_and_failure_stop_without_effect_replay")

    def test_effect_preview_requires_a_live_gesture_context(self):
        self.case("effect_preview_requires_a_live_gesture_context")

    def test_music_is_deterministic_bounded_and_seamless(self):
        self.case("music_is_deterministic_bounded_and_seamless")

    def test_music_transition_uses_unscaled_time_and_normal_pitch(self):
        self.case("music_transition_uses_unscaled_time_and_normal_pitch")

    def test_new_weapons_have_distinct_finite_cues(self): self.case("new_weapon_cues")
    def test_mortar_batch_is_one_firing_and_aggregate_impact(self): self.case("mortar_batch")
    def test_new_batch_keeps_freshness_holds_and_no_replay(self): self.case("batch_holds")
    def test_actual_step_batches_audio_without_suppressing_hit_telemetry(self): self.case("actual_caller")
    def test_generated_new_clips_and_sources_are_released(self): self.case("cleanup")
    def test_invalid_blast_batch_cannot_mutate_voices(self): self.case("invalid_batch")
