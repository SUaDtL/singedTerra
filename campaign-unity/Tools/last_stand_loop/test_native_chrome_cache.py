"""A long evidence path must not prevent owned Chrome from storing its cache."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import tempfile
import threading
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
sys.dont_write_bytecode = True

from native_chrome import NativeChrome


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class NativeChromeCacheTests(unittest.TestCase):
    def test_cache_put_and_match_with_long_evidence_path(self):
        from playwright.sync_api import sync_playwright

        with tempfile.TemporaryDirectory(prefix='st-chrome-cache-') as temporary:
            root = Path(temporary)
            (root / 'index.html').write_text('<!doctype html><title>Cache probe</title>', encoding='utf-8')
            evidence = root / ('e' * max(1, 110 - len(str(root)) - 1))
            evidence.mkdir()
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(root)))
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                with sync_playwright() as playwright:
                    native = NativeChrome(playwright, evidence, headless=True)
                    try:
                        page = native.context.pages[0]
                        page.goto('http://127.0.0.1:' + str(server.server_port) + '/')
                        stored = page.evaluate("""async () => {
                          const cache = await caches.open('owned-profile-check');
                          await cache.put('/asset', new Response('stored'));
                          return (await (await cache.match('/asset')).text());
                        }""")
                        self.assertEqual(stored, 'stored')
                    finally:
                        native.close()
            finally:
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
