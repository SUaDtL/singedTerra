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


if __name__ == '__main__':
    unittest.main()
