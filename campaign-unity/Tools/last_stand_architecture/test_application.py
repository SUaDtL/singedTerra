from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp


class ApplicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix='st-application-')
        cls.exe = Path(cls.folder.name) / 'ApplicationChecks.exe'
        scripts = TOOLS.parent / 'Unity/Assets/Scripts'
        inputs = complete_sources(scripts, [scripts / 'Application/LastStandRunCoordinator.cs',
            scripts / 'Application/LastStandResearchCoordinator.cs'])
        compile_csharp(cls.exe, [*inputs, Path(__file__).with_name('ApplicationChecks.cs')])

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def case(self, name):
        result = run_csharp(self.exe, [name, Path(__file__).with_name('fixtures') / 'profile-v5-wave30.json'])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), 'PASS ' + name)

    def test_research_coordinator_confirms_once_after_uncertain_save(self):
        self.case('research')

    def test_run_coordinator_retries_wave_without_duplicate_rewards(self):
        self.case('wave')

    def test_suspend_resume_preserves_clock_and_checkpoint_semantics(self):
        self.case('host')
