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
import subprocess
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
        for name in ('unity_shader_log.py', 'unity_build_resources.py'):
            shutil.copyfile(SCRIPT.with_name(name), self.script.with_name(name))
        self.editor = self.root / 'editor/Unity.exe'
        self.editor.parent.mkdir()
        self.editor.write_bytes(b'controlled editor fixture')
        (self.editor.parent / 'Data/PlaybackEngines/WebGLSupport').mkdir(parents=True)
        self.project = self.root / 'Unity'
        for name in ('FieldAssembly', 'BattlefieldReview'):
            self.write('Assets/Scenes/' + name + '.unity', 'saved ' + name)
        self.write('Assets/PartsLibrary/PartsGallery.unity', 'saved PartsGallery')
        self.write('Assets/Scripts/Model.cs', 'unchanged rules')
        self.write('ProjectSettings/GraphicsSettings.asset', 'fixture settings')
        self.write('Packages/com.unity.render-pipelines.universal/package.json', '{"version":"17.3.0"}')
        self.write('Packages/manifest.json', '{"dependencies":{}}')
        self.commands = []
        self.change_source = False
        self.review_marker = True
        self.gallery_marker = True
        self.performance_resources = False
        self.fail_player = False
        self.unconfirmed_exit = False

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
                    stdout.write(b'6000.3.27f2\n')
                elif '-executeMethod' in command:
                    if owner.performance_resources:
                        for name in ('PerformanceTestRunInfo.json', 'PerformanceTestRunSettings.json'):
                            owner.write('Assets/Resources/' + name, '{}')
                            owner.write('Assets/Resources/' + name + '.meta', 'generated meta')
                        if not (owner.project / 'Assets/Resources.meta').exists():
                            owner.write('Assets/Resources.meta', 'generated folder meta')
                    build = Path(env['ST_ART_WEB_OUTPUT'])
                    build.mkdir(parents=True)
                    (build / 'index.html').write_text('<html><head></head></html>', encoding='utf-8')
                    (build / 'player.wasm').write_bytes(b'controlled build fixture')
                    stdout.write(b'ST_ART_WEB_BUILD_PASS\nST_ENC_MODEL_PASS\n')
                    if owner.review_marker:
                        stdout.write(b'ST_VIS_VALIDATE_PASS\nST_VIS_CHECKS_PASS\nST_VIS_WEB_BUILD_PASS\n')
                    if owner.gallery_marker:
                        stdout.write(b'ST_KIT_GALLERY_PASS\nST_KIT_GALLERY_WEB_BUILD_PASS\n')
                    if owner.change_source:
                        owner.write('Assets/Scripts/Model.cs', 'changed while building')

            def wait(self, timeout):
                if owner.unconfirmed_exit and '-executeMethod' in owner.commands[-1]:
                    raise subprocess.TimeoutExpired(owner.commands[-1], timeout)
                return 1 if owner.fail_player and '-executeMethod' in owner.commands[-1] else 0

            def terminate(self):
                pass

            def kill(self):
                pass

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

    def test_performance_outputs_are_restored_before_source_readback(self):
        self.performance_resources = True
        failure, receipt = self.execute()
        self.assertIsNone(failure, 'Owned framework outputs must be removed before source readback')
        self.assertFalse((self.project / 'Assets/Resources').exists())
        self.assertFalse((self.project / 'Assets/Resources.meta').exists())
        self.assertEqual(receipt['source_before'], receipt['source_after'])

    def test_failed_player_cleans_only_owned_performance_outputs(self):
        self.performance_resources = True
        self.fail_player = True
        self.write('Assets/Resources/keep.txt', 'owner asset')
        self.write('Assets/Resources.meta', 'owner folder meta')
        failure, receipt = self.execute()
        self.assertIsNotNone(failure)
        self.assertEqual(receipt['status'], 'failed')
        self.assertEqual((self.project / 'Assets/Resources/keep.txt').read_text(), 'owner asset')
        self.assertEqual((self.project / 'Assets/Resources.meta').read_text(), 'owner folder meta')
        self.assertFalse((self.project / 'Assets/Resources/PerformanceTestRunInfo.json').exists(),
                         'Failed Unity must not leave owned generated inputs')

    def test_existing_performance_resource_is_refused_before_player(self):
        self.write('Assets/Resources/PerformanceTestRunInfo.json', 'owner data')
        failure, receipt = self.execute()
        self.assertIsNotNone(failure, 'Framework would overwrite and delete pre-existing data')
        self.assertFalse(any('-executeMethod' in c for c in self.commands))
        self.assertEqual((self.project / 'Assets/Resources/PerformanceTestRunInfo.json').read_text(), 'owner data')

    def test_unconfirmed_child_exit_preserves_resources_and_failed_receipt(self):
        self.performance_resources = True
        self.unconfirmed_exit = True
        failure, receipt = self.execute()
        self.assertIsNotNone(failure)
        self.assertIn('exit unconfirmed', str(failure))
        self.assertEqual(receipt['performanceResources']['status'], 'failed')
        self.assertEqual(receipt['activeUnityChild'], 54321)
        self.assertTrue((self.project / 'Assets/Resources/PerformanceTestRunInfo.json').exists())

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

    def test_gallery_exports_separate_saved_scene_with_its_own_checks(self):
        failure, receipt = self.execute('gallery')
        self.assertIsNone(failure)
        command = next(c for c in self.commands if '-executeMethod' in c)
        self.assertEqual(command[command.index('-executeMethod') + 1], 'PartsGalleryBuild.BuildWeb')
        self.assertEqual(receipt['scene'], 'Assets/PartsLibrary/PartsGallery.unity')
        self.assertEqual(receipt['scene_before'], receipt['scene_after'])

    def test_gallery_requires_its_own_fresh_checks(self):
        self.gallery_marker = False
        failure, receipt = self.execute('gallery')
        self.assertIsNotNone(failure)
        self.assertEqual(receipt['status'], 'failed')
        self.assertIn('gallery', receipt['error'].lower())

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




