"""Host-only tests for owned-process cleanup; these do not test Chrome rendering."""
import subprocess
import unittest
from unittest.mock import Mock
from native_chrome import NativeChrome

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
