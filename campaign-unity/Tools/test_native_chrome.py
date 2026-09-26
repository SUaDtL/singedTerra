"""Host-only tests for owned-process cleanup; these do not test Chrome rendering."""
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from native_chrome import NativeChrome

class NativeChromeLaunch(unittest.TestCase):
    def test_optional_headless_preserves_owned_command_and_focus_settings(self):
        for headless in (False, True):
            with self.subTest(headless=headless), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                executable = root / 'Google/Chrome/Application/chrome.exe'
                executable.parent.mkdir(parents=True)
                executable.write_bytes(b'controlled installed-browser fixture')
                evidence = root / 'evidence'
                evidence.mkdir()
                profile = evidence / 'isolated-chrome-profile'
                child = Mock()
                child.poll.return_value = 0
                playwright = Mock()
                browser = playwright.chromium.connect_over_cdp.return_value
                browser.contexts = [Mock()]
                commands = []

                def launch(command, **kwargs):
                    commands.append(command)
                    (profile / 'DevToolsActivePort').write_text('9321\n/controlled\n', encoding='utf-8')
                    return child

                with patch.dict('os.environ', {'ProgramFiles': str(root)}), \
                        patch('native_chrome.subprocess.Popen', side_effect=launch):
                    if headless:
                        native = NativeChrome(playwright, evidence, headless=True)
                    else:
                        native = NativeChrome(playwright, evidence)
                    native.close()
                expected = [str(executable), '--user-data-dir=' + str(profile),
                            '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
                            '--no-first-run', '--no-default-browser-check', '--window-size=1616,988']
                self.assertEqual(commands, [expected + (['--headless=new'] if headless else []) + ['about:blank']])
                playwright.chromium.connect_over_cdp.assert_called_once_with(
                    'http://127.0.0.1:9321', no_defaults=True, timeout=20000)
                browser.new_context.assert_not_called()

class NativeChromeCleanup(unittest.TestCase):
    def subject(self):
        obj=NativeChrome.__new__(NativeChrome)
        obj.browser=Mock();obj.process=Mock();obj.process.poll.return_value=0
        obj.log=Mock();obj.closed=False
        return obj
    def test_graceful_owned_close(self):
        obj=self.subject();obj.close()
        obj.browser.new_browser_cdp_session.return_value.send.assert_called_once_with('Browser.close')
        obj.process.terminate.assert_not_called();self.assertTrue(obj.closed)
        self.assertFalse(obj.forced);obj.log.close.assert_called_once()
    def test_idempotent_close(self):
        obj=self.subject();obj.close();obj.close()
        obj.process.wait.assert_called_once_with(timeout=10)
    def test_fallback_only_terminates_owned_child(self):
        obj=self.subject();obj.process.wait.side_effect=[subprocess.TimeoutExpired('owned',10),0]
        obj.browser.new_browser_cdp_session.return_value.send.side_effect=RuntimeError('endpoint closed')
        obj.close();obj.process.terminate.assert_called_once();self.assertTrue(obj.forced)
        self.assertTrue(obj.closed)
    def test_partial_launch_cleanup(self):
        obj=self.subject();obj.browser=None;obj.process=None;obj.close()
        self.assertTrue(obj.closed);obj.log.close.assert_called_once()
