"""Owned, isolated desktop Chrome for native focus/visibility tests; no user profile."""
from pathlib import Path
import os, subprocess, time

class NativeChrome:
    def __init__(self, playwright, evidence):
        self.browser = None
        self.process = None
        self.log = None
        self.closed = False
        chrome = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        if not chrome.is_file():
            raise RuntimeError('Installed Chrome executable not found')
        profile = Path(evidence) / 'isolated-chrome-profile'
        profile.mkdir(exist_ok=False)
        self.log = (Path(evidence) / 'native-chrome.log').open('wb')
        try:
            self.process = subprocess.Popen([str(chrome), '--user-data-dir=' + str(profile),
                '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
                '--no-first-run', '--no-default-browser-check', '--window-size=1616,988',
                'about:blank'], stdout=self.log, stderr=subprocess.STDOUT)
            active = profile / 'DevToolsActivePort'
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
        self.closed = self.process is None or self.process.poll() is not None
