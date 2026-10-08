"""The authored Web entry keeps a usable way back from Last Stand."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


TOOLS = Path(__file__).resolve().parent


class WebEntryTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / 'campaign-unity'
        tools = self.root / 'Tools'
        tools.mkdir(parents=True)
        (self.root / 'Evidence').mkdir()
        shutil.copyfile(TOOLS / 'make_web_entry.py', tools / 'make_web_entry.py')
        shutil.copyfile(TOOLS / 'web-index-template.html', tools / 'web-index-template.html')

    def render(self, scene):
        build = self.root / 'Builds' / ('Web-' + scene)
        assets = build / 'Build'
        assets.mkdir(parents=True)
        (build / 'index.html').write_text('<html>Unity export</html>', encoding='utf-8')
        for suffix in ('loader.js', 'framework.js', 'data', 'wasm'):
            (assets / ('game.' + suffix)).write_bytes(b'fixture')
        subprocess.run([sys.executable, str(self.root / 'Tools/make_web_entry.py'),
                        str(build), '--scene', scene], check=True, capture_output=True)
        return (build / 'index.html').read_text(encoding='utf-8')

    def test_last_stand_return_stays_visible_above_loading_and_error(self):
        html = self.render('last-stand')
        self.assertIn('href="../#campaigns/last-stand"', html)
        self.assertIn('Return to Campaigns', html)
        self.assertIn('id="last-stand-nav"', html)
        self.assertIn('height:calc(100vh - var(--nav-height))', html)
        self.assertIn('top:var(--nav-height)', html)
        self.assertIn('id="loading"', html)
        self.assertIn('id="error"', html)
        self.assertIn('id="retry"', html)
        self.assertIn("typeof createUnityInstance !== 'function'", html)
        self.assertIn('Promise.resolve()', html)
        self.assertNotIn('e.textContent=String(message)', html)
        self.assertLess(html.index('id="last-stand-return"'), html.index('id="unity-canvas"'))

    def test_other_scene_has_no_last_stand_return(self):
        for scene in ('field', 'review', 'gallery'):
            with self.subTest(scene=scene):
                self.assertNotIn('last-stand-return', self.render(scene))


if __name__ == '__main__':
    unittest.main()
