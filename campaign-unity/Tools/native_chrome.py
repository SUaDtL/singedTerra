"""Owned, isolated Chrome with unmodified focus/visibility; no user profile."""
from pathlib import Path
import json, os, subprocess, tempfile, time

class NativeChrome:
    def __init__(self, playwright, evidence, headless=False):
        self.browser = None
        self.process = None
        self.log = None
        self.closed = False
        self.profile_owner = None
        self.profile_path = None
        self.profile_receipt = Path(evidence) / 'browser-profile.json'
        chrome = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        if not chrome.is_file():
            raise RuntimeError('Installed Chrome executable not found')
        try:
            # Chrome's CacheStorage index can exceed Windows path limits when the
            # profile is nested under a long evidence directory.
            self.profile_owner = tempfile.TemporaryDirectory(prefix='st-chrome-')
            self.profile_path = Path(self.profile_owner.name).resolve()
            self.profile_receipt.write_text(json.dumps({
                'path': str(self.profile_path), 'status': 'active',
                'ownership': 'temporary profile created for this Chrome process'}, indent=2),
                encoding='utf-8')
            self.log = (Path(evidence) / 'native-chrome.log').open('wb')
            command = [str(chrome), '--user-data-dir=' + str(self.profile_path),
                '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
                '--no-first-run', '--no-default-browser-check', '--window-size=1616,988']
            if headless:
                command.append('--headless=new')
            self.process = subprocess.Popen(command + ['about:blank'], stdout=self.log, stderr=subprocess.STDOUT)
            active = self.profile_path / 'DevToolsActivePort'
            end = time.monotonic() + 20
            while not active.is_file():
                if self.process.poll() is not None or time.monotonic() >= end:
                    raise RuntimeError('Owned Chrome did not expose its loopback endpoint')
                time.sleep(.05)
            port = int(active.read_text(encoding='utf-8').splitlines()[0])
            if not 1024 <= port <= 65535:
                raise RuntimeError('Invalid owned Chrome port')
            self.port = port
            self.browser = playwright.chromium.connect_over_cdp(
                'http://127.0.0.1:' + str(port), no_defaults=True, timeout=20000)
            if len(self.browser.contexts) != 1:
                raise RuntimeError('Expected one isolated default context')
            self.context = self.browser.contexts[0]
        except BaseException:
            self.close()
            raise

    def close(self):
        if self.closed:
            return
        if self.browser:
            try:
                self.browser.new_browser_cdp_session().send('Browser.close')
            except Exception:
                pass  # The endpoint may close before its reply; process exit is checked below.
            try:
                self.browser.close()
            except Exception:
                pass
        self.forced = False
        if self.process:
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.forced = True
                self.process.terminate()  # Only the child created above, never another browser.
                self.process.wait(timeout=5)
        if self.log:
            self.log.close()
        if self.profile_owner:
            target = self.profile_path.resolve()
            temp_root = Path(tempfile.gettempdir()).resolve()
            if not target.is_relative_to(temp_root) or not target.name.startswith('st-chrome-'):
                raise RuntimeError('Refusing to clean Chrome profile outside owned temporary directory')
            self.profile_owner.cleanup()
            self.profile_receipt.write_text(json.dumps({
                'path': str(target), 'status': 'removed', 'forced_browser_stop': self.forced,
                'ownership': 'temporary profile created for this Chrome process'}, indent=2),
                encoding='utf-8')
        self.closed = self.process is None or self.process.poll() is not None
