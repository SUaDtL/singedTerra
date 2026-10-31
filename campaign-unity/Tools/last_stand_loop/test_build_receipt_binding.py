"""A reused Web export must still match every inventoried current source file."""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import hashlib
import json
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
sys.dont_write_bytecode = True

import verify_last_stand_loop as verifier


class BuildReceiptBindingTests(unittest.TestCase):
    def test_changed_package_manifest_invalidates_reused_export(self):
        with tempfile.TemporaryDirectory(prefix='st-receipt-binding-') as temporary:
            root = Path(temporary) / 'campaign-unity'
            package = root / 'Unity/Packages/manifest.json'
            package.parent.mkdir(parents=True)
            original = b'{"dependencies":{}}'
            package.write_bytes(b'{"dependencies":{"changed":"1"}}')
            source = {'files': {'Unity/Packages/manifest.json': hashlib.sha256(original).hexdigest()}}
            build = root / 'Builds/Web-test'
            build.mkdir(parents=True)
            evidence = root / 'Evidence/last-stand-playable-loop/t03'
            receipt_dir = evidence / 'build-test'
            receipt_dir.mkdir(parents=True)
            receipt = receipt_dir / 'result.json'
            receipt.write_text(json.dumps({
                'status': 'pass', 'build': str(build),
                'scene': 'Assets/Scenes/LastStandPrototype.unity',
                'source_before': source, 'source_after': source,
                'scene_before': 'same', 'scene_after': 'same',
                'protected_scenes_before': {}, 'protected_scenes_after': {},
                'approved_artifacts': {'ST-LS-LOOP-SPEC': verifier.SPEC,
                                       'ST-LS-LOOP-PLAN': verifier.PLAN},
                'artifacts': {},
            }), encoding='utf-8')
            editor = root / 'Unity.exe'
            editor.write_bytes(b'editor')
            completed = SimpleNamespace(returncode=0, stdout='BUILD_EVIDENCE=' + str(receipt_dir), stderr='')
            with (patch.object(verifier, 'ROOT', root), patch.object(verifier, 'EVIDENCE', evidence),
                  patch.object(verifier, 'EDITOR', editor), patch.object(verifier.subprocess, 'run', return_value=completed),
                  patch.object(verifier, 'artifact_hashes', return_value={})):
                with self.assertRaisesRegex(ValueError, 'Current build source differs: Unity/Packages/manifest.json'):
                    verifier.build_once(root)

    def test_rejects_unexpected_package_file(self):
        import package_last_stand_web as packager
        import test_build_web
        with tempfile.TemporaryDirectory(prefix='st-package-closure-') as temporary:
            repo = Path(temporary)
            root = repo / 'campaign-unity'
            for name in ('build_web.py', 'unity_shader_log.py', 'unity_build_resources.py', 'make_web_entry.py', 'web-index-template.html'):
                path = root / 'Tools' / name; path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((TOOLS / name).read_bytes())
            for name, data in {'Unity/Assets/Scenes/LastStandPrototype.unity': b'saved',
                               'Unity/ProjectSettings/settings.asset': b'settings',
                               'Unity/Packages/manifest.json': b'{}',
                               'Unity/Packages/com.unity.render-pipelines.universal/package.json': b'{"version":"17.3.0"}',
                               'Unity/Packages/com.unity.render-pipelines.universal/Shader.shader': b'shader'}.items():
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
            scope = test_build_web.build_definitions(root)
            with patch.object(scope['subprocess'], 'check_output', return_value=b'head'):
                before = scope['source_binding']()
            # The receipt is complete before mutation; the extra package was never exported.
            (root/'Unity/Packages/unexpected.json').write_text('{}')
            build = root/'Builds/Web-fixture';(build/'Build').mkdir(parents=True)
            for suffix in ('loader.js','framework.js','data','wasm'):
                (build/'Build'/('game.'+suffix)).write_bytes(suffix.encode())
            (build/'index.html').write_text('<html></html>')
            artifacts={path.relative_to(build).as_posix():hashlib.sha256(path.read_bytes()).hexdigest()
                       for path in build.rglob('*') if path.is_file()}
            record={'schema':'singedterra-last-stand-build/v2','status':'pass','scene':'Assets/Scenes/LastStandPrototype.unity',
                    'build':str(build),'source_before':before,'source_after':before,'artifacts':artifacts,
                    'toolchain_before':{'editorVersion':'6000.3.27f2','urpVersion':'17.3.0','files':{'Unity.exe':{'mode':'raw','sha256':'a'*64}}},
                    'approved_artifacts':{},'stages':[{'stage':'unity-web','exit':0}],
                    'scene_before':'saved','scene_after':'saved','protected_scenes_before':{},'protected_scenes_after':{}}
            record['toolchain_after']=record['toolchain_before']
            receipt=root/'Evidence/build-fixture/result.json';receipt.parent.mkdir(parents=True);receipt.write_text(json.dumps(record))
            with patch('subprocess.check_output',return_value=b'head'), patch.object(packager,'__file__',str(root/'Tools/package_last_stand_web.py')), patch.object(sys,'argv',[str(root/'Tools/package_last_stand_web.py'),str(receipt)]):
                with self.assertRaisesRegex(SystemExit, 'source inventory|Current source|unexpected package'):
                    packager.main()

    def test_wrapper_refresh_preserves_original_export_pins(self):
        import package_last_stand_web as packager
        with tempfile.TemporaryDirectory(prefix='st-wrapper-refresh-') as temporary:
            repo=Path(temporary); root=repo/'campaign-unity'; build=root/'Builds/Web-fixture'
            (build/'Build').mkdir(parents=True); (build/'Build/game.wasm').write_bytes(b'wasm')
            (build/'index.html').write_text('original')
            destination=repo/'client/public/last-stand'; (destination/'Build').mkdir(parents=True)
            (destination/'Build/game.wasm').write_bytes(b'wasm'); (destination/'index.html').write_text('old wrapper')
            docs=root/'docs/last-stand-web'; docs.mkdir(parents=True)
            receipt=root/'Evidence/build-fixture/result.json'; receipt.parent.mkdir(parents=True)
            receipt.write_text('original raw receipt'); (receipt.parent/'staging-plan.json').write_text('original staging plan')
            binding={'closure':{'sha256':'a'*64,'files':{}},'wrapperFiles':{'Tools/make_web_entry.py':{'mode':'lf-text','sha256':'b'*64}}}
            editor=root/'Unity.exe';editor.write_bytes(b'editor')
            pin={'files':{'Unity.exe':{'mode':'raw','sha256':packager.digest(editor)}}}
            record={'schema':'singedterra-last-stand-build/v2','status':'pass','scene':'Assets/Scenes/LastStandPrototype.unity',
                    'build':str(build),'artifacts':packager.artifacts(build),'source_before':binding,'source_after':binding,
                    'editor':str(editor),'toolchain_before':pin,'toolchain_after':pin,'scene_before':'same','scene_after':'same',
                    'protected_scenes_before':{},'protected_scenes_after':{},'stages':[{'stage':'unity-web','exit':0}]}
            receipt.write_text(json.dumps(record))
            sanitized={'rawReceiptSha256':packager.digest(receipt)}
            (docs/'receipt-sanitized.json').write_text(json.dumps(sanitized)); (docs/'source-lock.json').write_text('{}')
            manifest={'source':{'receiptSha256':packager.digest(docs/'receipt-sanitized.json'),'sourceLockSha256':packager.digest(docs/'source-lock.json')},'files':{'Build/game.wasm':packager.digest(build/'Build/game.wasm')},'wrapperSha256':packager.digest(destination/'index.html')}
            (destination/'asset-manifest.json').write_text(json.dumps(manifest))
            preserved={path:path.read_bytes() for path in [receipt,receipt.parent/'staging-plan.json',docs/'receipt-sanitized.json',docs/'source-lock.json',build/'index.html',destination/'Build/game.wasm']}
            with (patch.object(packager,'source_binding',return_value=binding), patch.object(packager,'toolchain_binding',return_value=pin),
                  patch.object(packager,'render_web_entry',return_value='new wrapper'),
                  patch.object(packager,'__file__',str(root/'Tools/package_last_stand_web.py')),
                  patch.object(sys,'argv',['package_last_stand_web.py',str(receipt),'--refresh-wrapper'])):
                packager.main()
            self.assertEqual((destination/'index.html').read_text(),'new wrapper')
            refreshed=json.loads((destination/'asset-manifest.json').read_text())
            self.assertEqual(refreshed['source'],manifest['source']); self.assertEqual(refreshed['files'],manifest['files'])
            self.assertEqual(refreshed['wrapperFiles'],binding['wrapperFiles'])
            for path,data in preserved.items(): self.assertEqual(path.read_bytes(),data)
            self.assertEqual(len(list(receipt.parent.glob('wrapper-refresh-*.json'))),1)


if __name__ == '__main__':
    unittest.main()
