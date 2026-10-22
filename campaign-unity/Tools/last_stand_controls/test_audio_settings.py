"""Exercise actual audio routing and synthesis with a bounded Unity API double.

Run: C:/Python314/python.exe -B -m unittest discover -s campaign-unity/Tools/last_stand_controls -p test_audio_settings.py -v
No Unity Editor or audio device is started. Rendered/browser audio needs separate checks.
"""
from pathlib import Path
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
EDITOR = Path(r"C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1")
MONO = EDITOR / "Editor/Data/MonoBleedingEdge/bin/mono.exe"
CSC = EDITOR / "Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
SCRIPTS = PROJECT / "Unity/Assets/Scripts"


class AudioSettingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = tempfile.TemporaryDirectory(prefix="st-audio-settings-")
        cls.executable = Path(cls.output.name) / "AudioSettingsChecks.exe"
        sources = [SCRIPTS / name for name in ("LastStandAudio.cs", "LastStandPreferences.cs", "LastStandStore.cs")]
        sources.append(Path(__file__).with_name("AudioSettingsChecks.cs"))
        music = SCRIPTS / "LastStandMusic.cs"
        if music.exists():
            sources.append(music)
        command = [str(MONO), str(CSC), "-nologo", "-warnaserror+", f"-out:{cls.executable}"] + [str(p) for p in sources]
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8-sig", timeout=60)
        if result.returncode:
            cls.output.cleanup()
            raise AssertionError("Actual-source C# compilation failed (not behavioral RED):\n" + result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.output.cleanup()

    def case(self, name):
        result = subprocess.run([str(MONO), str(self.executable), name], capture_output=True,
                                text=True, encoding="utf-8-sig", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), "PASS " + name)

    def test_existing_effect_admission(self):
        self.case("existing_effect_admission")

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
