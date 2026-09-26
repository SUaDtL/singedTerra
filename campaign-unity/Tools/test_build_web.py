"""ST-VIS-01 saved-scene build routing and source receipt contract.

Run: python -m unittest discover -s campaign-unity/Tools -p test_build_web.py -v
The editor process is a controlled fixture; these are not Unity build passes.
"""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import shutil
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name('build_web.py')


class SavedBuildContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'campaign-unity'
        (self.root / 'Tools').mkdir(parents=True)
        self.script = self.root / 'Tools/build_web.py'
        shutil.copyfile(SCRIPT, self.script)
        self.editor = self.root / 'editor/Unity.exe'
        self.editor.parent.mkdir()
        self.editor.write_bytes(b'controlled editor fixture')
        (self.editor.parent / 'Data/PlaybackEngines/WebGLSupport').mkdir(parents=True)
        self.project = self.root / 'Unity'
        for name in ('FieldAssembly', 'BattlefieldReview'):
            self.write('Assets/Scenes/' + name + '.unity', 'saved ' + name)
        self.write('Assets/Scripts/Model.cs', 'unchanged rules')
        self.write('Packages/com.unity.render-pipelines.universal/package.json', '{"version":"17.3.0"}')
        self.write('Packages/manifest.json', '{"dependencies":{}}')
        self.commands = []
        self.change_source = False
        self.review_marker = True

    def write(self, relative, value):
        path = self.project / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding='utf-8')

    def execute(self, scene=None):
        owner = self

        class Child:
            pid = 54321

            def __init__(self, command, cwd, env, stdout, stderr):
                owner.commands.append(command)
                if '-version' in command:
                    stdout.write(b'6000.3.24f1\n')
                elif '-executeMethod' in command:
                    build = Path(env['ST_ART_WEB_OUTPUT'])
                    build.mkdir(parents=True)
                    (build / 'index.html').write_text('<html><head></head></html>', encoding='utf-8')
                    (build / 'player.wasm').write_bytes(b'controlled build fixture')
                    stdout.write(b'ST_ART_WEB_BUILD_PASS\nST_ENC_MODEL_PASS\n')
                    if owner.review_marker:
                        stdout.write(b'ST_VIS_VALIDATE_PASS\nST_VIS_CHECKS_PASS\nST_VIS_WEB_BUILD_PASS\n')
                    if owner.change_source:
                        owner.write('Assets/Scripts/Model.cs', 'changed while building')

            def wait(self, timeout):
                return 0

        argv = [str(self.script), '--editor', str(self.editor)]
        if scene is not None:
            argv += ['--scene', scene]
        failure = None
        with patch('sys.argv', argv), patch('subprocess.Popen', Child), \
                patch('subprocess.check_output', return_value=b'fixture-head\n'), \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            try:
                runpy.run_path(str(self.script), run_name='__main__')
            except (RuntimeError, SystemExit) as error:
                failure = error
        receipts = list((self.root / 'Evidence').glob('build-*/result.json'))
        receipt = json.loads(receipts[0].read_text(encoding='utf-8')) if receipts else None
        return failure, receipt

    def test_default_exports_legacy_saved_scene(self):
        failure, receipt = self.execute()
        self.assertIsNone(failure)
        command = next(c for c in self.commands if '-executeMethod' in c)
        self.assertEqual(command[command.index('-executeMethod') + 1], 'SceneBuild.BuildWeb')
        self.assertEqual(receipt['scene_before'], receipt['scene_after'])

    def test_review_exports_saved_scene_with_source_binding(self):
        failure, receipt = self.execute('review')
        self.assertIsNone(failure, 'explicit review scene route must be accepted')
        command = next(c for c in self.commands if '-executeMethod' in c)
        self.assertEqual(command[command.index('-executeMethod') + 1], 'VisualReviewBuild.BuildWeb')
        self.assertEqual(receipt['scene'], 'Assets/Scenes/BattlefieldReview.unity')
        self.assertEqual(receipt['source_before'], receipt['source_after'])
        inputs = receipt['source_before']['files']
        self.assertEqual(inputs['Unity/Assets/Scripts/Model.cs'],
                         hashlib.sha256(b'unchanged rules').hexdigest())
        self.assertIn('player.wasm', receipt['artifacts'])

    def test_legacy_also_binds_source_and_rejects_midbuild_mutation(self):
        self.change_source = True
        failure, receipt = self.execute()
        self.assertIsNotNone(failure, 'a receipt cannot bind changed source to earlier output')
        self.assertEqual(receipt['status'], 'failed')
        self.assertIn('source', receipt['error'].lower())

    def test_review_requires_its_own_fresh_checks(self):
        self.review_marker = False
        failure, receipt = self.execute('review')
        self.assertIsNotNone(failure)
        self.assertIsNotNone(receipt, 'route must start and retain a failed receipt')
        self.assertEqual(receipt['status'], 'failed')
        self.assertIn('review', receipt['error'].lower())

    def test_unknown_scene_is_refused_before_editor_launch(self):
        failure, receipt = self.execute('typo')
        self.assertIsInstance(failure, SystemExit)
        self.assertIsNone(receipt)
        self.assertEqual(self.commands, [])


if __name__ == '__main__':
    unittest.main()