"""Complete export-input closure regression controls, without launching Unity."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

# Import the guarded production module, then supply the isolated fixture roots.
def build_definitions(root):
    path = Path(__file__).with_name('build_web.py')
    spec = importlib.util.spec_from_file_location('build_web_fixture', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = root
    module.PROJECT = root / 'Unity'
    return vars(module)

class BuildWebTests(unittest.TestCase):
    def test_complete_source_closure_before_and_after_export(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'campaign-unity'
            for name, data in {'Unity/Assets/model.cs': b'one\r\n',
                               'Unity/Assets/image.png': b'\x89PNG\x00\r\n',
                               'Unity/ProjectSettings/settings.asset': b'settings',
                               'Unity/Packages/manifest.json': b'{}',
                               'Unity/Packages/com.unity.render-pipelines.universal/Shader.shader': b'shader',
                               'Tools/build_web.py': b'tool', 'Tools/unity_shader_log.py': b'shader helper',
                               'Tools/unity_build_resources.py': b'resource owner',
                               'Tools/make_web_entry.py': b'wrapper', 'Tools/web-index-template.html': b'template'}.items():
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
            scope = build_definitions(root)
            with patch.object(subprocess, 'check_output', return_value=b'head'):
                before = scope['source_binding']()
                vendor = 'Unity/Packages/com.unity.render-pipelines.universal/Shader.shader'
                self.assertIn(vendor, before['files'], 'Complete closure must inventory ignored package bodies')
                (root / vendor).write_text('changed shader')
                after = scope['source_binding']()
                self.assertNotEqual(before['sha256'], after['sha256'])
                (root / 'Unity/Packages/extra.txt').write_text('unexpected')
                self.assertNotEqual(after['sha256'], scope['source_binding']()['sha256'])
                self.assertEqual(before['closure']['files']['Unity/Assets/model.cs']['mode'], 'lf-text')
                self.assertEqual(before['closure']['files']['Unity/Assets/image.png']['mode'], 'raw')
                text = root / 'Unity/Assets/model.cs'
                text.write_bytes(b'one\n')
                self.assertEqual(before['closure']['files']['Unity/Assets/model.cs'],
                                 scope['source_binding']()['closure']['files']['Unity/Assets/model.cs'])
                self.assertIn('Tools/unity_build_resources.py', before['closure']['explicitFiles'])
                (root / 'Tools/unity_build_resources.py').unlink()
                with self.assertRaisesRegex(RuntimeError, 'Missing export tool'):
                    scope['source_binding']()


    def test_toolchain_inventory_rejects_changed_and_added_module_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            editor = root / 'Editor/Unity.exe'
            files = {'Editor/Unity.exe': b'editor',
                     'Editor/Data/PlaybackEngines/WebGLSupport/compiler.bin': b'compiler',
                     'Editor/Data/Resources/PackageManager/BuiltInPackages/com.unity.render-pipelines.universal/package.json': b'{"version":"17.3.0"}'}
            for name, data in files.items():
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
            scope = build_definitions(root)
            collect = scope.get('toolchain_binding', lambda editor: {})
            before = collect(editor)
            self.assertIn('Editor/Data/PlaybackEngines/WebGLSupport/compiler.bin', before.get('files', {}),
                          'Export toolchain must inventory actual WebGL module bytes')
            (root / 'Editor/Data/PlaybackEngines/WebGLSupport/compiler.bin').write_bytes(b'drift')
            self.assertNotEqual(before, collect(editor))
            (root / 'Editor/Data/PlaybackEngines/WebGLSupport/added.bin').write_bytes(b'new')
            self.assertNotEqual(before, collect(editor))


class BuildResourceSafety(unittest.TestCase):
    def test_unknown_new_assets_are_preserved_and_cleanup_fails(self):
        from unity_build_resources import PerformanceResources
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary)
            (project / 'Assets').mkdir()
            with self.assertRaisesRegex(RuntimeError, 'Unexpected assets'):
                with PerformanceResources(project):
                    (project / 'Assets/Resources/unknown.txt').write_text('preserve')
                    (project / 'Assets/Resources.meta').write_text('preserve meta')
            self.assertEqual((project / 'Assets/Resources/unknown.txt').read_text(), 'preserve')
            self.assertEqual((project / 'Assets/Resources.meta').read_text(), 'preserve meta')

    def test_original_folder_meta_is_restored_exactly(self):
        from unity_build_resources import PerformanceResources
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary)
            (project / 'Assets/Resources').mkdir(parents=True)
            meta = project / 'Assets/Resources.meta'
            meta.write_bytes(b'original\r\n')
            with PerformanceResources(project) as owner:
                meta.write_bytes(b'changed')
            self.assertEqual(meta.read_bytes(), b'original\r\n')
            self.assertTrue(owner.receipt['restoredMeta'])

    def test_nonregular_reserved_resource_is_refused(self):
        from unity_build_resources import PerformanceResources
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary)
            path = project / 'Assets/Resources/PerformanceTestRunInfo.json'
            path.mkdir(parents=True)
            with self.assertRaisesRegex(RuntimeError, 'Unexpected build-resource type'):
                with PerformanceResources(project):
                    self.fail('Must not enter with a non-regular reserved path')
            self.assertTrue(path.is_dir())

    def test_linked_resources_never_reach_outside_files(self):
        from unity_build_resources import PerformanceResources
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary) / 'project'
            (project / 'Assets').mkdir(parents=True)
            outside = Path(temporary) / 'outside'
            outside.mkdir()
            sentinel = outside / 'PerformanceTestRunInfo.json'
            sentinel.write_text('preserve outside')
            link = project / 'Assets/Resources'
            if os.name == 'nt':
                result = subprocess.run(['cmd.exe', '/c', 'mklink', '/J', str(link), str(outside)],
                                        capture_output=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
            else:
                link.symlink_to(outside, target_is_directory=True)
            try:
                with self.assertRaisesRegex(RuntimeError, 'Linked build-resource path'):
                    with PerformanceResources(project):
                        self.fail('Must not follow linked Resources')
                self.assertEqual(sentinel.read_text(), 'preserve outside')
            finally:
                if os.name == 'nt':link.rmdir()
                else:link.unlink()



if __name__ == '__main__':
    unittest.main()
